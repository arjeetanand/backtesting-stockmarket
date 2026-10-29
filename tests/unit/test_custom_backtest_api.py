from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pandas as pd
import pytest
from fastapi import HTTPException

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import CustomBacktestRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.domain.utils.hashing import calculate_value_hash
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


class ArtifactStoreWithLegacyCustomResult:
    def __init__(self, legacy_key: str) -> None:
        self.legacy_key = legacy_key
        self.requested_keys: list[str] = []
        self.saved: list[tuple[str, dict[str, object]]] = []

    def get(self, kind: str, artifact_key: str) -> dict[str, object] | None:
        assert kind == "custom_backtest"
        self.requested_keys.append(artifact_key)
        return {"run_id": "stale-pre-fee-result"} if artifact_key == self.legacy_key else None

    def save(self, kind: str, artifact_key: str, payload: dict[str, object]) -> None:
        assert kind == "custom_backtest"
        self.saved.append((artifact_key, payload))


class ArtifactStore:
    def __init__(self) -> None:
        self.saved: dict[tuple[str, str], dict[str, object]] = {}

    def get(self, kind: str, artifact_key: str) -> dict[str, object] | None:
        return self.saved.get((kind, artifact_key))

    def save(self, kind: str, artifact_key: str, payload: dict[str, object]) -> None:
        self.saved[(kind, artifact_key)] = payload

    def get_by_json_value(self, kind: str, path: str, value: str) -> tuple[str, dict[str, object]] | None:
        assert kind == "custom_backtest"
        assert path == "$.run_id"
        return next(((key, payload) for (saved_kind, key), payload in self.saved.items() if saved_kind == kind and payload.get("run_id") == value), None)


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
        "_artifact_key",
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


def test_custom_backtest_artifact_can_be_reloaded_by_reference() -> None:
    artifacts = ArtifactStore()
    router = create_api_router(
        ResearchService(FakeMarketDataProvider(), InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        artifacts=artifacts,  # type: ignore[arg-type]
    )
    run_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/backtests/custom"))
    read_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/research/artifacts/{kind}/{artifact_key}"))
    result = run_endpoint(
        CustomBacktestRequest(
            symbol="RELIANCE",
            strategy_id="sma_crossover",
            start=datetime(2024, 1, 1, tzinfo=UTC),
            end=datetime(2024, 3, 20, tzinfo=UTC),
            fast_ema=5,
            slow_ema=10,
        )
    )

    restored = read_endpoint("custom_backtest", result["_artifact_key"])
    read_legacy_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/research/artifacts/custom_backtest/by-run-id/{run_id}"))
    restored_by_run_id = read_legacy_endpoint(result["run_id"])

    assert restored["_artifact_key"] == result["_artifact_key"]
    assert restored["run_id"] == result["run_id"]
    assert restored["candles"] == result["candles"]
    assert restored_by_run_id["_artifact_key"] == result["_artifact_key"]
    assert restored_by_run_id["run_id"] == result["run_id"]


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


def test_custom_backtest_does_not_reuse_pre_versioned_commission_results() -> None:
    provider = FakeMarketDataProvider()
    start = datetime(2024, 1, 1, tzinfo=UTC)
    end = datetime(2024, 3, 20, tzinfo=UTC)
    payload = CustomBacktestRequest(
        symbol="RELIANCE",
        strategy_id="sma_crossover",
        start=start,
        end=end,
        fast_ema=5,
        slow_ema=10,
    )
    frame = pd.DataFrame(
        [bar.model_dump() for bar in provider.get_ohlcv("RELIANCE", "1day", start, end)]
    ).rename(columns={"timestamp": "date"})
    legacy_key = calculate_value_hash(
        {"kind": "custom_backtest", **payload.model_dump(mode="json"), "data": frame.to_dict("records")}
    )
    artifacts = ArtifactStoreWithLegacyCustomResult(legacy_key)
    router = create_api_router(
        ResearchService(provider, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        artifacts=artifacts,  # type: ignore[arg-type]
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/backtests/custom"))

    response = endpoint(payload)

    assert response["run_id"] != "stale-pre-fee-result"
    assert artifacts.requested_keys == [artifacts.saved[0][0]]
    assert artifacts.requested_keys[0] != legacy_key
