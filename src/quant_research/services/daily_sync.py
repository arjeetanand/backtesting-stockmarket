"""One-Click Daily Sync service for official NSE market data."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any

from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.nse_import import NseBhavcopyImporter


@dataclass(frozen=True, slots=True)
class DailySyncResult:
    synced_days: int
    latest_trading_day: str
    message: str


class DailySyncService:
    def __init__(self, cache: SqliteMarketCache, importer: NseBhavcopyImporter | None = None) -> None:
        self._cache = cache
        self._importer = importer or NseBhavcopyImporter(cache)

    def sync_latest(self) -> dict[str, Any]:
        summary = self._cache.summary()
        today = datetime.now(tz=UTC).date()

        if summary.latest:
            latest_dt = summary.latest.date()
        else:
            latest_dt = today - timedelta(days=7)

        # Build list of candidate business trading days to sync
        missing_days: list[date] = []
        curr = latest_dt + timedelta(days=1)
        while curr <= today:
            # Skip weekends (Saturday=5, Sunday=6)
            if curr.weekday() < 5:
                missing_days.append(curr)
            curr += timedelta(days=1)

        if not missing_days:
            return {
                "synced_days": 0,
                "latest_trading_day": summary.latest.isoformat() if summary.latest else today.isoformat(),
                "message": "Market data is already fully up to date with official NSE archives.",
            }

        # Import missing date range
        start_date = missing_days[0]
        end_date = missing_days[-1]

        # The official archive is exchange-wide.  A stable representative symbol
        # lets the importer run its per-symbol coverage check while it persists
        # every supported row from each archive day.
        res = self._importer.import_daily_universe(["RELIANCE"], start=start_date, end=end_date)
        new_summary = self._cache.summary()

        return {
            "synced_days": res.downloaded_days,
            "latest_trading_day": new_summary.latest.isoformat() if new_summary.latest else end_date.isoformat(),
            "message": f"Successfully synced {res.downloaded_days} missing trading day(s) up to {end_date.isoformat()}.",
        }
