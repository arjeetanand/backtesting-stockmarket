from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute
from pydantic import ValidationError

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import ScenarioSimulatorRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService
from quant_research.services.time_machine import _exit_for_path, run_time_machine


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


class StubProvider:
    provider_name = "test"

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        return []

    def get_symbols(self) -> list[str]:
        return []

    def get_trading_calendar(self) -> list[datetime]:
        return []


class StubCache:
    def __init__(self, bars: list[OHLCVBar]) -> None:
        self.bars = bars
        self.request: tuple[str, str] | None = None

    def get(self, symbol: str, timeframe: str) -> list[OHLCVBar]:
        self.request = (symbol, timeframe)
        return self.bars


def flat_bars(count: int = 90) -> list[OHLCVBar]:
    start = datetime(2024, 1, 1, tzinfo=UTC)
    return [
        OHLCVBar(
            timestamp=start + timedelta(days=index),
            symbol="RELIANCE",
            open=100.0,
            high=102.0,
            low=98.0,
            close=100.0,
            volume=1_000.0,
        )
        for index in range(count)
    ]


def test_time_machine_is_seeded_and_resolves_same_bar_stop_target_conservatively() -> None:
    bars = flat_bars()
    first = run_time_machine(bars=bars, risk_pct=0.5, target_r=3.0, seed=7)
    second = run_time_machine(bars=bars, risk_pct=0.5, target_r=3.0, seed=7)

    assert first == second
    assert first.simulations == 10_000
    assert first.monte_carlo.samples == 10_000
    assert first.monte_carlo.stop_loss == 10_000
    assert first.monte_carlo.target == 0
    assert first.historical_outcomes.samples == 60
    assert first.historical_outcomes.stop_loss == 60
    assert first.as_of_date == bars[-1].timestamp.date()
    assert first.data_end == bars[-2].timestamp.date()


def test_time_machine_requires_history_for_sampling_and_holding_horizon() -> None:
    with pytest.raises(ValueError, match="needs at least 71"):
        run_time_machine(bars=flat_bars(70))


def test_time_machine_exits_at_target_on_gap_or_at_close_when_time_runs_out() -> None:
    date = datetime(2024, 1, 1, tzinfo=UTC)
    target_bar = OHLCVBar(timestamp=date, symbol="RELIANCE", open=100.0, high=104.0, low=99.5, close=103.0, volume=1.0)
    gap_bar = OHLCVBar(timestamp=date, symbol="RELIANCE", open=98.0, high=101.0, low=96.0, close=97.0, volume=1.0)
    quiet_bar = OHLCVBar(timestamp=date, symbol="RELIANCE", open=100.0, high=100.5, low=99.5, close=100.2, volume=1.0)

    assert _exit_for_path(100.0, 1.0, 2.0, [target_bar]) == ("target", 102.0)
    assert _exit_for_path(100.0, 1.0, 2.0, [gap_bar]) == ("stop_loss", 98.0)
    assert _exit_for_path(100.0, 1.0, 2.0, [quiet_bar]) == ("time_exit", 100.2)


def test_scenario_api_reads_only_the_daily_local_cache() -> None:
    cache = StubCache(flat_bars())
    router = create_api_router(
        ResearchService(StubProvider(), InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,  # type: ignore[arg-type]
    )
    endpoint = next(route.endpoint for route in router.routes if isinstance(route, APIRoute) and route.path == "/api/v1/scenario-simulator/run")

    result = endpoint(ScenarioSimulatorRequest(symbol="reliance.ns", risk_pct=0.5))

    assert cache.request == ("RELIANCE", "1day")
    assert result.symbol == "RELIANCE"
    assert result.entry_price == 100.0
    assert result.simulations == 10_000


def test_scenario_api_reports_missing_local_history_without_importing_it() -> None:
    router = create_api_router(
        ResearchService(StubProvider(), InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=StubCache([]),  # type: ignore[arg-type]
    )
    endpoint = next(route.endpoint for route in router.routes if isinstance(route, APIRoute) and route.path == "/api/v1/scenario-simulator/run")

    with pytest.raises(HTTPException) as raised:
        endpoint(ScenarioSimulatorRequest(symbol="RELIANCE"))

    assert raised.value.status_code == 422
    assert "Import more history" in str(raised.value.detail)


def test_scenario_api_rejects_invalid_cached_ohlc() -> None:
    bars = flat_bars()
    bars[-5] = bars[-5].model_copy(update={"high": 97.0})
    router = create_api_router(
        ResearchService(StubProvider(), InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=StubCache(bars),  # type: ignore[arg-type]
    )
    endpoint = next(route.endpoint for route in router.routes if isinstance(route, APIRoute) and route.path == "/api/v1/scenario-simulator/run")

    with pytest.raises(HTTPException) as raised:
        endpoint(ScenarioSimulatorRequest(symbol="RELIANCE"))

    assert raised.value.status_code == 422
    assert "High price" in str(raised.value.detail)


@pytest.mark.parametrize(
    "overrides",
    [
        {"entry_price": float("inf")},
        {"entry_price": 0.001},
        {"risk_pct": float("nan")},
        {"risk_pct": 0.001},
        {"target_r": 0.001},
        {"target_r": 11.0},
        {"lookback_sessions": 19},
        {"max_hold_sessions": 21},
        {"seed": 2_147_483_648},
    ],
)
def test_scenario_request_rejects_nonfinite_and_out_of_range_inputs(overrides: dict[str, float | int]) -> None:
    with pytest.raises(ValidationError):
        ScenarioSimulatorRequest.model_validate({"symbol": "RELIANCE", **overrides})
