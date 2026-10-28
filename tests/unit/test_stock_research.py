from datetime import UTC, datetime, timedelta
from pathlib import Path

import pandas as pd
import pytest

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import StockResearchRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import Instrument, SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService
from quant_research.services.stock_research import (
    ARTIFACT_KIND,
    StockResearchService,
    _add_indicators,
    _simulate_period,
)


class _CatalogueFailureCache(SqliteMarketCache):
    def search_instruments(self, query: str = "", universe: str | None = None, limit: int = 50) -> list[Instrument]:
        raise RuntimeError("catalogue lookup unavailable")


class _StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def test_prior_breakout_levels_exclude_the_signal_day() -> None:
    frame = pd.DataFrame(
        {
            "open": [100.0] * 22,
            "high": [101.0] * 21 + [999.0],
            "low": [99.0] * 22,
            "close": [100.0] * 21 + [102.0],
            "volume": [1_000.0] * 21 + [2_000.0],
        }
    )

    enriched = _add_indicators(frame)

    assert enriched.loc[21, "prior20_high"] == 101.0
    assert bool(enriched.loc[21, "entry_signal"]) is False  # long-trend averages are not available yet
    assert pd.isna(enriched.loc[13, "atr14"])
    assert enriched.loc[14, "atr14"] == 2.0
    assert enriched.loc[14, "rsi14"] == 50.0


def test_backtest_enters_on_next_session_and_resolves_ambiguous_bar_stop_first() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": [datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=index) for index in range(203)],
            "open": [100.0] * 203,
            "high": [101.0] * 203,
            "low": [99.0] * 203,
            "close": [100.0] * 203,
            "volume": [1_000.0] * 203,
            "atr14": [2.0] * 203,
            "sma50": [90.0] * 203,
            "entry_signal": [False] * 200 + [True, False, False],
        }
    )
    frame.loc[201, ["high", "low"]] = [109.0, 95.0]

    metrics, trades = _simulate_period(frame, 200, len(frame))

    assert metrics["trades"] == 1
    assert trades[0]["signal_date"] == "2025-07-20"
    assert trades[0]["entry_date"] == "2025-07-21"
    assert trades[0]["exit_reason"] == "stop"
    assert trades[0]["outcome"] == "loss"


def test_profit_factor_uses_sized_cash_pnl_and_whole_shares() -> None:
    frame = pd.DataFrame(
        {
            "timestamp": [datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=index) for index in range(204)],
            "open": [100.0] * 204,
            "high": [101.0] * 204,
            "low": [99.0] * 204,
            "close": [100.0] * 204,
            "volume": [1_000.0] * 204,
            "atr14": [2.0] * 204,
            "sma50": [90.0] * 204,
            "entry_signal": [False] * 200 + [True, False, True, False],
        }
    )
    frame.loc[201, "high"] = 109.0
    frame.loc[203, "low"] = 95.0

    metrics, trades = _simulate_period(frame, 200, len(frame))

    assert len(trades) == 2
    assert trades[0]["net_pnl"] > 0 > trades[1]["net_pnl"]
    for trade in trades:
        assert trade["net_pnl"] / trade["net_pnl_per_share"] == pytest.approx(
            round(trade["net_pnl"] / trade["net_pnl_per_share"])
        )
    expected_profit_factor = trades[0]["net_pnl"] / abs(trades[1]["net_pnl"])
    assert metrics["profit_factor"] == pytest.approx(expected_profit_factor)


def test_every_insufficient_data_attempt_is_saved_and_counted(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    artifacts = SqliteArtifactStore(tmp_path / "market.sqlite3")
    service = StockResearchService(cache, artifacts)

    result = service.run("MISSING")
    service.run("MISSING")
    history = service.list_runs(25)

    assert result["run_status"] == "insufficient_data"
    assert history["total_runs"] == 2
    assert history["failed_attempts"] == 2
    assert history["not_evaluable_runs"] == 2
    assert result["run_id"] in {run["run_id"] for run in history["runs"]}
    assert artifacts.get(ARTIFACT_KIND, result["run_id"]) is not None


def test_history_counts_completed_gate_outcomes_and_failed_attempts(tmp_path: Path) -> None:
    artifacts = SqliteArtifactStore(tmp_path / "market.sqlite3")
    service = StockResearchService(SqliteMarketCache(tmp_path / "market.sqlite3"), artifacts)
    for run_id, run_status, gate_status in (
        ("passed", "completed", "passed"),
        ("failed-gate", "completed", "failed"),
        ("not-evaluable", "completed", "not_evaluable"),
        ("failed-attempt", "failed", "not_evaluable"),
    ):
        artifacts.save(
            ARTIFACT_KIND,
            run_id,
            {"run_id": run_id, "symbol": "TEST", "run_status": run_status, "validation_gate": {"status": gate_status}},
        )

    history = service.list_runs(10)

    assert history["total_runs"] == 4
    assert history["completed_runs"] == 3
    assert history["failed_attempts"] == 1
    assert history["qualified_runs"] == 1
    assert history["failed_gates"] == 1
    assert history["not_evaluable_runs"] == 2


def test_available_daily_history_completes_but_short_history_cannot_pass_gate(tmp_path: Path) -> None:
    cache_path = tmp_path / "market.sqlite3"
    cache = SqliteMarketCache(cache_path)
    artifacts = SqliteArtifactStore(cache_path)
    start = datetime(2025, 1, 1, tzinfo=UTC)
    bars = []
    for index in range(260):
        close = 100.0 + index * 0.2
        bars.append(
            OHLCVBar(
                timestamp=start + timedelta(days=index),
                symbol="TEST",
                open=close - 0.1,
                high=close + 1.0,
                low=close - 1.0,
                close=close,
                volume=1_000.0 + index,
            )
        )
    cache.put(bars, "1day", "official-nse-test")

    result = StockResearchService(cache, artifacts).run("TEST")

    assert result["run_status"] == "completed"
    assert result["bar_count"] == 260
    assert result["technical"]["sma200"] is not None
    assert result["validation_gate"]["status"] == "not_evaluable"
    assert "at least 5 years" in " ".join(result["validation_gate"]["reasons"])
    assert result["run_log"]["status"] == "completed"


def test_win_rate_alone_never_passes_a_small_out_of_sample_sample() -> None:
    metrics = {
        "trades": 29,
        "wins": 29,
        "losses": 0,
        "win_rate_pct": 100.0,
        "expectancy_pct": 1.0,
        "profit_factor": None,
        "total_return_pct": 30.0,
    }

    assert StockResearchService._validation_gate(6.0, metrics)["status"] == "not_evaluable"

    metrics["trades"] = 30
    assert StockResearchService._validation_gate(6.0, metrics)["status"] == "passed"
    metrics["win_rate_pct"] = 69.9
    assert StockResearchService._validation_gate(6.0, metrics)["status"] == "failed"


def test_validation_gate_rejects_positive_average_with_negative_compounded_return() -> None:
    metrics = {
        "trades": 30,
        "wins": 21,
        "losses": 9,
        "win_rate_pct": 70.0,
        "expectancy_pct": 0.4,
        "profit_factor": 1.06,
        "total_return_pct": -21.0,
    }

    result = StockResearchService._validation_gate(6.0, metrics)

    assert result["status"] == "failed"
    assert any("compounded return is not positive" in reason for reason in result["reasons"])


def test_invalid_history_is_logged_as_failed_before_error_is_returned(tmp_path: Path) -> None:
    cache_path = tmp_path / "market.sqlite3"
    cache = SqliteMarketCache(cache_path)
    service = StockResearchService(cache, SqliteArtifactStore(cache_path))
    start = datetime(2025, 1, 1, tzinfo=UTC)
    cache.put(
        [
            OHLCVBar(
                timestamp=start + timedelta(days=index),
                symbol="INVALID",
                open=100,
                high=99,
                low=101,
                close=100,
                volume=1_000,
            )
            for index in range(221)
        ],
        "1day",
        "test",
    )

    try:
        service.run("INVALID")
    except ValueError as error:
        assert "invalid high/low range" in str(error)
    else:
        raise AssertionError("invalid daily bars should fail the analysis")

    history = service.list_runs(25)
    assert history["total_runs"] == 1
    assert history["failed_attempts"] == 1
    assert history["runs"][0]["run_status"] == "failed"
    assert history["runs"][0]["failure_reason"].startswith("ValueError:")


def test_api_records_missing_symbol_even_when_optional_catalogue_lookup_fails(tmp_path: Path) -> None:
    cache_path = tmp_path / "market.sqlite3"
    cache = _CatalogueFailureCache(cache_path)
    artifacts = SqliteArtifactStore(cache_path)
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(_StubLlm()),
        market_cache=cache,
        artifacts=artifacts,
    )
    run_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/stock-research/run"))
    history_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/stock-research/runs"))

    result = run_endpoint(StockResearchRequest(symbol="MISSING"))
    history = history_endpoint(limit=25)

    assert result.run_status == "insufficient_data"
    assert history.total_runs == 1
    assert history.failed_attempts == 1
    assert history.not_evaluable_runs == 1
