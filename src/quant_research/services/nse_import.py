"""Batch importer for NSE's official daily Common Bhavcopy archives."""

from __future__ import annotations

import csv
import io
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
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


class NseBhavcopyImporter:
    """Downloads one official NSE archive per weekday and filters it locally."""

    # Current NSE CM-UDiFF Common Bhavcopy filename, published via NSE All Reports.
    archive_url = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{year}{month_number}{day}_F_0000.csv.zip"

    def __init__(self, cache: SqliteMarketCache, timeout_seconds: float = 30.0) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds

    def import_daily_universe(
        self,
        symbols: list[str],
        start: date,
        end: date,
        progress: Callable[[str, int, int], None] | None = None,
    ) -> NseImportResult:
        selected = {symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()}
        downloaded_days = skipped_days = stored_bars = already_available_days = 0
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
                if progress:
                    progress("Downloading official NSE archives", processed_weekdays, total_weekdays)
                rows = self._download_day(cursor)
                if rows is None:
                    skipped_days += 1
                else:
                    downloaded_days += 1
                    bars = self._bars_for_rows(rows, selected, cursor)
                    if progress:
                        progress("Saving missing bars to the local cache", processed_weekdays, total_weekdays)
                    stored_bars += self._cache.put(bars, "1day", source="nse_common_bhavcopy")
                    # Track an archive even if a requested symbol was not listed that day.
                    # This makes a future click idempotent and avoids re-downloading holidays/listing gaps.
                    self._cache.mark_nse_day_covered(list(selected), "1day", cursor)
            cursor += timedelta(days=1)
        if downloaded_days == 0 and already_available_days == 0:
            raise RuntimeError("No NSE Bhavcopy archive was downloaded. Check the chosen dates or retry after NSE archive access is available.")
        return NseImportResult(downloaded_days, skipped_days, stored_bars, already_available_days)

    def _download_day(self, trading_day: date) -> list[dict[str, str]] | None:
        url = self.archive_url.format(
            year=trading_day.year,
            month_number=trading_day.strftime("%m"),
            day=trading_day.strftime("%d"),
        )
        request = Request(url, headers={"User-Agent": "Backtrack research cache/1.0", "Accept": "application/zip"})
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                payload = response.read()
        except HTTPError as exc:
            if exc.code == 404:
                return None
            raise RuntimeError(f"NSE archive returned HTTP {exc.code} for {trading_day.isoformat()}.") from exc
        except URLError as exc:
            raise RuntimeError("Could not reach NSE's official archive.") from exc
        try:
            with zipfile.ZipFile(io.BytesIO(payload)) as archive:
                filename = next(name for name in archive.namelist() if name.lower().endswith(".csv"))
                text = archive.read(filename).decode("utf-8-sig")
            return list(csv.DictReader(io.StringIO(text)))
        except (OSError, StopIteration, UnicodeDecodeError, zipfile.BadZipFile) as exc:
            raise RuntimeError(f"NSE archive was not a readable Bhavcopy for {trading_day.isoformat()}.") from exc

    @staticmethod
    def _bars_for_rows(rows: list[dict[str, str]], symbols: set[str], trading_day: date) -> list[OHLCVBar]:
        bars: list[OHLCVBar] = []
        for row in rows:
            normalized = {key.strip().upper(): str(value).strip() for key, value in row.items() if key}
            symbol = normalized.get("SYMBOL") or normalized.get("TCKRSYMB")
            series = normalized.get("SERIES") or normalized.get("SCTYSRS")
            if symbol not in symbols or (series and series not in {"EQ", "BE", "ETF"}):
                continue
            try:
                bars.append(
                    OHLCVBar(
                        timestamp=datetime.combine(trading_day, datetime.min.time(), tzinfo=UTC),
                        symbol=symbol,
                        open=float(normalized.get("OPEN") or normalized["OPNPRIC"]),
                        high=float(normalized.get("HIGH") or normalized["HGHPRIC"]),
                        low=float(normalized.get("LOW") or normalized["LWPRIC"]),
                        close=float(normalized.get("CLOSE") or normalized["CLSPRIC"]),
                        volume=float(normalized.get("TOTTRDQTY") or normalized.get("TTLTRADGVOL") or 0),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue
        return bars
