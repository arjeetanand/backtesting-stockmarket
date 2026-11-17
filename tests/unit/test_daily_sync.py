from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import MagicMock

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.daily_sync import DailySyncService


def test_daily_sync_uses_india_session_date_and_retries_unavailable_archives(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    latest = datetime(2026, 10, 27, tzinfo=UTC)
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
    mock_result.downloaded_days = 0
    mock_result.skipped_days = 1
    mock_importer.import_daily_universe.return_value = mock_result

    service = DailySyncService(cache, importer=mock_importer)
    result = service.sync_latest(now=datetime(2026, 10, 29, 9, 25, tzinfo=UTC))

    assert "synced_days" in result
    assert "latest_trading_day" in result
    assert "not available yet" in result["message"]
    mock_importer.import_daily_universe.assert_called_once()
    args, kwargs = mock_importer.import_daily_universe.call_args
    assert args == (["RELIANCE"],)
    assert kwargs["start"] == kwargs["end"] == date(2026, 10, 28)
    assert kwargs["retry_unavailable"] is True
    assert result["latest_trading_day"] == latest.isoformat()


def test_daily_sync_includes_today_only_after_archive_publication_buffer(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    latest = datetime(2026, 10, 27, tzinfo=UTC)
    cache.put(
        [OHLCVBar(timestamp=latest, symbol="RELIANCE", open=100, high=101, low=99, close=100, volume=1_000)],
        "1day",
        "official-nse-test",
    )
    importer = MagicMock()
    importer.import_daily_universe.return_value = MagicMock(downloaded_days=1, skipped_days=0)

    result = DailySyncService(cache, importer=importer).sync_latest(
        now=datetime(2026, 10, 29, 12, 30, tzinfo=UTC)
    )

    _, kwargs = importer.import_daily_universe.call_args
    assert kwargs["start"] == date(2026, 10, 28)
    assert kwargs["end"] == date(2026, 10, 29)
    assert "2026-10-27" in result["message"]
