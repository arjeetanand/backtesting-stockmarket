from datetime import UTC, datetime
from pathlib import Path

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache, WatchlistItem
from quant_research.services.watchlist import WatchlistService


def test_watchlist_add_and_list(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    service = WatchlistService(cache)

    item = service.add_item(
        symbol="RELIANCE",
        company_name="Reliance Industries",
        setup_type="52W High Breakout",
        entry_price=2500.0,
    )

    assert item["symbol"] == "RELIANCE"
    assert item["entry_price"] == 2500.0
    assert item["target_price"] == 2875.0  # +15% default
    assert item["stop_loss_price"] == 2375.0  # -5% default

    items = service.get_items()
    assert len(items) == 1
    assert items[0]["symbol"] == "RELIANCE"

    deleted = service.delete_item(item["id"])
    assert deleted is True

    items_after = service.get_items()
    assert len(items_after) == 0


def test_watchlist_ignores_pre_entry_target_and_stop_hits(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    service = WatchlistService(cache)

    cache.put(
        [
            OHLCVBar(
                timestamp=datetime(2026, 7, 23, tzinfo=UTC),
                symbol="RELIANCE",
                open=100.0,
                high=200.0,
                low=50.0,
                close=100.0,
                volume=1_000,
            ),
            OHLCVBar(
                timestamp=datetime(2026, 7, 24, tzinfo=UTC),
                symbol="RELIANCE",
                open=100.0,
                high=110.0,
                low=90.0,
                close=105.0,
                volume=1_000,
            ),
        ],
        "1day",
        "test",
    )
    cache.add_watchlist_item(
        WatchlistItem(
            id="watch-test",
            symbol="RELIANCE",
            company_name="Reliance Industries",
            setup_type="QA setup",
            entry_date="2026-07-24",
            entry_price=100.0,
            target_price=150.0,
            stop_loss_price=75.0,
            status="active",
            created_at="2026-07-24T00:00:00+00:00",
        )
    )

    items = service.get_items()

    assert items[0]["status"] == "active"
    assert items[0]["current_price"] == 105.0
