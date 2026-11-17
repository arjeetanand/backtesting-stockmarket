"""One-Click Daily Sync service for official NSE market data."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.nse_import import NseBhavcopyImporter

INDIA_TZ = ZoneInfo("Asia/Kolkata")
NSE_DAILY_ARCHIVE_READY_AT = time(18, 0)


@dataclass(frozen=True, slots=True)
class DailySyncResult:
    synced_days: int
    latest_trading_day: str
    message: str


class DailySyncService:
    def __init__(self, cache: SqliteMarketCache, importer: NseBhavcopyImporter | None = None) -> None:
        self._cache = cache
        self._importer = importer or NseBhavcopyImporter(cache)

    def sync_latest(self, now: datetime | None = None) -> dict[str, Any]:
        summary = self._cache.summary()
        current = now or datetime.now(UTC)
        if current.tzinfo is None:
            current = current.replace(tzinfo=UTC)
        local_now = current.astimezone(INDIA_TZ)
        latest_sync_date = local_now.date()
        # Today's daily archive is not complete during market hours; allow a publication buffer after close.
        if local_now.time().replace(tzinfo=None) < NSE_DAILY_ARCHIVE_READY_AT:
            latest_sync_date -= timedelta(days=1)

        if summary.latest:
            latest_dt = summary.latest.date()
        else:
            latest_dt = latest_sync_date - timedelta(days=7)

        # Build list of candidate business trading days to sync
        missing_days: list[date] = []
        curr = latest_dt + timedelta(days=1)
        while curr <= latest_sync_date:
            # Skip weekends (Saturday=5, Sunday=6)
            if curr.weekday() < 5:
                missing_days.append(curr)
            curr += timedelta(days=1)

        if not missing_days:
            latest_day = summary.latest.date().isoformat() if summary.latest else None
            return {
                "status": "complete" if latest_day else "partial",
                "synced_days": 0,
                "skipped_days": 0,
                "target_trading_day": latest_sync_date.isoformat(),
                "latest_trading_day": summary.latest.isoformat() if summary.latest else None,
                "message": f"Latest saved NSE daily data is {latest_day}." if latest_day else "No NSE daily data is saved yet.",
            }

        # Import missing date range
        start_date = missing_days[0]
        end_date = missing_days[-1]

        # The official archive is exchange-wide.  A stable representative symbol
        # lets the importer run its per-symbol coverage check while it persists
        # every supported row from each archive day.
        res = self._importer.import_daily_universe(
            ["RELIANCE"],
            start=start_date,
            end=end_date,
            retry_unavailable=True,
        )
        new_summary = self._cache.summary()
        latest_day = new_summary.latest.date().isoformat() if new_summary.latest else None
        if res.skipped_days:
            message = f"Latest saved NSE daily data is {latest_day}; {res.skipped_days} weekday archive(s) are not available yet. Try again after NSE publishes them."
        elif latest_day:
            message = f"Latest saved NSE daily data is {latest_day}."
        else:
            message = f"No NSE daily archive is saved yet; the last requested date was {end_date.isoformat()}."

        return {
            "status": "partial" if res.skipped_days or not latest_day else "complete",
            "synced_days": res.downloaded_days,
            "skipped_days": res.skipped_days,
            "target_trading_day": end_date.isoformat(),
            "latest_trading_day": new_summary.latest.isoformat() if new_summary.latest else None,
            "message": message,
        }


def market_sync_context(result: dict[str, Any]) -> dict[str, Any]:
    status = result.get("status")
    return {
        "status": status if status in {"complete", "partial", "failed"} else "partial",
        "message": str(result.get("message", "NSE daily freshness check finished.")),
        "target_trading_day": _sync_day(result.get("target_trading_day")),
        "latest_trading_day": _sync_day(result.get("latest_trading_day")),
        "synced_days": int(result.get("synced_days", 0)),
        "skipped_days": int(result.get("skipped_days", 0)),
    }


def _sync_day(value: object) -> str | None:
    return str(value)[:10] if value is not None else None


def sync_latest_for_analysis(cache: SqliteMarketCache) -> dict[str, Any]:
    """Check for missing official NSE sessions and retain a safe cached-data fallback."""
    try:
        return market_sync_context(DailySyncService(cache).sync_latest())
    except Exception:
        try:
            latest = cache.summary().latest
        except Exception:
            latest = None
        return {
            "status": "failed",
            "message": "Could not check the latest official NSE daily archive. This review uses saved local bars; verify its data date.",
            "target_trading_day": None,
            "latest_trading_day": _sync_day(latest.isoformat()) if latest else None,
            "synced_days": 0,
            "skipped_days": 0,
        }
