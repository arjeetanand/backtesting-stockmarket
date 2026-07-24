from pathlib import Path
from unittest.mock import MagicMock

from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.daily_sync import DailySyncService


def test_daily_sync_service(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    mock_importer = MagicMock()
    mock_result = MagicMock()
    mock_result.downloaded_days = 2
    mock_importer.import_range.return_value = mock_result

    service = DailySyncService(cache, importer=mock_importer)
    result = service.sync_latest()

    assert "synced_days" in result
    assert "latest_trading_day" in result
    assert "message" in result
