"""Data-driven technical formula evaluation over the local daily market cache.

This module deliberately has no provider or network dependency.  A screener
evaluation is a point-in-time observation of bars already imported into
``SqliteMarketCache``; it is not a quote, forecast, trading instruction, or
backtest.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from math import isfinite
from typing import Any

import pandas as pd

from quant_research.domain.data.models import OHLCVBar
from quant_research.domain.indicators.calculator import compute_ema, compute_rsi, compute_sma
from quant_research.repositories.market_cache import SqliteMarketCache


class FormulaEvaluationStatus(StrEnum):
    """Possible outcomes for one symbol/formula evaluation."""

    MATCHED = "matched"
    NOT_MATCHED = "not_matched"
    INSUFFICIENT_HISTORY = "insufficient_history"
    UNAVAILABLE = "unavailable"


@dataclass(frozen=True, slots=True)
class FormulaEvaluation:
    """A serializable result for one local daily snapshot evaluation."""

    symbol: str
    formula_id: str
    status: FormulaEvaluationStatus
    matched: bool | None
    as_of: datetime | None
    bars_used: int
    metrics: dict[str, float]
    message: str


@dataclass(frozen=True, slots=True)
class FormulaDefinition:
    """Registry metadata and implementation for a formula ID.

    Formula selection is performed through this registry rather than a UI
    switch or a monolithic evaluator conditional.  The catalog service can
    use the same IDs and append metadata without changing frontend code.
    """

    formula_id: str
    description: str
    minimum_bars: int
    evaluator: Callable[[pd.DataFrame, Mapping[str, Any]], tuple[bool, dict[str, float], str]]


class UnknownFormulaError(ValueError):
    """Raised when a caller requests a formula that is not registered."""


class InvalidFormulaParameterError(ValueError):
    """Raised when a formula parameter is missing or outside safe bounds."""


class _InsufficientHistoryError(ValueError):
    def __init__(self, required: int, available: int) -> None:
        self.required = required
        self.available = available
        super().__init__(f"Formula requires at least {required} bars; only {available} local bars are available.")


_DEFAULT_END = datetime(2099, 12, 31, 23, 59, 59, tzinfo=UTC)


def _positive_int(parameters: Mapping[str, Any], name: str, default: int, *, minimum: int = 1) -> int:
    value = parameters.get(name, default)
    if isinstance(value, bool):
        raise InvalidFormulaParameterError(f"{name} must be an integer")
    try:
        integer = int(value)
    except (TypeError, ValueError) as exc:
        raise InvalidFormulaParameterError(f"{name} must be an integer") from exc
    if integer < minimum:
        raise InvalidFormulaParameterError(f"{name} must be at least {minimum}")
    return integer


def _finite_float(parameters: Mapping[str, Any], name: str, default: float, *, minimum: float | None = None, maximum: float | None = None) -> float:
    value = parameters.get(name, default)
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise InvalidFormulaParameterError(f"{name} must be a number") from exc
    if not isfinite(number):
        raise InvalidFormulaParameterError(f"{name} must be finite")
    if minimum is not None and number < minimum:
        raise InvalidFormulaParameterError(f"{name} must be at least {minimum}")
    if maximum is not None and number > maximum:
        raise InvalidFormulaParameterError(f"{name} must be at most {maximum}")
    return number


def _require_history(frame: pd.DataFrame, required: int) -> None:
    if len(frame) < required:
        raise _InsufficientHistoryError(required, len(frame))


def _last(frame: pd.DataFrame, column: str) -> float:
    value = frame[column].iloc[-1]
    if pd.isna(value):
        raise _InsufficientHistoryError(len(frame) + 1, len(frame))
    return float(value)


def _previous(frame: pd.DataFrame, column: str) -> float:
    value = frame[column].iloc[-2]
    if pd.isna(value):
        raise _InsufficientHistoryError(len(frame) + 1, len(frame))
    return float(value)


def _moving_average_crossover(frame: pd.DataFrame, parameters: Mapping[str, Any], *, exponential: bool, upward: bool) -> tuple[bool, dict[str, float], str]:
    fast_window = _positive_int(parameters, "fast_window", 20)
    slow_window = _positive_int(parameters, "slow_window", 50)
    if fast_window >= slow_window:
        raise InvalidFormulaParameterError("fast_window must be smaller than slow_window")
    _require_history(frame, slow_window + 1)

    average = compute_ema if exponential else compute_sma
    fast = average(frame["close"], fast_window)
    slow = average(frame["close"], slow_window)
    current_fast = _last(pd.DataFrame({"value": fast}), "value")
    current_slow = _last(pd.DataFrame({"value": slow}), "value")
    previous_fast = _previous(pd.DataFrame({"value": fast}), "value")
    previous_slow = _previous(pd.DataFrame({"value": slow}), "value")

    if upward:
        matched = current_fast > current_slow and previous_fast <= previous_slow
        direction = "above"
    else:
        matched = current_fast < current_slow and previous_fast >= previous_slow
        direction = "below"
    kind = "EMA" if exponential else "SMA"
    metrics = {
        "close": _last(frame, "close"),
        "fast_average": current_fast,
        "slow_average": current_slow,
        "fast_window": float(fast_window),
        "slow_window": float(slow_window),
    }
    return matched, metrics, f"{kind}({fast_window}) crossed {direction} {kind}({slow_window}) on the latest local bar."


def _price_above_sma(frame: pd.DataFrame, parameters: Mapping[str, Any]) -> tuple[bool, dict[str, float], str]:
    window = _positive_int(parameters, "window", 20)
    _require_history(frame, window)
    sma = _last(pd.DataFrame({"value": compute_sma(frame["close"], window)}), "value")
    close = _last(frame, "close")
    return close > sma, {"close": close, "sma": sma, "window": float(window)}, f"Close is {'above' if close > sma else 'not above'} the {window}-bar SMA."


def _rsi_condition(frame: pd.DataFrame, parameters: Mapping[str, Any], *, overbought: bool) -> tuple[bool, dict[str, float], str]:
    period = _positive_int(parameters, "period", 14)
    _require_history(frame, period + 1)
    rsi = compute_rsi(frame["close"], period)
    value = _last(pd.DataFrame({"value": rsi}), "value")
    default_threshold = 70.0 if overbought else 30.0
    threshold = _finite_float(parameters, "threshold", default_threshold, minimum=0.0, maximum=100.0)
    matched = value >= threshold if overbought else value <= threshold
    condition = "at or above" if overbought else "at or below"
    return matched, {"rsi": value, "threshold": threshold, "period": float(period)}, f"RSI({period}) is {condition} {threshold:g}."


def _momentum(frame: pd.DataFrame, parameters: Mapping[str, Any]) -> tuple[bool, dict[str, float], str]:
    window = _positive_int(parameters, "window", 21)
    _require_history(frame, window + 1)
    current = _last(frame, "close")
    previous = float(frame["close"].iloc[-window - 1])
    if previous <= 0:
        raise InvalidFormulaParameterError("Historical close must be positive")
    return_pct = ((current / previous) - 1.0) * 100.0
    minimum_return = _finite_float(parameters, "minimum_return_pct", 0.0, minimum=-100.0, maximum=10000.0)
    return return_pct >= minimum_return, {"close": current, "reference_close": previous, "return_pct": return_pct, "window": float(window)}, f"{window}-bar price return is {return_pct:.2f}%."


def _rvol(frame: pd.DataFrame, parameters: Mapping[str, Any]) -> tuple[bool, dict[str, float], str]:
    window = _positive_int(parameters, "window", 20)
    _require_history(frame, window + 1)
    current_volume = _last(frame, "volume")
    baseline = frame["volume"].iloc[-window - 1 : -1].mean()
    if pd.isna(baseline) or float(baseline) <= 0:
        raise InvalidFormulaParameterError("Local volume baseline is zero; RVOL is unavailable")
    rvol = current_volume / float(baseline)
    threshold = _finite_float(parameters, "threshold", 1.5, minimum=0.0, maximum=100.0)
    return rvol >= threshold, {"volume": current_volume, "average_volume": float(baseline), "rvol": float(rvol), "window": float(window), "threshold": threshold}, f"Latest volume is {rvol:.2f}x the preceding {window}-bar average."


def _breakout(frame: pd.DataFrame, parameters: Mapping[str, Any], *, high_breakout: bool) -> tuple[bool, dict[str, float], str]:
    window = _positive_int(parameters, "window", 20)
    _require_history(frame, window + 1)
    prior = frame["high" if high_breakout else "low"].iloc[:-1].rolling(window=window, min_periods=window).max() if high_breakout else frame["low"].iloc[:-1].rolling(window=window, min_periods=window).min()
    reference = prior.iloc[-1]
    if pd.isna(reference):
        raise _InsufficientHistoryError(window + 1, len(frame))
    close = _last(frame, "close")
    reference_value = float(reference)
    matched = close > reference_value if high_breakout else close < reference_value
    label = "high" if high_breakout else "low"
    operator = "above" if high_breakout else "below"
    return matched, {"close": close, "prior_period_extreme": reference_value, "window": float(window)}, f"Close is {operator} the prior {window}-bar {label} ({reference_value:.2f})."


def _near_52_week(frame: pd.DataFrame, parameters: Mapping[str, Any], *, high_target: bool) -> tuple[bool, dict[str, float], str]:
    threshold = _finite_float(parameters, "threshold_pct", 5.0, minimum=0.0, maximum=100.0)
    _require_history(frame, 253)
    prior_values = frame["high" if high_target else "low"].iloc[:-1].rolling(window=252, min_periods=252)
    extreme = prior_values.max().iloc[-1] if high_target else prior_values.min().iloc[-1]
    if pd.isna(extreme):
        raise _InsufficientHistoryError(253, len(frame))
    close = _last(frame, "close")
    extreme_value = float(extreme)
    distance_pct = ((extreme_value - close) / extreme_value) * 100.0 if high_target else ((close - extreme_value) / extreme_value) * 100.0
    matched = distance_pct <= threshold
    label = "high" if high_target else "low"
    return matched, {"close": close, "prior_52_week_extreme": extreme_value, "distance_pct": distance_pct, "threshold_pct": threshold}, f"Close is {distance_pct:.2f}% from the prior 52-week {label}."


def _candlestick(frame: pd.DataFrame, parameters: Mapping[str, Any], *, pattern: str) -> tuple[bool, dict[str, float], str]:
    del parameters
    _require_history(frame, 2)
    previous = frame.iloc[-2]
    current = frame.iloc[-1]
    previous_open, previous_close = float(previous["open"]), float(previous["close"])
    current_open, current_close = float(current["open"]), float(current["close"])
    current_high, current_low = float(current["high"]), float(current["low"])
    body = abs(current_close - current_open)
    candle_range = current_high - current_low
    upper_shadow = current_high - max(current_open, current_close)
    lower_shadow = min(current_open, current_close) - current_low
    if candle_range <= 0:
        return False, {"body": body, "range": candle_range}, "Latest candle has no positive range."

    if pattern == "bullish_engulfing":
        matched = previous_close < previous_open and current_close > current_open and current_open <= previous_close and current_close >= previous_open
    elif pattern == "bearish_engulfing":
        matched = previous_close > previous_open and current_close < current_open and current_open >= previous_close and current_close <= previous_open
    elif pattern == "hammer":
        matched = body > 0 and body <= candle_range * 0.35 and lower_shadow >= body * 2 and upper_shadow <= body
    elif pattern == "shooting_star":
        matched = body > 0 and body <= candle_range * 0.35 and upper_shadow >= body * 2 and lower_shadow <= body
    else:  # pragma: no cover - registry construction prevents this path.
        raise UnknownFormulaError(f"Unsupported candlestick pattern '{pattern}'")
    metrics = {"body": body, "range": candle_range, "upper_shadow": upper_shadow, "lower_shadow": lower_shadow}
    return matched, metrics, f"Latest two-bar sequence {'matches' if matched else 'does not match'} {pattern.replace('_', ' ')}."


def _vcp_contraction(frame: pd.DataFrame, parameters: Mapping[str, Any]) -> tuple[bool, dict[str, float], str]:
    window = _positive_int(parameters, "window", 20)
    _require_history(frame, window)
    close = _last(frame, "close")
    high = float(frame["high"].iloc[-window:].max())
    low = float(frame["low"].iloc[-window:].min())
    range_pct = ((high - low) / close) * 100.0 if close > 0 else 0.0
    max_range = _finite_float(parameters, "max_range_pct", 11.0, minimum=0.0, maximum=100.0)
    sma = _last(pd.DataFrame({"value": compute_sma(frame["close"], window)}), "value")
    matched = range_pct <= max_range and close >= sma
    return matched, {"close": close, "range_pct": range_pct, "sma": sma, "window": float(window), "max_range_pct": max_range}, f"The latest {window}-bar range is {range_pct:.2f}% and price is {'above' if close >= sma else 'below'} its SMA."


def _sma_rebound(frame: pd.DataFrame, parameters: Mapping[str, Any]) -> tuple[bool, dict[str, float], str]:
    window = _positive_int(parameters, "window", 20)
    volume_window = _positive_int(parameters, "volume_window", 20)
    rvol_threshold = _finite_float(parameters, "rvol_threshold", 1.4, minimum=0.0, maximum=100.0)
    _require_history(frame, max(window, volume_window) + 1)
    sma = compute_sma(frame["close"], window)
    current_close, previous_close = _last(frame, "close"), _previous(frame, "close")
    current_sma, previous_sma = _last(pd.DataFrame({"value": sma}), "value"), _previous(pd.DataFrame({"value": sma}), "value")
    volume_baseline = float(frame["volume"].iloc[-volume_window - 1 : -1].mean())
    if volume_baseline <= 0:
        raise InvalidFormulaParameterError("Local volume baseline is zero; RVOL is unavailable")
    rvol = _last(frame, "volume") / volume_baseline
    matched = previous_close < previous_sma and current_close >= current_sma and rvol >= rvol_threshold
    return matched, {"close": current_close, "sma": current_sma, "rvol": rvol, "rvol_threshold": rvol_threshold, "window": float(window)}, "Price crossed above its SMA with volume confirmation."


def _rsi_momentum_surge(frame: pd.DataFrame, parameters: Mapping[str, Any]) -> tuple[bool, dict[str, float], str]:
    period = _positive_int(parameters, "period", 14)
    volume_window = _positive_int(parameters, "volume_window", 20)
    _require_history(frame, max(period + 1, volume_window + 1))
    rsi = compute_rsi(frame["close"], period)
    current_rsi = _last(pd.DataFrame({"value": rsi}), "value")
    previous_rsi = _previous(pd.DataFrame({"value": rsi}), "value")
    current_threshold = _finite_float(parameters, "threshold", 62.0, minimum=0.0, maximum=100.0)
    previous_threshold = _finite_float(parameters, "previous_threshold", 55.0, minimum=0.0, maximum=100.0)
    baseline = float(frame["volume"].iloc[-volume_window - 1 : -1].mean())
    if baseline <= 0:
        raise InvalidFormulaParameterError("Local volume baseline is zero; RVOL is unavailable")
    rvol = _last(frame, "volume") / baseline
    rvol_threshold = _finite_float(parameters, "rvol_threshold", 1.3, minimum=0.0, maximum=100.0)
    matched = current_rsi >= current_threshold and previous_rsi < previous_threshold and rvol >= rvol_threshold
    return matched, {"rsi": current_rsi, "previous_rsi": previous_rsi, "rvol": rvol, "threshold": current_threshold}, "RSI expanded with volume confirmation."


def _definition(formula_id: str, description: str, minimum_bars: int, evaluator: Callable[[pd.DataFrame, Mapping[str, Any]], tuple[bool, dict[str, float], str]]) -> FormulaDefinition:
    return FormulaDefinition(formula_id, description, minimum_bars, evaluator)


FORMULA_REGISTRY: dict[str, FormulaDefinition] = {
    "sma_golden_cross": _definition("sma_golden_cross", "Fast SMA crosses above slow SMA.", 51, lambda f, p: _moving_average_crossover(f, p, exponential=False, upward=True)),
    "sma_death_cross": _definition("sma_death_cross", "Fast SMA crosses below slow SMA.", 51, lambda f, p: _moving_average_crossover(f, p, exponential=False, upward=False)),
    "ema_golden_cross": _definition("ema_golden_cross", "Fast EMA crosses above slow EMA.", 51, lambda f, p: _moving_average_crossover(f, p, exponential=True, upward=True)),
    "ema_death_cross": _definition("ema_death_cross", "Fast EMA crosses below slow EMA.", 51, lambda f, p: _moving_average_crossover(f, p, exponential=True, upward=False)),
    "price_above_sma": _definition("price_above_sma", "Latest close is above its moving average.", 20, _price_above_sma),
    "rsi_overbought": _definition("rsi_overbought", "RSI is at or above the overbought threshold.", 15, lambda f, p: _rsi_condition(f, p, overbought=True)),
    "rsi_oversold": _definition("rsi_oversold", "RSI is at or below the oversold threshold.", 15, lambda f, p: _rsi_condition(f, p, overbought=False)),
    "momentum": _definition("momentum", "Price return over a configurable lookback is above a threshold.", 22, _momentum),
    "momentum_1m": _definition("momentum_1m", "Positive one-month price momentum.", 22, lambda f, p: _momentum(f, {**p, "window": p.get("window", 21)})),
    "momentum_3m": _definition("momentum_3m", "Positive three-month price momentum.", 64, lambda f, p: _momentum(f, {**p, "window": p.get("window", 63)})),
    "high_volume": _definition("high_volume", "Latest volume exceeds its preceding average by a multiplier.", 21, _rvol),
    "rvol_surge": _definition("rvol_surge", "Relative volume is above the configured threshold.", 21, _rvol),
    "breakout_1w_high": _definition("breakout_1w_high", "Close breaks above the prior five-bar high.", 6, lambda f, p: _breakout(f, {**p, "window": p.get("window", 5)}, high_breakout=True)),
    "breakout_1w_low": _definition("breakout_1w_low", "Close breaks below the prior five-bar low.", 6, lambda f, p: _breakout(f, {**p, "window": p.get("window", 5)}, high_breakout=False)),
    "breakout_4w_high": _definition("breakout_4w_high", "Close breaks above the prior twenty-bar high.", 21, lambda f, p: _breakout(f, {**p, "window": p.get("window", 20)}, high_breakout=True)),
    "breakout_4w_low": _definition("breakout_4w_low", "Close breaks below the prior twenty-bar low.", 21, lambda f, p: _breakout(f, {**p, "window": p.get("window", 20)}, high_breakout=False)),
    "breakout_52w_high": _definition("breakout_52w_high", "Close breaks above the prior 252-bar high.", 253, lambda f, p: _breakout(f, {**p, "window": p.get("window", 252)}, high_breakout=True)),
    "breakout_52w_low": _definition("breakout_52w_low", "Close breaks below the prior 252-bar low.", 253, lambda f, p: _breakout(f, {**p, "window": p.get("window", 252)}, high_breakout=False)),
    "near_52w_high": _definition("near_52w_high", "Close is within a threshold of the prior 52-week high.", 253, lambda f, p: _near_52_week(f, p, high_target=True)),
    "near_52w_low": _definition("near_52w_low", "Close is within a threshold of the prior 52-week low.", 253, lambda f, p: _near_52_week(f, p, high_target=False)),
    "bullish_engulfing": _definition("bullish_engulfing", "Latest two bars form a bullish engulfing pattern.", 2, lambda f, p: _candlestick(f, p, pattern="bullish_engulfing")),
    "bearish_engulfing": _definition("bearish_engulfing", "Latest two bars form a bearish engulfing pattern.", 2, lambda f, p: _candlestick(f, p, pattern="bearish_engulfing")),
    "hammer": _definition("hammer", "Latest bar has a hammer-shaped candle body and wick.", 2, lambda f, p: _candlestick(f, p, pattern="hammer")),
    "shooting_star": _definition("shooting_star", "Latest bar has a shooting-star-shaped candle body and wick.", 2, lambda f, p: _candlestick(f, p, pattern="shooting_star")),
    "vcp_contraction": _definition("vcp_contraction", "Recent range is contracted and price holds above its SMA.", 20, _vcp_contraction),
    "sma_rebound": _definition("sma_rebound", "Price crosses above its SMA with relative-volume confirmation.", 21, _sma_rebound),
    "rsi_momentum_surge": _definition("rsi_momentum_surge", "RSI expands through a momentum threshold with relative-volume confirmation.", 21, _rsi_momentum_surge),
}


def register_formula(definition: FormulaDefinition, *, replace: bool = False) -> None:
    """Register an appendable formula implementation for catalog integration."""

    if not definition.formula_id or not definition.formula_id.strip():
        raise ValueError("Formula ID cannot be empty")
    if definition.formula_id in FORMULA_REGISTRY and not replace:
        raise ValueError(f"Formula '{definition.formula_id}' is already registered")
    FORMULA_REGISTRY[definition.formula_id] = definition


def get_formula_definition(formula_id: str) -> FormulaDefinition:
    """Return a formula definition or raise an actionable unknown-ID error."""

    normalized = formula_id.strip().lower()
    try:
        return FORMULA_REGISTRY[normalized]
    except KeyError as exc:
        raise UnknownFormulaError(f"Unknown screener formula '{formula_id}'. Available formulas: {', '.join(sorted(FORMULA_REGISTRY))}") from exc


class ScreenerEngineService:
    """Evaluate registered formulas using only local ``1day`` SQLite bars."""

    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    @staticmethod
    def list_formulas() -> tuple[FormulaDefinition, ...]:
        return tuple(FORMULA_REGISTRY[key] for key in sorted(FORMULA_REGISTRY))

    def evaluate(
        self,
        symbol: str,
        formula_id: str,
        parameters: Mapping[str, Any] | None = None,
        *,
        end: datetime | None = None,
        timeframe: str = "1day",
    ) -> FormulaEvaluation:
        """Evaluate the latest locally cached bar at or before ``end``.

        ``end`` is a historical observation cutoff, not a request for a
        remote quote.  Missing bars and insufficient lookback are returned as
        explicit states so callers never need to infer them from zero values.
        """

        clean_symbol = symbol.strip().upper().removesuffix(".NS")
        definition = get_formula_definition(formula_id)
        normalized_id = definition.formula_id
        if not clean_symbol:
            raise ValueError("Symbol cannot be empty")
        if timeframe != "1day":
            return FormulaEvaluation(clean_symbol, normalized_id, FormulaEvaluationStatus.UNAVAILABLE, None, None, 0, {}, "Only local 1day NSE bars are supported by the screener engine.")

        bars = self._cache.get(clean_symbol, timeframe, end=end or _DEFAULT_END)
        bars = _sorted_unique_bars(bars)
        if not bars:
            return FormulaEvaluation(clean_symbol, normalized_id, FormulaEvaluationStatus.UNAVAILABLE, None, None, 0, {}, "No local daily OHLCV bars are available. Import the requested NSE archive days first.")

        if len(bars) < definition.minimum_bars:
            return FormulaEvaluation(clean_symbol, normalized_id, FormulaEvaluationStatus.INSUFFICIENT_HISTORY, None, bars[-1].timestamp, len(bars), {}, f"{definition.description} Requires at least {definition.minimum_bars} local daily bars; {len(bars)} are available.")

        frame = _bars_to_frame(bars)
        try:
            matched, metrics, message = definition.evaluator(frame, parameters or {})
        except _InsufficientHistoryError as exc:
            return FormulaEvaluation(clean_symbol, normalized_id, FormulaEvaluationStatus.INSUFFICIENT_HISTORY, None, bars[-1].timestamp, len(bars), {}, str(exc))
        except InvalidFormulaParameterError:
            raise

        status = FormulaEvaluationStatus.MATCHED if matched else FormulaEvaluationStatus.NOT_MATCHED
        return FormulaEvaluation(clean_symbol, normalized_id, status, matched, bars[-1].timestamp, len(bars), metrics, message)

    def evaluate_many(
        self,
        symbols: Iterable[str],
        formula_id: str,
        parameters: Mapping[str, Any] | None = None,
        *,
        end: datetime | None = None,
        timeframe: str = "1day",
    ) -> list[FormulaEvaluation]:
        """Evaluate a formula for each requested symbol in deterministic order."""

        definition = get_formula_definition(formula_id)
        return [self.evaluate(symbol, definition.formula_id, parameters, end=end, timeframe=timeframe) for symbol in sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})]


def _sorted_unique_bars(bars: Iterable[OHLCVBar]) -> list[OHLCVBar]:
    by_timestamp = {bar.timestamp: bar for bar in bars}
    return [by_timestamp[timestamp] for timestamp in sorted(by_timestamp)]


def _bars_to_frame(bars: list[OHLCVBar]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {"timestamp": bar.timestamp, "open": bar.open, "high": bar.high, "low": bar.low, "close": bar.close, "volume": bar.volume}
            for bar in bars
        ]
    )
