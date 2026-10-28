from datetime import UTC, datetime, timedelta
from pathlib import Path

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import BreakoutScannerRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import CacheSummary, Instrument, SqliteMarketCache
from quant_research.services.breakout_scanner import BreakoutScannerService, _morning_plan
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def make_breakout_bars(symbol: str = "TATAMOTORS", count: int = 120) -> list[OHLCVBar]:
    bars = []
    base_price = 400.0
    for i in range(count):
        # Make final bar a strong 52-week high breakout + volume surge
        if i == count - 1:
            close = 600.0
            high = 605.0
            volume = 5_000_000.0
        else:
            close = base_price + i * 1.2
            high = close + 2.0
            volume = 200_000.0

        bars.append(
            OHLCVBar(
                timestamp=datetime(2023, 1, 1, tzinfo=UTC) + timedelta(days=i),
                symbol=symbol,
                open=close - 1.0,
                high=high,
                low=close - 2.0,
                close=close,
                volume=volume,
            )
        )
    return bars


def test_breakout_scanner_detects_setups(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    bars = make_breakout_bars("TATAMOTORS")
    cache.put(bars, "1day", "test")

    service = BreakoutScannerService(cache)
    result = service.scan_breakouts(min_conviction=40.0)

    assert "total_candidates" in result
    assert result["total_candidates"] >= 1
    assert result["symbols_scanned"] == 1
    assert result["setups"][0]["symbol"] == "TATAMOTORS"
    assert result["setups"][0]["conviction_score"] >= 40.0
    assert result["data_as_of"] == "2023-04-30"
    plan = result["setups"][0]["morning_plan"]
    assert plan == {
        "data_as_of": "2023-04-30",
        "entry_trigger": 605.0,
        "stop_level": 598.0,
        "target_2r": 619.0,
        "risk_per_share": 7.0,
    }


def test_morning_plan_omits_levels_for_a_flat_daily_bar() -> None:
    bar = OHLCVBar(
        timestamp=datetime(2026, 10, 27, tzinfo=UTC),
        symbol="RELIANCE",
        open=100.0,
        high=100.0,
        low=100.0,
        close=100.0,
        volume=1_000.0,
    )

    assert _morning_plan(bar) is None


def test_breakout_scan_api_returns_date_and_conditional_levels(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    cache.put(make_breakout_bars("TATAMOTORS"), "1day", "test")
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/breakout-scanner/scan"))

    result = endpoint(BreakoutScannerRequest(min_conviction=40.0))

    assert result["data_as_of"] == "2023-04-30"
    assert result["setups"][0]["morning_plan"]["target_2r"] == 619.0


def test_breakout_scanner_bounds_fallback_universe() -> None:
    class CountingCache:
        def __init__(self) -> None:
            self.calls: list[str] = []

        def summary(self) -> CacheSummary:
            return CacheSummary(symbols=400, bars=0, earliest=None, latest=datetime(2024, 1, 1, tzinfo=UTC))

        def search_instruments(self, limit: int = 2000) -> list[Instrument]:
            return [Instrument(f"STOCK{i:03d}", f"Stock {i}", None, None, None) for i in range(limit)]

        def get_available_symbols(self) -> list[str]:
            return [f"STOCK{i:03d}" for i in range(400)]

        def get(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
            self.calls.append(symbol)
            return []

    cache = CountingCache()
    result = BreakoutScannerService(cache).scan_breakouts()

    assert result["total_candidates"] == 0
    assert len(cache.calls) == 250
