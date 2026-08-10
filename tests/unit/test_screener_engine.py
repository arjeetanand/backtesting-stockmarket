from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.screener_engine import (
    FORMULA_REGISTRY,
    FormulaDefinition,
    FormulaEvaluationStatus,
    InvalidFormulaParameterError,
    ScreenerEngineService,
    UnknownFormulaError,
    register_formula,
)


def make_bars(
    count: int = 80,
    *,
    symbol: str = "TEST",
    close_fn: object | None = None,
    volume_fn: object | None = None,
) -> list[OHLCVBar]:
    close_factory = close_fn if callable(close_fn) else lambda index: 100.0 + index
    volume_factory = volume_fn if callable(volume_fn) else lambda index: 1_000.0
    bars: list[OHLCVBar] = []
    for index in range(count):
        close = float(close_factory(index))
        bars.append(
            OHLCVBar(
                timestamp=datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=index),
                symbol=symbol,
                open=close - 1.0,
                high=close + 2.0,
                low=close - 2.0,
                close=close,
                volume=float(volume_factory(index)),
            )
        )
    return bars


def service_with_bars(tmp_path: Path, bars: list[OHLCVBar]) -> ScreenerEngineService:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    cache.put(bars, "1day", "official-nse-test")
    return ScreenerEngineService(cache)


def test_formula_registry_is_data_driven_and_exposes_expected_formula_families() -> None:
    expected = {
        "sma_golden_cross",
        "rsi_overbought",
        "momentum",
        "rvol_surge",
        "breakout_52w_high",
        "near_52w_low",
        "bullish_engulfing",
        "vcp_contraction",
    }

    assert expected.issubset(FORMULA_REGISTRY)
    assert [definition.formula_id for definition in ScreenerEngineService.list_formulas()] == sorted(FORMULA_REGISTRY)


def test_evaluate_returns_unavailable_when_symbol_is_not_locally_cached(tmp_path: Path) -> None:
    result = ScreenerEngineService(SqliteMarketCache(tmp_path / "cache.sqlite3")).evaluate("MISSING", "rsi_overbought")

    assert result.status is FormulaEvaluationStatus.UNAVAILABLE
    assert result.matched is None
    assert "Import" in result.message


def test_evaluate_returns_insufficient_history_instead_of_fabricating_indicators(tmp_path: Path) -> None:
    result = service_with_bars(tmp_path, make_bars(10)).evaluate("TEST", "breakout_52w_high")

    assert result.status is FormulaEvaluationStatus.INSUFFICIENT_HISTORY
    assert result.matched is None
    assert result.bars_used == 10
    assert result.metrics == {}


def test_sma_golden_cross_detects_only_the_latest_crossing_bar(tmp_path: Path) -> None:
    def close(index: int) -> float:
        return 100.0 - index if index < 59 else 200.0

    result = service_with_bars(tmp_path, make_bars(60, close_fn=close)).evaluate(
        "TEST", "sma_golden_cross", {"fast_window": 3, "slow_window": 10}
    )

    assert result.status is FormulaEvaluationStatus.MATCHED
    assert result.metrics["fast_window"] == 3.0
    assert result.metrics["slow_window"] == 10.0


def test_rsi_oversold_and_momentum_use_local_close_history(tmp_path: Path) -> None:
    def close(index: int) -> float:
        return 200.0 - index * 2.0

    service = service_with_bars(tmp_path, make_bars(40, close_fn=close))

    rsi = service.evaluate("TEST", "rsi_oversold", {"period": 14, "threshold": 30})
    momentum = service.evaluate("TEST", "momentum", {"window": 21, "minimum_return_pct": -30})

    assert rsi.status is FormulaEvaluationStatus.MATCHED
    assert rsi.metrics["rsi"] <= 30.0
    assert momentum.status is FormulaEvaluationStatus.MATCHED
    assert momentum.metrics["return_pct"] < 0.0


def test_rvol_excludes_current_bar_from_its_baseline(tmp_path: Path) -> None:
    service = service_with_bars(tmp_path, make_bars(30, volume_fn=lambda index: 10_000.0 if index == 29 else 1_000.0))

    result = service.evaluate("TEST", "rvol_surge", {"window": 20, "threshold": 5})

    assert result.status is FormulaEvaluationStatus.MATCHED
    assert result.metrics["average_volume"] == 1_000.0
    assert result.metrics["rvol"] == 10.0


def test_breakout_and_near_high_use_prior_bars_not_the_current_bar(tmp_path: Path) -> None:
    def close(index: int) -> float:
        return 100.0 + index if index < 79 else 200.0

    service = service_with_bars(tmp_path, make_bars(80, close_fn=close))

    breakout = service.evaluate("TEST", "breakout_4w_high")
    near_high = service.evaluate("TEST", "near_52w_high")

    assert breakout.status is FormulaEvaluationStatus.MATCHED
    assert near_high.status is FormulaEvaluationStatus.INSUFFICIENT_HISTORY


def test_candlestick_pattern_and_existing_breakout_setup_are_supported(tmp_path: Path) -> None:
    bars = make_bars(30)
    previous = bars[-2].model_copy(update={"open": 110.0, "close": 100.0, "high": 111.0, "low": 99.0})
    latest = bars[-1].model_copy(update={"open": 99.0, "close": 113.0, "high": 114.0, "low": 98.0, "volume": 4_000.0})
    bars[-2:] = [previous, latest]
    service = service_with_bars(tmp_path, bars)

    engulfing = service.evaluate("TEST", "bullish_engulfing")
    vcp = service.evaluate("TEST", "vcp_contraction")

    assert engulfing.status is FormulaEvaluationStatus.MATCHED
    assert vcp.status in {FormulaEvaluationStatus.MATCHED, FormulaEvaluationStatus.NOT_MATCHED}


def test_evaluate_many_is_sorted_and_reports_each_symbol_state(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    cache.put(make_bars(30, symbol="BETA"), "1day", "official-nse-test")
    cache.put(make_bars(5, symbol="ALPHA"), "1day", "official-nse-test")

    results = ScreenerEngineService(cache).evaluate_many(["BETA", "ALPHA", "BETA"], "price_above_sma", {"window": 20})

    assert [result.symbol for result in results] == ["ALPHA", "BETA"]
    assert results[0].status is FormulaEvaluationStatus.INSUFFICIENT_HISTORY
    assert results[1].status is FormulaEvaluationStatus.MATCHED


def test_unknown_formula_and_invalid_parameters_are_actionable(tmp_path: Path) -> None:
    service = service_with_bars(tmp_path, make_bars(30))

    with pytest.raises(UnknownFormulaError, match="Unknown screener formula"):
        service.evaluate("TEST", "not_a_formula")
    with pytest.raises(InvalidFormulaParameterError, match="fast_window"):
        service_with_bars(tmp_path, make_bars(60)).evaluate("TEST", "sma_golden_cross", {"fast_window": 50, "slow_window": 20})


def test_custom_formula_can_be_registered_without_changing_service_selection(tmp_path: Path) -> None:
    definition = FormulaDefinition("test_always_match", "Test formula.", 1, lambda frame, parameters: (True, {"close": float(frame["close"].iloc[-1])}, "test"))
    register_formula(definition)
    try:
        result = service_with_bars(tmp_path, make_bars(1)).evaluate("TEST", "test_always_match")
        assert result.status is FormulaEvaluationStatus.MATCHED
    finally:
        FORMULA_REGISTRY.pop("test_always_match", None)
