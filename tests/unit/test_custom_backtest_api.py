from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import CustomBacktestRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


class FakeMarketDataProvider:
    provider_name = "test"

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        first_day = datetime(2024, 1, 1, tzinfo=UTC)
        bars: list[OHLCVBar] = []
        for index in range(80):
            close = 100.0 + index + (5.0 if index >= 40 else 0.0)
            bars.append(
                OHLCVBar(
                    timestamp=first_day + timedelta(days=index),
                    symbol=symbol,
                    open=close - 1.0,
                    high=close + 2.0,
                    low=close - 2.0,
                    close=close,
                    volume=10_000.0 + index,
                )
            )
        return bars


def test_custom_backtest_result_keeps_existing_shape_with_additive_chart_fields() -> None:
    router = create_api_router(
        ResearchService(FakeMarketDataProvider(), InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/backtests/custom"))
    response = endpoint(
        CustomBacktestRequest(
            symbol="RELIANCE",
            strategy_id="sma_crossover",
            start=datetime(2024, 1, 1, tzinfo=UTC),
            end=datetime(2024, 3, 20, tzinfo=UTC),
            fast_ema=5,
            slow_ema=10,
        )
    )

    assert {
        "run_id",
        "symbol",
        "timeframe",
        "strategy_id",
        "initial_capital",
        "final_equity",
        "metrics",
        "equity_curve",
        "drawdown_curve",
        "trades",
        "candles",
        "indicators",
        "signals",
        "trade_path",
    }.issubset(response)
    assert response["symbol"] == "RELIANCE"
    assert response["candles"][0].keys() >= {"date", "open", "high", "low", "close", "volume"}
    assert response["candles"][0]["volume"] == 10_000.0
    assert len(response["signals"]) == 2 * len(response["trades"])
    assert all(
        {"id", "date", "type", "price", "trade_id"}.issubset(signal)
        and signal["type"] in {"entry", "exit"}
        for signal in response["signals"]
    )


def test_custom_backtest_rejects_unsupported_strategy_as_actionable_422() -> None:
    router = create_api_router(
        ResearchService(FakeMarketDataProvider(), InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/backtests/custom"))

    with pytest.raises(HTTPException) as raised:
        endpoint(
            CustomBacktestRequest(
                symbol="RELIANCE",
                strategy_id="not_a_supported_strategy",
                start=datetime(2024, 1, 1, tzinfo=UTC),
                end=datetime(2024, 3, 20, tzinfo=UTC),
            )
        )

    assert raised.value.status_code == 422
    assert "Unsupported strategy" in str(raised.value.detail)
