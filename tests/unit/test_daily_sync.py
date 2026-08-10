from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.daily_sync import DailySyncService


def test_daily_sync_service(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    latest = datetime.now(tz=UTC).replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=3)
    cache.put(
        [
            OHLCVBar(
                timestamp=latest,
                symbol="RELIANCE",
                open=100,
                high=101,
                low=99,
                close=100,
                volume=1_000,
            )
        ],
        "1day",
        "official-nse-test",
    )
    mock_importer = MagicMock()
    mock_result = MagicMock()
    mock_result.downloaded_days = 2
    mock_importer.import_daily_universe.return_value = mock_result

    service = DailySyncService(cache, importer=mock_importer)
    result = service.sync_latest()

    assert "synced_days" in result
    assert "latest_trading_day" in result
    assert "message" in result
    mock_importer.import_daily_universe.assert_called_once()
    args, kwargs = mock_importer.import_daily_universe.call_args
    assert args == (["RELIANCE"],)
    assert kwargs["start"].weekday() < 5
    assert kwargs["end"] == datetime.now(tz=UTC).date()
