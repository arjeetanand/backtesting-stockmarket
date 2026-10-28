"""Transparent single-symbol technical context and historical rule test."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from math import floor
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pandas as pd

from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache

logger = logging.getLogger(__name__)

ARTIFACT_KIND = "stock_analysis_run"
MIN_HISTORY_BARS = 221
MIN_HISTORY_DAYS = 365 * 5
MIN_OOS_TRADES = 30
MIN_WIN_RATE_PCT = 70.0
ENTRY_SLIPPAGE = 0.001
EXIT_SLIPPAGE = 0.001
STT_RATE = 0.001
STAMP_DUTY_BUY_RATE = 0.00015
SEBI_TURNOVER_RATE = 0.000001
STOP_ATR_MULTIPLE = 2.0
TARGET_R_MULTIPLE = 2.0
MAX_HOLD_SESSIONS = 20
NSE_MARKET_OPEN = time(9, 15)
INDIA_TZ = ZoneInfo("Asia/Kolkata")
# shortcut: bundled official 2026 equities calendar; refresh from NSE before supporting 2027 signals.
NSE_EQUITY_HOLIDAYS_2026 = frozenset(
    date.fromisoformat(day)
    for day in (
        "2026-01-15", "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31",
        "2026-04-03", "2026-04-14", "2026-05-01", "2026-05-28", "2026-06-26",
        "2026-09-14", "2026-10-02", "2026-10-20", "2026-11-10", "2026-11-24",
        "2026-12-25",
    )
)
NSE_SPECIAL_SESSIONS_2026 = frozenset({date(2026, 11, 8)})


def _next_nse_session(signal_date: date) -> date | None:
    if signal_date.year != 2026:
        return None
    session = signal_date + timedelta(days=1)
    while session.year == 2026 and (
        (session.weekday() >= 5 and session not in NSE_SPECIAL_SESSIONS_2026)
        or session in NSE_EQUITY_HOLIDAYS_2026
    ):
        session += timedelta(days=1)
    return session if session.year == 2026 else None


def _entry_window_is_open(signal_date: date, now: datetime) -> bool:
    session = _next_nse_session(signal_date)
    if session is None or session in NSE_SPECIAL_SESSIONS_2026:
        return False
    local_now = now.astimezone(INDIA_TZ)
    if signal_date > local_now.date():
        return False
    if local_now.date() < session:
        return True
    return local_now.date() == session and local_now.time().replace(tzinfo=None) < NSE_MARKET_OPEN


@dataclass(slots=True)
class _Position:
    signal_date: str
    entry_date: str
    entry_price: float
    entry_cost_per_share: float
    cash_at_entry: float
    units: int
    entry_atr: float
    stop: float
    target: float
    bars_held: int = 0
    exit_next_open: bool = False


def _price_return(close: pd.Series, sessions: int) -> float | None:
    if len(close) <= sessions:
        return None
    previous = float(close.iloc[-sessions - 1])
    current = float(close.iloc[-1])
    return (current / previous - 1.0) * 100.0 if previous > 0 else None


def _add_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    close = frame["close"]
    high = frame["high"]
    low = frame["low"]
    volume = frame["volume"]
    frame["sma20"] = close.rolling(20, min_periods=20).mean()
    frame["sma50"] = close.rolling(50, min_periods=50).mean()
    frame["sma200"] = close.rolling(200, min_periods=200).mean()
    changes = close.diff()
    gains = changes.clip(lower=0)
    losses = -changes.clip(upper=0)
    average_gain = pd.Series([float("nan")] * len(frame), index=frame.index)
    average_loss = pd.Series([float("nan")] * len(frame), index=frame.index)
    if len(frame) >= 15:
        average_gain.iloc[14] = float(gains.iloc[1:15].mean())
        average_loss.iloc[14] = float(losses.iloc[1:15].mean())
        for index in range(15, len(frame)):
            average_gain.iloc[index] = (average_gain.iloc[index - 1] * 13 + float(gains.iloc[index])) / 14
            average_loss.iloc[index] = (average_loss.iloc[index - 1] * 13 + float(losses.iloc[index])) / 14
    relative_strength = average_gain / average_loss.replace(0, float("nan"))
    frame["rsi14"] = (100 - 100 / (1 + relative_strength)).where(average_loss.ne(0), 100.0)
    frame.loc[average_gain.eq(0) & average_loss.eq(0), "rsi14"] = 50.0

    ema_fast = close.ewm(span=12, min_periods=12, adjust=False).mean()
    ema_slow = close.ewm(span=26, min_periods=26, adjust=False).mean()
    frame["macd"] = ema_fast - ema_slow
    frame["macd_signal"] = frame["macd"].ewm(span=9, min_periods=9, adjust=False).mean()
    frame["macd_histogram"] = frame["macd"] - frame["macd_signal"]

    previous_close = close.shift(1)
    true_range = pd.concat(
        [(high - low), (high - previous_close).abs(), (low - previous_close).abs()], axis=1
    ).max(axis=1)
    true_range.iloc[0] = float("nan")
    atr_values = [float("nan")] * len(frame)
    if len(frame) >= 15:
        atr_values[14] = float(true_range.iloc[1:15].mean())
        for index in range(15, len(frame)):
            atr_values[index] = (atr_values[index - 1] * 13 + float(true_range.iloc[index])) / 14
    frame["atr14"] = atr_values
    frame["prior20_high"] = high.shift(1).rolling(20, min_periods=20).max()
    frame["prior20_low"] = low.shift(1).rolling(20, min_periods=20).min()
    frame["prior20_volume"] = volume.shift(1).rolling(20, min_periods=20).mean()
    frame["entry_signal"] = (
        (close > frame["prior20_high"])
        & (close > frame["sma50"])
        & (frame["sma50"] > frame["sma200"])
        & (volume > frame["prior20_volume"])
        & frame["atr14"].notna()
    )
    return frame


def _value(row: pd.Series, key: str) -> float | None:
    value = row.get(key)
    if value is None or pd.isna(value):
        return None
    return float(value)


def _simulate_period(frame: pd.DataFrame, start_index: int, end_index: int) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rows = frame.to_dict(orient="records")
    equity = 100_000.0
    peak = equity
    max_drawdown = 0.0
    position: _Position | None = None
    pending_entry: tuple[str, float] | None = None
    trades: list[dict[str, Any]] = []
    equity_points: list[float] = []
    active_bars = 0

    def close_position(index: int, raw_price: float, reason: str) -> None:
        nonlocal equity, position
        if position is None:
            return
        exit_price = raw_price * (1.0 - EXIT_SLIPPAGE)
        exit_cost_rate = STT_RATE + SEBI_TURNOVER_RATE
        proceeds_per_share = exit_price * (1.0 - exit_cost_rate)
        pnl_per_share = proceeds_per_share - position.entry_cost_per_share
        return_pct = pnl_per_share / position.entry_cost_per_share * 100.0
        net_pnl = position.units * pnl_per_share
        equity = position.cash_at_entry + position.units * proceeds_per_share
        trades.append(
            {
                "signal_date": position.signal_date,
                "entry_date": position.entry_date,
                "exit_date": str(pd.Timestamp(rows[index]["timestamp"]).date()),
                "entry_price": position.entry_price,
                "exit_price": exit_price,
                "net_pnl": net_pnl,
                "net_pnl_per_share": pnl_per_share,
                "net_return_pct": return_pct,
                "outcome": "win" if return_pct > 0 else "loss" if return_pct < 0 else "flat",
                "exit_reason": reason,
                "bars_held": position.bars_held,
            }
        )
        position = None

    for index in range(max(start_index, 200), end_index):
        row = rows[index]
        day_open = float(row["open"])
        exited_today = False

        if position is not None:
            position.bars_held += 1
            if day_open <= position.stop:
                close_position(index, day_open, "stop_gap")
            elif position.exit_next_open:
                close_position(index, day_open, "sma50_or_time_exit")
            elif day_open >= position.target:
                close_position(index, position.target, "2r_target")
            elif float(row["low"]) <= position.stop:
                close_position(index, position.stop, "stop")
            elif float(row["high"]) >= position.target:
                close_position(index, position.target, "2r_target")
            if position is None:
                exited_today = True

        if position is None and pending_entry is not None and not exited_today:
            signal_date, atr_at_signal = pending_entry
            pending_entry = None
            entry_price = day_open * (1.0 + ENTRY_SLIPPAGE)
            entry_cost_rate = STT_RATE + STAMP_DUTY_BUY_RATE + SEBI_TURNOVER_RATE
            entry_cost_per_share = entry_price * (1.0 + entry_cost_rate)
            units = floor(equity / entry_cost_per_share)
            if units > 0:
                position = _Position(
                    signal_date=signal_date,
                    entry_date=str(pd.Timestamp(row["timestamp"]).date()),
                    entry_price=entry_price,
                    entry_cost_per_share=entry_cost_per_share,
                    cash_at_entry=equity - units * entry_cost_per_share,
                    units=units,
                    entry_atr=atr_at_signal,
                    stop=entry_price - STOP_ATR_MULTIPLE * atr_at_signal,
                    target=entry_price + STOP_ATR_MULTIPLE * TARGET_R_MULTIPLE * atr_at_signal,
                )
                position.bars_held = 1
                if float(row["low"]) <= position.stop:
                    close_position(index, position.stop, "stop")
                elif float(row["high"]) >= position.target:
                    close_position(index, position.target, "2r_target")
                if position is None:
                    exited_today = True

        if position is not None:
            active_bars += 1
            equity = position.cash_at_entry + position.units * float(row["close"]) * (1.0 - EXIT_SLIPPAGE) * (1.0 - STT_RATE - SEBI_TURNOVER_RATE)
            sma50 = row.get("sma50")
            position.exit_next_open = (
                (sma50 is not None and not pd.isna(sma50) and float(row["close"]) < float(sma50))
                or position.bars_held >= MAX_HOLD_SESSIONS
            )
        elif position is None and not exited_today and index + 1 < end_index and bool(row["entry_signal"]):
            atr = row.get("atr14")
            if atr is not None and not pd.isna(atr):
                pending_entry = (str(pd.Timestamp(row["timestamp"]).date()), float(atr))

        equity_points.append(equity)
        peak = max(peak, equity)
        max_drawdown = min(max_drawdown, equity / peak - 1.0)

    if position is not None and end_index > start_index:
        close_position(end_index - 1, float(rows[end_index - 1]["close"]), "end_of_test_window")
        if equity_points:
            equity_points[-1] = equity

    wins = sum(trade["outcome"] == "win" for trade in trades)
    losses = sum(trade["outcome"] == "loss" for trade in trades)
    flats = sum(trade["outcome"] == "flat" for trade in trades)
    returns = [float(trade["net_return_pct"]) for trade in trades]
    signal_occurrences = sum(bool(rows[index]["entry_signal"]) for index in range(max(start_index, 200), end_index))
    gross_wins = sum(float(trade["net_pnl"]) for trade in trades if trade["net_pnl"] > 0)
    gross_losses = abs(sum(float(trade["net_pnl"]) for trade in trades if trade["net_pnl"] < 0))
    metrics = {
        "trades": len(trades),
        "signal_occurrences": signal_occurrences,
        "wins": wins,
        "losses": losses,
        "flats": flats,
        "win_rate_pct": wins / len(trades) * 100.0 if trades else 0.0,
        "expectancy_pct": sum(returns) / len(returns) if returns else 0.0,
        "profit_factor": gross_wins / gross_losses if gross_losses > 0 else None,
        "total_return_pct": (equity / 100_000.0 - 1.0) * 100.0,
        "max_drawdown_pct": max_drawdown * 100.0,
        "active_bars": active_bars,
    }
    return metrics, trades


class StockResearchService:
    """Build a fixed-rule, append-only local analysis record for each request."""

    def __init__(self, cache: SqliteMarketCache, artifacts: SqliteArtifactStore) -> None:
        self._cache = cache
        self._artifacts = artifacts

    def scan_morning(self) -> dict[str, Any]:
        """Backtest the fixed rule across the local NIFTY 50 list and keep only fresh, qualified signals."""
        from quant_research.services.market_scanner import NIFTY50_AS_OF, NIFTY50_SYMBOLS

        scan_id = uuid4().hex
        started_at = datetime.now(UTC)
        symbols = sorted(NIFTY50_SYMBOLS)
        try:
            instruments = {item.symbol: item for item in self._cache.search_instruments(limit=2_000)}
        except Exception:
            logger.exception("Could not load the NSE catalogue for morning scan %s", scan_id)
            instruments = {}

        counts = {
            "symbols_scanned": len(symbols),
            "symbols_with_data": 0,
            "completed_runs": 0,
            "analysis_errors": 0,
            "insufficient_history": 0,
            "missing_data": 0,
            "passed_backtests": 0,
            "failed_backtests": 0,
            "not_evaluable": 0,
            "stale_setups": 0,
            "fresh_signals": 0,
        }
        latest_dates: list[str] = []
        candidates: list[dict[str, Any]] = []

        for symbol in symbols:
            instrument = instruments.get(symbol)
            try:
                result = self.run(symbol, instrument.company_name if instrument else None, include_chart=False)
            except Exception as exc:
                counts["analysis_errors"] += 1
                counts["not_evaluable"] += 1
                logger.warning("Morning scan %s could not analyze %s: %s", scan_id, symbol, type(exc).__name__)
                continue

            if result["data_as_of"]:
                latest_dates.append(result["data_as_of"])
                counts["symbols_with_data"] += 1
            if result["bar_count"] == 0:
                counts["missing_data"] += 1
            if result["run_status"] == "completed":
                counts["completed_runs"] += 1
            else:
                if result["run_status"] == "failed":
                    counts["analysis_errors"] += 1
                elif result["bar_count"] > 0:
                    counts["insufficient_history"] += 1

            gate_status = result["validation_gate"]["status"]
            if gate_status == "passed":
                counts["passed_backtests"] += 1
            elif gate_status == "failed":
                counts["failed_backtests"] += 1
            else:
                counts["not_evaluable"] += 1

            setup = result.get("setup")
            if setup and setup["status"] == "stale_data":
                counts["stale_setups"] += 1
            if not setup or setup["status"] != "triggered":
                continue
            counts["fresh_signals"] += 1
            metrics = result.get("out_of_sample_metrics") or {}
            if gate_status != "passed":
                continue

            candidates.append(
                {
                    "run_id": result["run_id"],
                    "symbol": symbol,
                    "company_name": result.get("company_name") or symbol,
                    "data_as_of": result["data_as_of"],
                    "history_years": result["history_years"],
                    "technical": result["technical"],
                    "setup": setup,
                    "out_of_sample_metrics": metrics,
                }
            )

        candidates.sort(
            key=lambda item: (
                item["out_of_sample_metrics"]["win_rate_pct"],
                item["out_of_sample_metrics"]["expectancy_pct"],
                item["out_of_sample_metrics"]["max_drawdown_pct"],
            ),
            reverse=True,
        )
        finished_at = datetime.now(UTC)
        return {
            "scan_id": scan_id,
            "status": "completed",
            "started_at": started_at.isoformat(),
            "finished_at": finished_at.isoformat(),
            "universe": "NIFTY 50",
            "universe_as_of": NIFTY50_AS_OF,
            "data_source": "Local official NSE daily archive cache",
            "data_as_of": max(latest_dates, default=None),
            **counts,
            "qualifying_setups": len(candidates),
            "candidates": candidates,
        }

    def run(self, symbol: str, company_name: str | None = None, *, include_chart: bool = True) -> dict[str, Any]:
        run_id = uuid4().hex
        started_at = datetime.now(UTC).isoformat()
        normalized = symbol.strip().upper().removesuffix(".NS")
        try:
            bars = self._cache.get(normalized, timeframe="1day")
            if not bars:
                result = self._empty_result(run_id, normalized, company_name, started_at, "No daily NSE candles are saved for this symbol. Import its history in NSE data first.")
                self._artifacts.save(ARTIFACT_KIND, run_id, result)
                return result

            frame = pd.DataFrame(
                [
                    {
                        "timestamp": bar.timestamp,
                        "open": bar.open,
                        "high": bar.high,
                        "low": bar.low,
                        "close": bar.close,
                        "volume": bar.volume,
                    }
                    for bar in bars
                ]
            ).sort_values("timestamp").drop_duplicates("timestamp", keep="last").reset_index(drop=True)
            if (frame["high"] < frame["low"]).any() or (frame["high"] < frame[["open", "close"]].max(axis=1)).any() or (frame["low"] > frame[["open", "close"]].min(axis=1)).any():
                raise ValueError("Saved daily candles contain an invalid high/low range; repair or re-import this symbol before analysis.")

            frame = _add_indicators(frame)
            first_date = pd.Timestamp(frame.iloc[0]["timestamp"]).date()
            last_date = pd.Timestamp(frame.iloc[-1]["timestamp"]).date()
            now = datetime.now(UTC)
            local_now = now.astimezone(INDIA_TZ)
            age_days = max((local_now.date() - last_date).days, 0)
            history_years = (last_date - first_date).days / 365.25
            data_hash = self._hash_bars(frame)

            if len(frame) < MIN_HISTORY_BARS:
                result = self._empty_result(
                    run_id,
                    normalized,
                    company_name,
                    started_at,
                    f"Only {len(frame)} daily bars are saved; at least {MIN_HISTORY_BARS} are needed for the 200-day trend and breakout rule.",
                )
                result.update({"data_as_of": last_date.isoformat(), "history_start": first_date.isoformat(), "bar_count": len(frame), "history_years": history_years, "data_hash": data_hash})
                self._artifacts.save(ARTIFACT_KIND, run_id, result)
                return result

            split_index = 200 + floor((len(frame) - 200) * 0.70)
            split_index = min(max(split_index, 200), len(frame) - 1)
            training, _ = _simulate_period(frame, 200, split_index)
            out_of_sample, trades = _simulate_period(frame, split_index, len(frame))
            technical, chart, evidence = self._technical_summary(frame, include_chart)
            setup = self._trade_plan(frame, technical, evidence, age_days, now)
            gate = self._validation_gate(history_years, out_of_sample)
            finished_at = datetime.now(UTC).isoformat()
            result = {
                "run_id": run_id,
                "symbol": normalized,
                "company_name": company_name,
                "run_status": "completed",
                "message": "Analysis and fixed-rule historical test completed from locally saved daily NSE candles.",
                "data_source": "Local NSE daily archive cache",
                "data_as_of": last_date.isoformat(),
                "history_start": first_date.isoformat(),
                "bar_count": len(frame),
                "history_years": history_years,
                "data_age_days": age_days,
                "data_hash": data_hash,
                "technical": technical,
                "technical_reasons": evidence,
                "growth_note": "Price returns describe past price movement only; the local OHLCV cache does not contain earnings estimates or company fundamentals, so it cannot authenticate future business growth.",
                "setup": setup,
                "training_metrics": self._with_dates(training, frame, 200, split_index),
                "out_of_sample_metrics": self._with_dates(out_of_sample, frame, split_index, len(frame)),
                "validation_gate": gate,
                "trades": trades,
                "chart": chart,
                "cost_assumptions": {
                    "entry_slippage_pct": ENTRY_SLIPPAGE * 100,
                    "exit_slippage_pct": EXIT_SLIPPAGE * 100,
                    "stt_pct_per_side": STT_RATE * 100,
                    "stamp_duty_pct_buy_side": STAMP_DUTY_BUY_RATE * 100,
                    "sebi_turnover_fee_pct_per_side": SEBI_TURNOVER_RATE * 100,
                    "excluded": ["brokerage", "exchange transaction charges", "GST", "dividends", "corporate-action adjustments"],
                },
                "run_log": {
                    "run_id": run_id,
                    "status": "completed",
                    "started_at": started_at,
                    "finished_at": finished_at,
                    "failure_reason": None,
                },
            }
            self._artifacts.save(ARTIFACT_KIND, run_id, result)
            return result
        except Exception as exc:
            logger.exception("Single-stock analysis run %s failed for %s", run_id, normalized)
            result = self._empty_result(run_id, normalized, company_name, started_at, "The analysis run failed; see the saved local run log.")
            result["run_status"] = "failed"
            result["run_log"].update({"status": "failed", "finished_at": datetime.now(UTC).isoformat(), "failure_reason": f"{type(exc).__name__}: {str(exc)[:240]}"})
            self._artifacts.save(ARTIFACT_KIND, run_id, result)
            raise

    def list_runs(self, limit: int) -> dict[str, Any]:
        recent = self._artifacts.list_with_metadata(ARTIFACT_KIND, limit=limit)
        statuses = self._artifacts.count_by_json_value(ARTIFACT_KIND, "$.run_status")
        gates = self._artifacts.count_by_json_value(ARTIFACT_KIND, "$.validation_gate.status")
        return {
            "total_runs": sum(statuses.values()),
            "completed_runs": statuses.get("completed", 0),
            "failed_attempts": statuses.get("failed", 0),
            "insufficient_data_runs": statuses.get("insufficient_data", 0),
            "qualified_runs": gates.get("passed", 0),
            "failed_gates": gates.get("failed", 0),
            "not_evaluable_runs": gates.get("not_evaluable", 0),
            "runs": [self._run_summary(run) for run in recent],
        }

    @staticmethod
    def _empty_result(run_id: str, symbol: str, company_name: str | None, started_at: str, message: str) -> dict[str, Any]:
        finished_at = datetime.now(UTC).isoformat()
        return {
            "run_id": run_id,
            "symbol": symbol,
            "company_name": company_name,
            "run_status": "insufficient_data",
            "message": message,
            "data_source": "Local NSE daily archive cache",
            "data_as_of": None,
            "history_start": None,
            "bar_count": 0,
            "history_years": 0.0,
            "data_age_days": None,
            "data_hash": None,
            "technical": None,
            "technical_reasons": [],
            "growth_note": "Fundamental growth data is not available from the local OHLCV cache.",
            "setup": None,
            "training_metrics": None,
            "out_of_sample_metrics": None,
            "validation_gate": {
                "status": "not_evaluable",
                "minimum_history_years": 5,
                "minimum_oos_trades": MIN_OOS_TRADES,
                "minimum_win_rate_pct": MIN_WIN_RATE_PCT,
                "reasons": [message],
            },
            "trades": [],
            "chart": [],
            "cost_assumptions": None,
            "run_log": {
                "run_id": run_id,
                "status": "insufficient_data",
                "started_at": started_at,
                "finished_at": finished_at,
                "failure_reason": message,
            },
        }

    @staticmethod
    def _technical_summary(
        frame: pd.DataFrame,
        include_chart: bool = True,
    ) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
        current = frame.iloc[-1]
        close = float(current["close"])
        sma20 = _value(current, "sma20")
        sma50 = _value(current, "sma50")
        sma200 = _value(current, "sma200")
        rsi = _value(current, "rsi14")
        macd = _value(current, "macd")
        macd_signal = _value(current, "macd_signal")
        macd_histogram = _value(current, "macd_histogram")
        atr = _value(current, "atr14")
        volume_average = _value(current, "prior20_volume")
        prior_high = _value(current, "prior20_high")
        prior_low = _value(current, "prior20_low")
        volume_ratio = float(current["volume"]) / volume_average if volume_average and volume_average > 0 else None
        year_frame = frame.tail(252)
        technical = {
            "close": close,
            "sma20": sma20,
            "sma50": sma50,
            "sma200": sma200,
            "rsi14": rsi,
            "macd": macd,
            "macd_signal": macd_signal,
            "macd_histogram": macd_histogram,
            "atr14": atr,
            "atr14_pct": atr / close * 100.0 if atr is not None else None,
            "prior20_high": prior_high,
            "prior20_low": prior_low,
            "high_52w": float(year_frame["high"].max()),
            "low_52w": float(year_frame["low"].min()),
            "volume_ratio_20": volume_ratio,
            "return_1m_pct": _price_return(frame["close"], 20),
            "return_3m_pct": _price_return(frame["close"], 60),
            "return_1y_pct": _price_return(frame["close"], 252),
            "return_3y_pct": _price_return(frame["close"], 756),
        }
        reasons: list[str] = []
        if sma20 is not None:
            reasons.append(f"Close is {(close / sma20 - 1.0) * 100.0:+.1f}% versus the 20-session SMA.")
        if sma50 is not None and sma200 is not None:
            reasons.append("SMA50 is above SMA200, a long-trend alignment used by this fixed rule." if sma50 > sma200 else "SMA50 is not above SMA200, so the long-trend filter is not satisfied.")
        if rsi is not None:
            rsi_state = "above the commonly referenced 70 level" if rsi >= 70 else "below the commonly referenced 30 level" if rsi <= 30 else "between 30 and 70"
            reasons.append(f"RSI14 is {rsi:.1f}, {rsi_state}; this describes momentum, not a guaranteed reversal.")
        if macd_histogram is not None:
            reasons.append("MACD histogram is positive, with MACD above its signal line." if macd_histogram > 0 else "MACD histogram is negative, with MACD below its signal line.")
        if atr is not None:
            reasons.append(f"ATR14 is ₹{atr:,.2f} ({atr / close * 100.0:.2f}% of close), a volatility measure rather than a direction forecast.")
        if prior_high is not None:
            reasons.append(f"Latest close is {'above' if close > prior_high else 'not above'} the prior 20-session high of ₹{prior_high:,.2f}.")
        if volume_ratio is not None:
            reasons.append(f"Latest volume is {volume_ratio:.2f}× the previous 20-session average.")
        return technical, StockResearchService._chart_points(frame) if include_chart else [], reasons

    @staticmethod
    def _chart_points(frame: pd.DataFrame) -> list[dict[str, Any]]:
        points: list[dict[str, Any]] = []
        for _, row in frame.iterrows():
            points.append(
                {
                    "timestamp": pd.Timestamp(row["timestamp"]).date().isoformat(),
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": float(row["volume"]),
                    "sma20": _value(row, "sma20"),
                    "sma50": _value(row, "sma50"),
                    "sma200": _value(row, "sma200"),
                }
            )
        return points

    @staticmethod
    def _trade_plan(
        frame: pd.DataFrame,
        technical: dict[str, Any],
        evidence: list[str],
        age_days: int,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        current = frame.iloc[-1]
        signal_date = pd.Timestamp(current["timestamp"]).date()
        close = float(current["close"])
        prior_high = technical["prior20_high"]
        atr = technical["atr14"]
        sma50 = technical["sma50"]
        triggered = bool(current["entry_signal"])
        entry_window_open = _entry_window_is_open(signal_date, now or datetime.now(UTC))
        trend_aligned = sma50 is not None and technical["sma200"] is not None and close > sma50 > technical["sma200"]
        is_stale = age_days > 5 or (triggered and not entry_window_open)
        status = "stale_data" if is_stale else "triggered" if triggered else "watch" if trend_aligned else "no_long_setup"
        reference = float(prior_high) if prior_high is not None else None
        stop = reference - STOP_ATR_MULTIPLE * float(atr) if reference is not None and atr is not None else None
        target_1r = reference + STOP_ATR_MULTIPLE * float(atr) if reference is not None and atr is not None else None
        target_2r = reference + STOP_ATR_MULTIPLE * TARGET_R_MULTIPLE * float(atr) if reference is not None and atr is not None else None
        reasons = list(evidence)
        if is_stale:
            if age_days > 5:
                reasons.insert(0, f"Latest saved candle is {age_days} calendar days old; refresh data before using any levels.")
            elif triggered and not entry_window_open:
                reasons.insert(0, "The breakout's next NSE session entry window has passed or its holiday calendar is unavailable; this signal is not current.")
        elif triggered:
            reasons.insert(0, "The latest completed candle met the fixed breakout rule; a simulated entry occurs at the next session open, which is not known yet.")
        elif trend_aligned:
            reasons.insert(0, "Trend filter is aligned, but the completed-candle breakout and volume conditions are not both satisfied; wait for the rule rather than chase price.")
        else:
            reasons.insert(0, "The fixed long-only trend filter is not aligned; the rule has no qualifying long entry now.")
        return {
            "status": status,
            "direction": "long_only",
            "signal_close": close,
            "entry_trigger": reference,
            "stop_loss": stop,
            "target_1r": target_1r,
            "target_2r": target_2r,
            "risk_per_share": STOP_ATR_MULTIPLE * float(atr) if atr is not None else None,
            "reasons": reasons,
            "exit_rules": [
                "If entered next session, exit at the 2R target or 2×ATR stop; if both daily extremes touch, the backtest assumes stop first.",
                "Otherwise exit next session open after a daily close below SMA50 or after 20 sessions.",
            ],
            "level_note": "Illustrative prices use the prior 20-session high as the reference entry; an actual next-open gap changes risk and targets. No order is placed.",
        }

    @staticmethod
    def _validation_gate(history_years: float, metrics: dict[str, Any]) -> dict[str, Any]:
        reasons: list[str] = []
        if history_years < 5.0:
            reasons.append(f"History covers {history_years:.1f} years; at least 5 years are required for this gate.")
        if int(metrics["trades"]) < MIN_OOS_TRADES:
            reasons.append(f"Only {metrics['trades']} closed out-of-sample trades; at least {MIN_OOS_TRADES} are required.")
        if float(metrics["win_rate_pct"]) < MIN_WIN_RATE_PCT:
            reasons.append(f"Out-of-sample win rate is {metrics['win_rate_pct']:.1f}%; the requested gate is at least {MIN_WIN_RATE_PCT:.0f}%.")
        if float(metrics["expectancy_pct"]) <= 0:
            reasons.append("Out-of-sample average net return per trade is not positive after modeled costs.")
        if float(metrics["total_return_pct"]) <= 0:
            reasons.append("Out-of-sample compounded return is not positive after modeled costs.")
        profit_factor = metrics["profit_factor"]
        no_loss_profit_factor = int(metrics["wins"]) > 0 and int(metrics["losses"]) == 0
        if not no_loss_profit_factor and (profit_factor is None or float(profit_factor) <= 1.0):
            reasons.append("Out-of-sample profit factor is undefined or not above 1 after modeled costs.")
        insufficient_sample = history_years < 5.0 or int(metrics["trades"]) < MIN_OOS_TRADES
        status = "not_evaluable" if insufficient_sample else "passed" if not reasons else "failed"
        return {
            "status": status,
            "minimum_history_years": 5,
            "minimum_oos_trades": MIN_OOS_TRADES,
            "minimum_win_rate_pct": MIN_WIN_RATE_PCT,
            "reasons": reasons or ["The fixed rule cleared every historical screen; this is not a live-performance guarantee."],
        }

    @staticmethod
    def _with_dates(metrics: dict[str, Any], frame: pd.DataFrame, start_index: int, end_index: int) -> dict[str, Any]:
        result = dict(metrics)
        result["period_start"] = pd.Timestamp(frame.iloc[start_index]["timestamp"]).date().isoformat() if start_index < end_index else None
        result["period_end"] = pd.Timestamp(frame.iloc[end_index - 1]["timestamp"]).date().isoformat() if start_index < end_index else None
        result["bars"] = max(end_index - start_index, 0)
        return result

    @staticmethod
    def _hash_bars(frame: pd.DataFrame) -> str:
        from quant_research.domain.utils.hashing import calculate_value_hash

        return calculate_value_hash(frame[["timestamp", "open", "high", "low", "close", "volume"]].to_dict(orient="records"))

    @staticmethod
    def _run_summary(run: dict[str, Any]) -> dict[str, Any]:
        metrics = run.get("out_of_sample_metrics") or {}
        gate = run.get("validation_gate") or {}
        log = run.get("run_log") or {}
        return {
            "run_id": run.get("run_id", run.get("_artifact_key", "")),
            "symbol": run.get("symbol", ""),
            "run_status": run.get("run_status", "failed"),
            "logged_at": log.get("finished_at", run.get("_saved_at")),
            "data_as_of": run.get("data_as_of"),
            "trades": metrics.get("trades", 0),
            "signal_occurrences": metrics.get("signal_occurrences"),
            "wins": metrics.get("wins", 0),
            "losses": metrics.get("losses", 0),
            "validation_status": gate.get("status", "not_evaluable"),
            "failure_reason": log.get("failure_reason"),
        }
