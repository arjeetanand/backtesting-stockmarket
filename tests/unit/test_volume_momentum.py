from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import VolumeMomentumRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService
from quant_research.services.volume_momentum import analyze_volume_momentum


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def volume_bars(*, next_volume: float = 100_000.0, start: datetime | None = None) -> list[OHLCVBar]:
    first_day = start or datetime(2025, 1, 1, tzinfo=UTC)
    bars = [
        OHLCVBar(
            timestamp=first_day + timedelta(days=index),
            symbol="RELIANCE",
            open=100.0 + index,
            high=101.0 + index,
            low=99.0 + index,
            close=100.0 + index,
            volume=100.0,
        )
        for index in range(20)
    ]
    bars.extend(
        [
            OHLCVBar(
                timestamp=first_day + timedelta(days=20),
                symbol="RELIANCE",
                open=120.0,
                high=122.0,
                low=119.0,
                close=121.0,
                volume=300.0,
            ),
            OHLCVBar(
                timestamp=first_day + timedelta(days=21),
                symbol="RELIANCE",
                open=121.0,
                high=124.0,
                low=120.0,
                close=123.42,
                volume=next_volume,
            ),
        ]
    )
    return bars


def _group(result: dict[str, object], band: str, momentum: str) -> dict[str, object]:
    groups = result["groups"]
    assert isinstance(groups, list)
    return next(
        item
        for item in groups
        if item["volume_band"] == band and item["momentum_direction"] == momentum
    )


def test_volume_momentum_uses_prior_twenty_sessions_and_next_available_close() -> None:
    first_day = datetime(2025, 1, 1, tzinfo=UTC)
    friday = datetime(2025, 1, 31, tzinfo=UTC)
    monday = datetime(2025, 2, 3, tzinfo=UTC)
    bars = volume_bars(start=first_day)
    # Keep the signal day on Friday and its next available bar on Monday.
    bars[20] = bars[20].model_copy(update={"timestamp": friday})
    bars[21] = bars[21].model_copy(update={"timestamp": monday})

    result = analyze_volume_momentum(
        bars,
        symbol="RELIANCE",
        start=friday.date(),
        end=monday.date(),
    )
    group = _group(result, "≥3.0x", "up")

    assert group["observations"] == 1
    assert group["next_up_count"] == 1
    assert group["average_next_return"] == pytest.approx(0.02)
    assert group["median_next_return"] == pytest.approx(0.02)
    assert result["overall"]["observations"] == 1


def test_signal_group_does_not_change_when_next_sessions_volume_changes() -> None:
    bars = volume_bars(next_volume=100_000.0)
    start = bars[20].timestamp.date()
    end = bars[21].timestamp.date()
    first = analyze_volume_momentum(bars, symbol="RELIANCE", start=start, end=end)

    changed_next_volume = volume_bars(next_volume=0.0)
    second = analyze_volume_momentum(changed_next_volume, symbol="RELIANCE", start=start, end=end)

    assert _group(first, "≥3.0x", "up") == _group(second, "≥3.0x", "up")


def test_final_signal_without_an_in_range_next_session_is_excluded() -> None:
    bars = volume_bars()[:21]
    signal_day = bars[-1].timestamp.date()

    result = analyze_volume_momentum(bars, symbol="RELIANCE", start=signal_day, end=signal_day)

    assert result["overall"]["observations"] == 0
    assert result["excluded_no_next_session"] == 1


def test_missing_warmup_history_is_reported_without_an_observation() -> None:
    bars = volume_bars()[-2:]

    result = analyze_volume_momentum(
        bars,
        symbol="RELIANCE",
        start=bars[0].timestamp.date(),
        end=bars[-1].timestamp.date(),
    )

    assert result["overall"]["observations"] == 0
    assert result["excluded_insufficient_history"] == 2


def test_volume_momentum_endpoint_uses_only_local_daily_cache(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    bars = volume_bars()
    cache.put(bars, "1day", "official-nse-test")
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/research/volume-momentum"))

    response = endpoint(
        VolumeMomentumRequest(
            symbol="reliance.NS",
            start=bars[20].timestamp.date(),
            end=bars[21].timestamp.date(),
        )
    )

    assert response.symbol == "RELIANCE"
    assert response.overall.observations == 1
    assert len(response.groups) == 15

    with pytest.raises(HTTPException) as missing_symbol:
        endpoint(VolumeMomentumRequest(symbol="MISSING", start=date(2025, 1, 1), end=date(2025, 1, 2)))
    assert missing_symbol.value.status_code == 404
