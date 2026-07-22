"""Official Nifty 500 constituent catalogue importer."""

from __future__ import annotations

import csv
import io
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from quant_research.repositories.market_cache import Instrument, SqliteMarketCache


class Nifty500CatalogueError(RuntimeError):
    """Raised when the official constituent file is unavailable or malformed."""


@dataclass(frozen=True, slots=True)
class CatalogueRefreshResult:
    instruments: int
    source: str


class Nifty500CatalogueImporter:
    """Downloads the published NSE constituent CSV and persists a searchable local catalogue."""

    # Linked by NSE's own Nifty 500 product page (not the retired niftyindices.com URL).
    source_url = "https://nsearchives.nseindia.com/content/indices/ind_nifty500list.csv"

    def __init__(
        self,
        cache: SqliteMarketCache,
        timeout_seconds: float = 30.0,
        opener: Callable[..., Any] = urlopen,
    ) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds
        self._opener = opener

    def refresh(self) -> CatalogueRefreshResult:
        request = Request(self.source_url, headers={"User-Agent": "Backtrack research catalogue/1.0", "Accept": "text/csv"})
        try:
            with self._opener(request, timeout=self._timeout_seconds) as response:
                payload = response.read().decode("utf-8-sig")
        except HTTPError as exc:
            raise Nifty500CatalogueError(f"Official NSE Nifty 500 file returned HTTP {exc.code}. Please retry later.") from exc
        except URLError as exc:
            raise Nifty500CatalogueError("Could not reach the official NSE Nifty 500 constituent file.") from exc
        instruments = self._parse(payload)
        if len(instruments) < 400:
            raise Nifty500CatalogueError("Official NSE constituent file did not contain a complete Nifty 500 catalogue.")
        self._cache.replace_instruments(instruments, universe="nifty500", source=self.source_url)
        return CatalogueRefreshResult(instruments=len(instruments), source=self.source_url)

    @staticmethod
    def _parse(payload: str) -> list[Instrument]:
        rows = csv.DictReader(io.StringIO(payload))
        instruments: list[Instrument] = []
        seen: set[str] = set()
        for row in rows:
            normalized = {str(key).strip().upper(): str(value).strip() for key, value in row.items() if key}
            symbol = normalized.get("SYMBOL", "").upper()
            company_name = normalized.get("COMPANY NAME") or normalized.get("COMPANY") or ""
            if not symbol or not company_name or symbol in seen:
                continue
            seen.add(symbol)
            instruments.append(
                Instrument(
                    symbol=symbol,
                    company_name=company_name,
                    industry=normalized.get("INDUSTRY") or None,
                    series=normalized.get("SERIES") or None,
                    isin=normalized.get("ISIN CODE") or normalized.get("ISIN") or None,
                )
            )
        return instruments
