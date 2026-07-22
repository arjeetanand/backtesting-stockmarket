"""Official NSE equity-security catalogue importer."""

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
    """Raised when the official NSE equity-security file is unavailable or malformed."""


@dataclass(frozen=True, slots=True)
class CatalogueRefreshResult:
    instruments: int
    source: str


class Nifty500CatalogueImporter:
    """Downloads NSE's complete tradable equity list into the local symbol catalogue.

    The historical class name is retained so existing deployments keep working.  The
    source is deliberately the full equity-security list, not an index constituent
    list, so an IPO appears after the next catalogue refresh.
    """

    source_url = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"

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
            raise Nifty500CatalogueError(f"Official NSE equity list returned HTTP {exc.code}. Please retry later.") from exc
        except URLError as exc:
            raise Nifty500CatalogueError("Could not reach the official NSE equity-security list.") from exc
        instruments = self._parse(payload)
        if len(instruments) < 1_000:
            raise Nifty500CatalogueError("Official NSE equity list did not contain a complete tradable equity catalogue.")
        self._cache.replace_instruments(instruments, universe="nse_equities", source=self.source_url)
        return CatalogueRefreshResult(instruments=len(instruments), source=self.source_url)

    @staticmethod
    def _parse(payload: str) -> list[Instrument]:
        rows = csv.DictReader(io.StringIO(payload))
        instruments: list[Instrument] = []
        seen: set[str] = set()
        for row in rows:
            normalized = {str(key).strip().upper(): str(value).strip() for key, value in row.items() if key}
            symbol = normalized.get("SYMBOL", "").upper()
            company_name = normalized.get("NAME OF COMPANY") or normalized.get("COMPANY NAME") or normalized.get("COMPANY") or ""
            series = normalized.get("SERIES") or None
            # These are the cash-equity series supported by the Bhavcopy importer.
            if not symbol or not company_name or symbol in seen or series not in {"EQ", "BE"}:
                continue
            seen.add(symbol)
            instruments.append(
                Instrument(
                    symbol=symbol,
                    company_name=company_name,
                    industry=normalized.get("INDUSTRY") or None,
                    series=series,
                    isin=normalized.get("ISIN NUMBER") or normalized.get("ISIN CODE") or normalized.get("ISIN") or None,
                )
            )
        return instruments
