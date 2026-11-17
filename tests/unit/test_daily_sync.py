from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services import daily_sync
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


def test_analysis_sync_context_keeps_partial_status_and_data_dates(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    class StubSync:
        def __init__(self, _cache: SqliteMarketCache) -> None:
            pass

        def sync_latest(self) -> dict[str, object]:
            return {
                "status": "partial",
                "message": "Latest saved NSE daily data is 2026-11-16; 1 weekday archive is not available yet.",
                "target_trading_day": "2026-11-17",
                "latest_trading_day": "2026-11-16T00:00:00+00:00",
                "synced_days": 0,
                "skipped_days": 1,
            }

    monkeypatch.setattr(daily_sync, "DailySyncService", StubSync)

    result = daily_sync.sync_latest_for_analysis(SqliteMarketCache(tmp_path / "cache.sqlite3"))

    assert result == {
        "status": "partial",
        "message": "Latest saved NSE daily data is 2026-11-16; 1 weekday archive is not available yet.",
        "target_trading_day": "2026-11-17",
        "latest_trading_day": "2026-11-16",
        "synced_days": 0,
        "skipped_days": 1,
    }


def test_analysis_sync_context_falls_back_to_saved_cache_without_leaking_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    latest = datetime(2026, 11, 16, tzinfo=UTC)
    cache.put(
        [OHLCVBar(timestamp=latest, symbol="RELIANCE", open=100, high=101, low=99, close=100, volume=1_000)],
        "1day",
        "official-nse-test",
    )

    class FailingSync:
        def __init__(self, _cache: SqliteMarketCache) -> None:
            pass

        def sync_latest(self) -> dict[str, object]:
            raise RuntimeError("private network diagnostic")

    monkeypatch.setattr(daily_sync, "DailySyncService", FailingSync)

    result = daily_sync.sync_latest_for_analysis(cache)

    assert result["status"] == "failed"
    assert result["latest_trading_day"] == latest.date().isoformat()
    assert "saved local bars" in result["message"]
    assert "private network diagnostic" not in result["message"]
