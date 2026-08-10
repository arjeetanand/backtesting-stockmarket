"""Small official NSE daily index-archive importer used by insight charts."""

from __future__ import annotations

import csv
import io
import os
from collections.abc import Callable
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from quant_research.repositories.market_cache import IndexClose, SqliteMarketCache


class NseIndexArchiveImporter:
    current_url = "https://nsearchives.nseindia.com/content/indices/ind_close_all_{day}{month}{year}.csv"
    legacy_url = "https://archives.nseindia.com/content/indices/ind_close_all_{day}{month}{year}.csv"

    def __init__(self, cache: SqliteMarketCache, timeout_seconds: float = 15.0, archive_path: Path | None = None) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds
        self._archive_path = archive_path or cache.path.parent / "nse_archives" / "indices"
        self._archive_path.mkdir(parents=True, exist_ok=True)

    def import_days(self, trading_days: list[date], progress: Callable[[str], None] | None = None) -> int:
        stored: list[IndexClose] = []
        for trading_day in sorted(set(trading_days)):
            if self._cache.get_index_closes(trading_day, trading_day):
                continue
            if progress:
                progress(f"Checking Nifty 50 archive for {trading_day.isoformat()}")
            payload, source = self._download_day(trading_day)
            if payload is None:
                continue
            close = self._parse_nifty50_close(payload)
            if close is None:
                continue
            archive_file = self._archive_path / str(trading_day.year) / f"ind_close_all_{trading_day.strftime('%d%m%Y')}.csv"
            archive_file.parent.mkdir(parents=True, exist_ok=True)
            temporary_file = archive_file.with_name(f".{archive_file.name}.{os.getpid()}.tmp")
            temporary_file.write_bytes(payload)
            os.replace(temporary_file, archive_file)
            stored.append(IndexClose(trading_day, close, source))
        return self._cache.store_index_closes(stored)

    def _download_day(self, trading_day: date) -> tuple[bytes | None, str]:
        for template in (self.current_url, self.legacy_url):
            url = template.format(day=trading_day.strftime("%d"), month=trading_day.strftime("%m"), year=trading_day.strftime("%Y"))
            request = Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "text/csv,*/*", "Referer": "https://www.nseindia.com/"})
            try:
                with urlopen(request, timeout=self._timeout_seconds) as response:
                    return response.read(), url
            except HTTPError as exc:
                if exc.code != 404:
                    break
            except URLError:
                break
        return None, self.current_url

    @staticmethod
    def _parse_nifty50_close(payload: bytes) -> float | None:
        try:
            text = payload.decode("utf-8-sig")
            for row in csv.DictReader(io.StringIO(text)):
                normalized = {str(key).strip().upper(): str(value).strip() for key, value in row.items() if key}
                name = normalized.get("INDEX NAME") or normalized.get("INDEX") or normalized.get("INDEX_NAME")
                if name and name.upper().replace(" ", "") in {"NIFTY50", "NIFTY50PR", "NIFTY50TR"}:
                    value = normalized.get("CLOSING INDEX VALUE") or normalized.get("CLOSE") or normalized.get("CLOSING_VALUE")
                    return float(str(value).replace(",", "")) if value else None
        except (UnicodeDecodeError, ValueError, csv.Error):
            return None
        return None
