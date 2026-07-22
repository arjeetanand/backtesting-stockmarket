"""Batch importer for NSE's official daily Common Bhavcopy archives."""

from __future__ import annotations

import csv
import io
import os
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache

SENSEX_NSE_STARTER = (
    "ADANIPORTS", "ASIANPAINT", "AXISBANK", "BAJAJFINSV", "BAJFINANCE", "BEL", "BHARTIARTL", "ETERNAL",
    "HCLTECH", "HDFCBANK", "HINDUNILVR", "ICICIBANK", "INFY", "ITC", "KOTAKBANK", "LT", "M&M", "MARUTI",
    "NTPC", "POWERGRID", "RELIANCE", "SBIN", "SUNPHARMA", "TATASTEEL", "TCS", "TECHM", "TITAN", "TMPV", "TRENT", "ULTRACEMCO",
)
BANKING_STARTER = ("AUBANK", "AXISBANK", "BANKBARODA", "BANDHANBNK", "CANBK", "FEDERALBNK", "HDFCBANK", "ICICIBANK", "IDFCFIRSTB", "INDUSINDBK", "KOTAKBANK", "PNB", "SBIN", "YESBANK")
SECTOR_ETF_STARTER = ("AUTOBEES", "BANKBEES", "CPSEETF", "FMCGIETF", "INFRABEES", "ITBEES", "PHARMABEES", "PSUBANK")


@dataclass(frozen=True, slots=True)
class NseImportResult:
    downloaded_days: int
    skipped_days: int
    stored_bars: int
    already_available_days: int
    reused_archive_days: int = 0
    archive_rows: int = 0


class NseBhavcopyImporter:
    """Caches complete official NSE archives and loads their full contents locally."""

    # Current NSE CM-UDiFF Common Bhavcopy filename, published via NSE All Reports.
    current_archive_url = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{year}{month_number}{day}_F_0000.csv.zip"
    # NSE's official historical equity archive format used before UDiFF.
    legacy_archive_url = "https://archives.nseindia.com/content/historical/EQUITIES/{year}/{month_name}/cm{day}{month_abbr}{year}bhav.csv.zip"

    def __init__(self, cache: SqliteMarketCache, timeout_seconds: float = 30.0, archive_path: Path | None = None) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds
        self._archive_path = archive_path or cache.path.parent / "nse_archives"
        self._archive_path.mkdir(parents=True, exist_ok=True)
        self._organize_legacy_flat_archives()

    def import_daily_universe(
        self,
        symbols: list[str],
        start: date,
        end: date,
        progress: Callable[[str, int, int], None] | None = None,
    ) -> NseImportResult:
        selected = {symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()}
        downloaded_days = skipped_days = stored_bars = already_available_days = reused_archive_days = archive_rows = 0
        cursor = start
        total_weekdays = sum(1 for offset in range((end - start).days + 1) if (start + timedelta(days=offset)).weekday() < 5)
        processed_weekdays = 0
        while cursor <= end:
            if cursor.weekday() < 5:
                processed_weekdays += 1
                if self._cache.is_nse_day_covered(list(selected), "1day", cursor):
                    already_available_days += 1
                    if progress:
                        progress("Checking local cache", processed_weekdays, total_weekdays)
                    cursor += timedelta(days=1)
                    continue
                if self._cache.is_nse_day_unavailable(cursor):
                    skipped_days += 1
                    if progress:
                        progress("Checking local cache", processed_weekdays, total_weekdays)
                    cursor += timedelta(days=1)
                    continue
                archive_file = self._existing_archive_file(cursor)
                loaded_from_disk = archive_file is not None
                rows: list[dict[str, str]] | None
                if archive_file is not None:
                    if progress:
                        progress("Loading saved NSE archive", processed_weekdays, total_weekdays)
                    rows = self._read_archive(archive_file.read_bytes(), cursor)
                    reused_archive_days += 1
                else:
                    if progress:
                        progress("Downloading missing NSE archives", processed_weekdays, total_weekdays)
                    rows = self._download_day(cursor)
                if rows is None:
                    skipped_days += 1
                    self._cache.record_nse_day_unavailable(cursor, self._archive_url(cursor))
                else:
                    if not loaded_from_disk:
                        downloaded_days += 1
                    bars = self._bars_for_rows(rows, None, cursor)
                    if progress:
                        progress("Saving complete NSE archive to SQLite", processed_weekdays, total_weekdays)
                    saved_rows, saved_bars = self._cache.store_nse_archive(
                        cursor,
                        rows,
                        bars,
                        "1day",
                        source="nse_common_bhavcopy",
                        symbols=list(selected),
                        archive_path=str(archive_file) if archive_file is not None else None,
                        source_url=self._archive_url(cursor),
                    )
                    archive_rows += saved_rows
                    stored_bars += saved_bars
            cursor += timedelta(days=1)
        if downloaded_days == 0 and reused_archive_days == 0 and already_available_days == 0 and skipped_days == 0:
            raise RuntimeError("No NSE Bhavcopy archive was downloaded. Check the chosen dates or retry after NSE archive access is available.")
        return NseImportResult(downloaded_days, skipped_days, stored_bars, already_available_days, reused_archive_days, archive_rows)

    def _download_day(self, trading_day: date) -> list[dict[str, str]] | None:
        url = self._archive_url(trading_day)
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
                "Accept": "application/zip,application/octet-stream;q=0.9,*/*;q=0.8",
                "Referer": "https://www.nseindia.com/",
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                payload = response.read()
        except HTTPError as exc:
            if exc.code == 404:
                return None
            if exc.code == 403:
                raise RuntimeError("NSE denied the archive request (HTTP 403). Retry after a short pause; the importer now uses NSE-compatible browser headers.") from exc
            raise RuntimeError(f"NSE archive returned HTTP {exc.code} for {trading_day.isoformat()}.") from exc
        except URLError as exc:
            raise RuntimeError("Could not reach NSE's official archive.") from exc
        rows = self._read_archive(payload, trading_day)
        archive_file = self._archive_file(trading_day)
        archive_file.parent.mkdir(parents=True, exist_ok=True)
        temporary_file = archive_file.with_name(f".{archive_file.name}.{os.getpid()}.tmp")
        temporary_file.write_bytes(payload)
        try:
            os.replace(temporary_file, archive_file)
        except FileNotFoundError:
            # A cloud-sync process or another importer may have completed the
            # same date between the write and rename. Accept that valid final
            # file; otherwise surface the failure for a safe retry.
            if not archive_file.exists():
                raise
        return rows

    def _archive_url(self, trading_day: date) -> str:
        if trading_day < date(2024, 1, 1):
            return self.legacy_archive_url.format(
                year=trading_day.year,
                month_name=trading_day.strftime("%b").upper(),
                month_abbr=trading_day.strftime("%b").upper(),
                day=trading_day.strftime("%d"),
            )
        return self.current_archive_url.format(
            year=trading_day.year,
            month_number=trading_day.strftime("%m"),
            day=trading_day.strftime("%d"),
        )

    def _archive_file(self, trading_day: date) -> Path:
        return self._archive_path / str(trading_day.year) / f"nse_bhavcopy_{trading_day.isoformat()}.csv.zip"

    def _existing_archive_file(self, trading_day: date) -> Path | None:
        """Find the year-organized archive, with compatibility for old flat files."""
        organized = self._archive_file(trading_day)
        if organized.exists():
            return organized
        flat = self._archive_path / f"nse_bhavcopy_{trading_day.isoformat()}.csv.zip"
        return flat if flat.exists() else None

    def _organize_legacy_flat_archives(self) -> None:
        """Move previously cached flat ZIPs into their year folders without deleting data."""
        for flat in self._archive_path.glob("nse_bhavcopy_*.csv.zip"):
            try:
                trading_day = date.fromisoformat(flat.name.removeprefix("nse_bhavcopy_").removesuffix(".csv.zip"))
            except ValueError:
                continue
            organized = self._archive_file(trading_day)
            if organized.exists():
                continue
            organized.parent.mkdir(parents=True, exist_ok=True)
            flat.replace(organized)

    @staticmethod
    def _read_archive(payload: bytes, trading_day: date) -> list[dict[str, str]]:
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                filename = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
                text = archive.read(filename).decode("utf-8-sig")
            return list(csv.DictReader(io.StringIO(text)))
        except (OSError, StopIteration, UnicodeDecodeError, zipfile.BadZipFile) as exc:
            raise RuntimeError(f"NSE archive was not a readable Bhavcopy for {trading_day.isoformat()}.") from exc

    @staticmethod
    def _bars_for_rows(rows: list[dict[str, str]], symbols: set[str] | None, trading_day: date) -> list[OHLCVBar]:
        bars: list[OHLCVBar] = []
        for row in rows:
            normalized = {key.strip().upper(): str(value).strip() for key, value in row.items() if key}
            symbol = normalized.get("SYMBOL") or normalized.get("TCKRSYMB")
            series = normalized.get("SERIES") or normalized.get("SCTYSRS")
            if not symbol or (symbols is not None and symbol not in symbols) or (series and series not in {"EQ", "BE", "ETF"}):
                continue
            try:
                bars.append(
                    OHLCVBar(
                        timestamp=datetime.combine(trading_day, datetime.min.time(), tzinfo=UTC),
                        symbol=symbol,
                        open=float(NseBhavcopyImporter._required_value(normalized, "OPEN", "OPEN_PRICE", "OPNPRIC")),
                        high=float(NseBhavcopyImporter._required_value(normalized, "HIGH", "HIGH_PRICE", "HGHPRIC")),
                        low=float(NseBhavcopyImporter._required_value(normalized, "LOW", "LOW_PRICE", "LWPRIC")),
                        close=float(NseBhavcopyImporter._required_value(normalized, "CLOSE", "CLOSE_PRICE", "CLSPRIC")),
                        volume=float(NseBhavcopyImporter._optional_value(normalized, "TOTTRDQTY", "TTL_TRD_QNTY", "TTLTRADGVOL") or "0"),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return bars

    @staticmethod
    def _required_value(values: dict[str, str], *keys: str) -> str:
        for key in keys:
            value = values.get(key)
            if value:
                return value
        raise KeyError(keys[0])

    @staticmethod
    def _optional_value(values: dict[str, str], *keys: str) -> str | None:
        for key in keys:
            value = values.get(key)
            if value:
                return value
        return None
