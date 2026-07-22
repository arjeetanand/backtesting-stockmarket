from datetime import UTC, datetime
from pathlib import Path

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache


def test_sqlite_cache_round_trips_daily_bars(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    bar = OHLCVBar(
        timestamp=datetime(2025, 1, 2, tzinfo=UTC), symbol="RELIANCE", open=100, high=105, low=99, close=102, volume=1_000
    )

    assert cache.put([bar], "1day", "nse_common_bhavcopy") == 1
    cached = cache.get("RELIANCE", "1day", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 3, tzinfo=UTC))

    assert cached == [bar]
    assert cache.summary().bars == 1
