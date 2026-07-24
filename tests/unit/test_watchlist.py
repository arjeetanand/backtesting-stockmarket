from pathlib import Path

from quant_research.repositories.market_cache import SqliteMarketCache
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
