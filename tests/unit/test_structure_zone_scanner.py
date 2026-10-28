from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import StructureZoneScanRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService
from quant_research.services.structure_zone_scanner import detect_latest_active_zones


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def bars_with_zone(direction: str = "bullish", *, retest: bool = False, invalidate: bool = False) -> list[OHLCVBar]:
    bars: list[OHLCVBar] = []
    for index in range(40):
        open_price = close_price = 100.0
        high, low = 101.0, 99.0
        if index == 36:
            if direction == "bullish":
                open_price, close_price, high, low = 100.5, 99.5, 101.0, 99.0
            else:
                open_price, close_price, high, low = 99.5, 100.5, 101.0, 99.0
        if index == 37:
            if direction == "bullish":
                open_price, close_price, high, low = 100.0, 105.0, 106.0, 99.9
            else:
                open_price, close_price, high, low = 100.0, 95.0, 100.1, 94.0
        if index > 37:
            if direction == "bullish":
                open_price, close_price, high, low = 104.0, 104.5, 105.0, 103.0
            else:
                open_price, close_price, high, low = 96.0, 95.5, 97.0, 94.5
        if index == 39 and retest:
            open_price, close_price, high, low = 104.0, 104.5, 105.0, 100.0
        if index == 39 and invalidate:
            open_price, close_price, high, low = 100.0, 98.5, 100.5, 98.0

        bars.append(
            OHLCVBar(
                timestamp=datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=index),
                symbol="RELIANCE",
                open=open_price,
                high=high,
                low=low,
                close=close_price,
                volume=1_000.0,
            )
        )
    return bars


def test_zone_is_only_confirmed_after_daily_range_break_and_tracks_untested_state() -> None:
    bars = bars_with_zone()

    assert detect_latest_active_zones(bars[:37], symbol="RELIANCE") == []

    zones = detect_latest_active_zones(bars, symbol="RELIANCE")

    assert len(zones) == 1
    zone = zones[0]
    assert zone.direction == "bullish"
    assert zone.zone_low == 99.0
    assert zone.zone_high == 101.0
    assert zone.source_candle_date == "2025-02-06"
    assert zone.confirmed_date == "2025-02-07"
    assert zone.break_level == 101.0
    assert zone.state == "untested"
    assert zone.distance_pct > 0


def test_confirmation_candle_does_not_count_as_a_zone_retest() -> None:
    zones = detect_latest_active_zones(bars_with_zone()[:38], symbol="RELIANCE")

    assert len(zones) == 1
    assert zones[0].state == "untested"
    assert zones[0].touch_sessions == 0


def test_retest_remains_active_but_close_through_zone_edge_invalidates_it() -> None:
    retested = detect_latest_active_zones(bars_with_zone(retest=True), symbol="RELIANCE")
    invalidated = detect_latest_active_zones(bars_with_zone(invalidate=True), symbol="RELIANCE")

    assert retested[0].state == "testing"
    assert retested[0].touch_sessions == 1
    assert invalidated == []


def test_bearish_structure_zone_is_detected_symmetrically() -> None:
    zones = detect_latest_active_zones(bars_with_zone("bearish"), symbol="RELIANCE")

    assert len(zones) == 1
    assert zones[0].direction == "bearish"
    assert zones[0].break_level == 99.0
    assert zones[0].state == "untested"


def test_structure_zone_api_uses_the_configured_universe_and_reports_coverage(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.put(bars_with_zone(), "1day", "official-nse-test")
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/structure-zones/scan"))

    response = endpoint(StructureZoneScanRequest(universe="nifty50"))

    assert response.universe == "nifty50"
    assert response.coverage_status == "partial"
    assert response.requested_symbols == 50
    assert response.available_symbols == 1
    assert response.scanned_symbols == 1
    assert response.total_zones == 1
    assert response.zones[0].symbol == "RELIANCE"
    assert response.data_as_of.isoformat() == "2025-02-09"

    with pytest.raises(HTTPException) as unknown_universe:
        endpoint(StructureZoneScanRequest(universe="not-a-real-universe"))
    assert unknown_universe.value.status_code == 404
