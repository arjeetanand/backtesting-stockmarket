"""Official NSE FII/FPI and DII report importer."""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from quant_research.repositories.market_cache import FiiDiiRow, SqliteMarketCache
from quant_research.services.nse_indices import NseIndexArchiveImporter


class FiiDiiImportError(RuntimeError):
    """Raised when the official NSE report cannot be downloaded or parsed."""


class NseFiiDiiImporter:
    """Fetch, archive, and normalize NSE's public institutional-flow report."""

    report_url = "https://www.nseindia.com/api/fiidiiTradeReact"
    report_page_url = "https://www.nseindia.com/reports/fii-dii/"

    def __init__(self, cache: SqliteMarketCache, timeout_seconds: float = 30.0, archive_path: Path | None = None, index_importer: NseIndexArchiveImporter | None = None) -> None:
        self._cache = cache
        self._timeout_seconds = timeout_seconds
        self._archive_path = archive_path or cache.path.parent / "nse_archives" / "fii_dii"
        self._archive_path.mkdir(parents=True, exist_ok=True)
        self._index_importer = index_importer or NseIndexArchiveImporter(cache, archive_path=self._archive_path.parent / "indices")

    def import_reports(
        self,
        start: date,
        end: date,
        scope: str = "combined",
        progress: Callable[[str], None] | None = None,
    ) -> tuple[int, date | None, date | None]:
        if start > end:
            raise FiiDiiImportError("start must be on or before end.")
        if scope not in {"combined", "nse_only"}:
            raise FiiDiiImportError("scope must be combined or nse_only.")
        # NSE's public report endpoint is a latest-session snapshot. It does
        # not implement historical date parameters, so querying a month of
        # guessed URLs would only repeat the latest row and waste time. Fetch
        # the official snapshot once; historical rows are available only when
        # they have already been captured in the local archive/cache.
        if progress:
            progress("Downloading the latest official NSE FII/DII snapshot")
        payload = self._download_report(self.report_url)
        rows = self._rows_from_payload(payload, scope=scope, source_url=self.report_url)
        filtered = [row for row in rows if start <= row.trading_day <= end]
        payloads: list[tuple[str, object]] = [(self.report_url, payload)] if filtered else []

        fetched_at = datetime.now(UTC)
        stored = 0
        all_days: set[date] = set()
        for archive_index, (source_url, payload) in enumerate(payloads):
            payload_text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
            rows = self._rows_from_payload(payload, scope=scope, source_url=source_url)
            filtered = [row for row in rows if start <= row.trading_day <= end]
            if not filtered:
                continue
            archive_suffix = f"_{archive_index}" if len(payloads) > 1 else ""
            snapshot_id = f"fii_dii_{fetched_at.strftime('%Y%m%dT%H%M%S')}_{os.getpid()}{archive_suffix}"
            archive_file = self._archive_path / f"fii_dii_snapshot_{fetched_at.strftime('%Y%m%dT%H%M%S')}{archive_suffix}.json"
            archive_file.write_text(payload_text, encoding="utf-8")
            stored += self._cache.store_fii_dii_snapshot(
                snapshot_id=snapshot_id,
                fetched_at=fetched_at,
                source_url=source_url,
                payload=payload_text,
                rows=filtered,
            )
            all_days.update(row.trading_day for row in filtered)

        if all_days:
            # Index archives are best effort; institutional-flow data remains
            # available when an exchange index archive is unavailable.
            self._index_importer.import_days(sorted(all_days))
        if progress:
            if stored and len(all_days) == 1 and start < max(all_days):
                progress(
                    "Saved the latest NSE session. NSE's public FII/DII report does not expose historical date-range downloads; "
                    "older sessions must already exist in the local archive."
                )
            else:
                progress(f"Saved {stored} official NSE FII/DII rows")
        days = sorted(all_days)
        return stored, days[0] if days else None, days[-1] if days else None

    def _download_report(self, url: str | None = None) -> object:
        url = url or self.report_url
        request = Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
                "Accept": "application/json,text/plain,*/*",
                "Referer": self.report_page_url,
                "Accept-Language": "en-US,en;q=0.9",
            },
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise FiiDiiImportError(f"NSE FII/DII report returned HTTP {exc.code}. Retry after a short pause.") from exc
        except (URLError, TimeoutError) as exc:
            raise FiiDiiImportError("Could not reach NSE's official FII/DII report.") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FiiDiiImportError("NSE returned an unreadable FII/DII report.") from exc

    @classmethod
    def _rows_from_payload(
        cls,
        payload: object,
        scope: str = "combined",
        source_url: str | None = None,
    ) -> list[FiiDiiRow]:
        """Normalize NSE's evolving JSON field names without inventing missing values."""
        records: list[dict[str, object]] = []
        if isinstance(payload, list):
            records = [item for item in payload if isinstance(item, dict)]
        elif isinstance(payload, dict):
            for key in ("data", "rows", "records", "fiidii", "fiiDii"):
                candidate = payload.get(key)
                if isinstance(candidate, list):
                    records = [item for item in candidate if isinstance(item, dict)]
                    break
        rows: list[FiiDiiRow] = []
        for record in records:
            participant = cls._participant(record)
            if participant is None:
                continue
            trading_day = cls._date(record.get("date") or record.get("tradingDate") or record.get("tradeDate"))
            buy = cls._number(record.get("buyValue") or record.get("buy_value") or record.get("buy"))
            sell = cls._number(record.get("sellValue") or record.get("sell_value") or record.get("sell"))
            net = cls._number(record.get("netValue") or record.get("net_value") or record.get("net"))
            if trading_day is None or buy is None or sell is None:
                continue
            rows.append(FiiDiiRow(
                trading_day=trading_day,
                participant=participant,
                scope=cls._scope(record, scope),
                segment=cls._segment(record),
                buy_value=buy,
                sell_value=sell,
                net_value=net if net is not None else round(buy - sell, 2),
                source=source_url or cls.report_url,
            ))
        return rows

    @staticmethod
    def _participant(record: dict[str, object]) -> str | None:
        value = str(record.get("category") or record.get("participant") or record.get("investorType") or "").strip().upper()
        if value.startswith("DII") or "DOMESTIC" in value:
            return "DII"
        if value.startswith("FII") or value.startswith("FPI") or "FOREIGN" in value:
            return "FII"
        return None

    @staticmethod
    def _scope(record: dict[str, object], requested: str) -> str:
        value = str(record.get("scope") or record.get("market") or record.get("exchange") or "").strip().upper()
        if "NSE" in value and "BSE" not in value and "MSEI" not in value and "COMBINED" not in value:
            return "nse_only"
        if "COMBINED" in value or "BSE" in value or "MSEI" in value:
            return "combined"
        return requested

    @staticmethod
    def _segment(record: dict[str, object]) -> str:
        value = str(record.get("segment") or record.get("marketSegment") or record.get("series") or "").strip().lower()
        if "future" in value:
            return "index_future" if "index" in value else "stock_future"
        if "option" in value:
            return "index_option" if "index" in value else "stock_option"
        return "equity"

    @staticmethod
    def _date(value: object) -> date | None:
        if value is None:
            return None
        text = str(value).strip()
        for pattern in ("%d-%b-%Y", "%d-%B-%Y", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(text, pattern).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _number(value: object) -> float | None:
        if value is None:
            return None
        text = str(value).replace(",", "").replace("₹", "").replace("Cr.", "").strip()
        if not text or text in {"-", "NA", "N/A"}:
            return None
        try:
            return float(text)
        except ValueError:
            return None
