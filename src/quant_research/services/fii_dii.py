"""Official NSE FII/FPI and DII report importer."""

from __future__ import annotations

import json
import math
import os
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from quant_research.repositories.market_cache import FiiDiiRow, SqliteMarketCache
from quant_research.services.nse_indices import NseIndexArchiveImporter


class FiiDiiImportError(RuntimeError):
    """Raised when the official NSE report cannot be downloaded or parsed."""


TAPETIDE_HISTORY_START = date(2014, 1, 1)


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
        snapshot_stamp = fetched_at.strftime("%Y%m%dT%H%M%S%f")
        stored = 0
        all_days: set[date] = set()
        for archive_index, (source_url, payload) in enumerate(payloads):
            payload_text = json.dumps(payload, ensure_ascii=False, sort_keys=True)
            rows = self._rows_from_payload(payload, scope=scope, source_url=source_url)
            filtered = [row for row in rows if start <= row.trading_day <= end]
            if not filtered:
                continue
            changed_days: set[date] = set()
            changed_rows: list[FiiDiiRow] = []
            for trading_day in {row.trading_day for row in filtered}:
                day_rows = [row for row in filtered if row.trading_day == trading_day]
                first = day_rows[0]
                existing_rows = self._cache.get_fii_dii_rows(
                    trading_day,
                    trading_day,
                    scope=first.scope,
                    segment=first.segment,
                )
                existing = {
                    row.participant: (row.buy_value, row.sell_value, row.net_value)
                    for row in existing_rows
                }
                incoming = {
                    row.participant: (row.buy_value, row.sell_value, row.net_value)
                    for row in day_rows
                }
                if incoming != existing:
                    changed_days.add(trading_day)
                    changed_rows.extend(
                        row
                        for row in day_rows
                        if existing.get(row.participant) != (row.buy_value, row.sell_value, row.net_value)
                    )
            archive_suffix = f"_{archive_index}" if len(payloads) > 1 else ""
            if changed_days:
                snapshot_id = f"fii_dii_{snapshot_stamp}_{os.getpid()}{archive_suffix}"
                archive_file = self._archive_path / f"fii_dii_snapshot_{snapshot_stamp}{archive_suffix}.json"
                archive_file.write_text(payload_text, encoding="utf-8")
                stored += self._cache.store_fii_dii_snapshot(
                    snapshot_id=snapshot_id,
                    fetched_at=fetched_at,
                    source_url=source_url,
                    payload=payload_text,
                    rows=changed_rows,
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


class TapetideFiiDiiHistoryImporter:
    """Download Tapetide's documented daily cash-flow history into SQLite."""

    endpoint = "https://api.tapetide.com/v1/market/institutional-flows"
    api_error_messages = {
        "authentication_required": "Tapetide request is missing a valid token. Check TAPETIDE_API_TOKEN in .env.",
        "invalid_token": "Tapetide rejected the configured token. Check TAPETIDE_API_TOKEN in .env.",
        "invalid_request": "Tapetide rejected the history request parameters; check its current API documentation.",
        "not_found": "Tapetide could not find the requested history; check the requested date range.",
        "route_not_found": "Tapetide did not recognize the history endpoint; check its current API documentation.",
        "method_not_allowed": "Tapetide rejected the history request method.",
        "rate_limited": "Tapetide's request rate limit was reached. Try again later.",
        "quota_exhausted": "Tapetide's request quota is exhausted. Retry after it resets.",
        "upstream_unavailable": "Tapetide's data source is temporarily unavailable. Try again later.",
        "service_unavailable": "Tapetide is temporarily unavailable. Try again later.",
        "tool_error": "Tapetide could not build the requested history. Try again later.",
        "internal_error": "Tapetide is temporarily unavailable. Try again later.",
    }

    def __init__(self, cache: SqliteMarketCache, token: str | None, timeout_seconds: float = 30.0) -> None:
        self._cache = cache
        self._token = token.strip() if token else ""
        self._timeout_seconds = timeout_seconds

    @property
    def configured(self) -> bool:
        return bool(self._token)

    def sync(
        self,
        start: date,
        end: date,
        progress: Callable[[str], None] | None = None,
        include_days: set[date] | None = None,
    ) -> dict[str, object]:
        if start > end:
            raise FiiDiiImportError("start must be on or before end.")
        if end > date.today():
            raise FiiDiiImportError("End date cannot be in the future.")
        if not self.configured:
            raise FiiDiiImportError("Add TAPETIDE_API_TOKEN to the project .env file, then restart Backtrack.")
        requested_start = max(start, TAPETIDE_HISTORY_START)
        if requested_start > end:
            raise FiiDiiImportError("Tapetide's documented FII/DII cash-flow history starts on 2014-01-01.")

        rows: dict[tuple[date, str], FiiDiiRow] = {}
        skipped_records = 0
        pages_fetched = 0
        cursor: str | None = None
        seen_cursors: set[str] = set()
        while True:
            payload = self._download_page(requested_start, end, cursor)
            records = payload.get("data")
            meta = payload.get("meta")
            invalid_fields = []
            if not isinstance(records, list):
                invalid_fields.append("data must be an array")
            if not isinstance(meta, dict):
                invalid_fields.append("meta must be an object")
            elif not isinstance(meta.get("has_more"), bool):
                invalid_fields.append("meta.has_more must be a boolean")
            if invalid_fields:
                error = payload.get("error")
                code = error.get("code") if isinstance(error, dict) else None
                if isinstance(code, str) and code in self.api_error_messages:
                    raise FiiDiiImportError(self.api_error_messages[code])
                if isinstance(code, str) and code.isascii() and code.replace("_", "").isalnum() and len(code) <= 64:
                    details = f"API error code {code}; "
                else:
                    details = ""
                raise FiiDiiImportError(
                    f"Tapetide returned an unexpected history response ({details}{'; '.join(invalid_fields)})."
                )
            records = cast(list[object], records)
            meta = cast(dict[str, object], meta)
            pages_fetched += 1
            for record in records:
                if not isinstance(record, dict):
                    raise FiiDiiImportError("Tapetide returned an invalid daily-flow row.")
                try:
                    trading_day = date.fromisoformat(str(record["date"]))
                except (KeyError, ValueError) as exc:
                    raise FiiDiiImportError("Tapetide returned a daily-flow row without a valid ISO date.") from exc
                if not requested_start <= trading_day <= end:
                    raise FiiDiiImportError("Tapetide returned a date outside the requested history range.")
                if include_days is not None and trading_day not in include_days:
                    continue
                for participant, buy_key, sell_key, net_key in (
                    ("FII", "fii_buy_cr", "fii_sell_cr", "fii_net_cr"),
                    ("DII", "dii_buy_cr", "dii_sell_cr", "dii_net_cr"),
                ):
                    buy = self._number(record.get(buy_key))
                    sell = self._number(record.get(sell_key))
                    if buy is None or sell is None:
                        skipped_records += 1
                        continue
                    net = self._number(record.get(net_key))
                    row = FiiDiiRow(
                        trading_day=trading_day,
                        participant=participant,
                        scope="tapetide",
                        segment="equity",
                        buy_value=buy,
                        sell_value=sell,
                        net_value=net if net is not None else round(buy - sell, 2),
                        source=self.endpoint,
                    )
                    key = (trading_day, participant)
                    if key in rows and rows[key] != row:
                        raise FiiDiiImportError(f"Tapetide returned conflicting duplicate rows for {trading_day}.")
                    rows[key] = row
            if progress:
                progress(f"Downloaded Tapetide history page {pages_fetched}.")
            if not meta["has_more"]:
                break
            next_cursor = meta.get("next_cursor")
            if not isinstance(next_cursor, str) or not next_cursor or next_cursor in seen_cursors or pages_fetched >= 100:
                raise FiiDiiImportError("Tapetide history pagination did not advance safely.")
            seen_cursors.add(next_cursor)
            cursor = next_cursor

        normalized_rows = list(rows.values())
        stored_rows = self._cache.store_fii_dii_history_rows(normalized_rows)
        available_days = [row.trading_day for row in normalized_rows]
        return {
            "stored_rows": stored_rows,
            "pages_fetched": pages_fetched,
            "skipped_records": skipped_records,
            "available_start": min(available_days) if available_days else None,
            "available_end": max(available_days) if available_days else None,
        }

    def sync_missing_nse_sessions(
        self,
        start: date,
        end: date,
        progress: Callable[[str], None] | None = None,
    ) -> dict[str, object]:
        """Fill only known NSE archive dates missing a complete Tapetide pair."""
        requested_start = max(start, TAPETIDE_HISTORY_START)
        missing_days = self._cache.missing_fii_dii_history_days(requested_start, end)
        if not missing_days:
            return {
                "checked_days": 0,
                "stored_rows": 0,
                "pages_fetched": 0,
                "skipped_records": 0,
                "empty_days": 0,
                "incomplete_days": 0,
                "available_start": None,
                "available_end": None,
            }

        if progress:
            progress(f"Checking Tapetide history for {len(missing_days)} missing NSE sessions.")
        result = self.sync(missing_days[0], missing_days[-1], progress, include_days=set(missing_days))
        saved_by_day: dict[date, set[str]] = {}
        for row in self._cache.get_fii_dii_history_rows(missing_days[0], missing_days[-1]):
            if row.scope == "tapetide" and row.segment == "equity" and row.participant in {"FII", "DII"}:
                saved_by_day.setdefault(row.trading_day, set()).add(row.participant)
        empty_days = 0
        incomplete_days = 0
        for trading_day in missing_days:
            saved_participants = saved_by_day.get(trading_day, set())
            if {"FII", "DII"}.issubset(saved_participants):
                self._cache.mark_fii_dii_history_day_checked(trading_day, "saved")
            elif not saved_participants:
                self._cache.mark_fii_dii_history_day_checked(trading_day, "empty")
                empty_days += 1
            else:
                incomplete_days += 1

        return {
            "checked_days": len(missing_days),
            "stored_rows": cast(int, result["stored_rows"]),
            "pages_fetched": cast(int, result["pages_fetched"]),
            "skipped_records": cast(int, result["skipped_records"]),
            "empty_days": empty_days,
            "incomplete_days": incomplete_days,
            "available_start": result["available_start"],
            "available_end": result["available_end"],
        }

    def _download_page(self, start: date, end: date, cursor: str | None) -> dict[str, object]:
        query = {"from": start.isoformat(), "to": end.isoformat(), "order": "asc", "limit": "1000"}
        if cursor:
            query["cursor"] = cursor
        request = Request(
            f"{self.endpoint}?{urlencode(query)}",
            headers={"Authorization": f"Bearer {self._token}", "Accept": "application/json"},
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            try:
                error_payload = json.loads(exc.read().decode("utf-8"))
                error = error_payload.get("error") if isinstance(error_payload, dict) else None
                code = error.get("code") if isinstance(error, dict) else None
            except (UnicodeDecodeError, json.JSONDecodeError):
                code = None
            if isinstance(code, str) and code in self.api_error_messages:
                message = self.api_error_messages[code]
            elif exc.code in {401, 403}:
                message = "Tapetide rejected the configured token. Check TAPETIDE_API_TOKEN in .env."
            elif exc.code == 429:
                message = "Tapetide's request limit was reached. Try syncing again later."
            else:
                message = f"Tapetide history returned HTTP {exc.code}. Try again later."
            raise FiiDiiImportError(message) from exc
        except (URLError, TimeoutError) as exc:
            raise FiiDiiImportError("Could not reach Tapetide. Check the internet connection and try again.") from exc
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FiiDiiImportError("Tapetide returned unreadable FII/DII history.") from exc
        if not isinstance(payload, dict):
            raise FiiDiiImportError(
                f"Tapetide returned an unexpected history response (expected an object, received {type(payload).__name__})."
            )
        return payload

    @staticmethod
    def _number(value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise FiiDiiImportError("Tapetide returned a non-numeric FII/DII amount.")
        result = float(value)
        if not math.isfinite(result):
            raise FiiDiiImportError("Tapetide returned a non-finite FII/DII amount.")
        return result
