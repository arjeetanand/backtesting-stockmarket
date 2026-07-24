from datetime import UTC, datetime, timedelta
from pathlib import Path

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import CacheSummary, Instrument, SqliteMarketCache
from quant_research.services.breakout_scanner import BreakoutScannerService


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
    assert result["setups"][0]["symbol"] == "TATAMOTORS"
    assert result["setups"][0]["conviction_score"] >= 40.0


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
