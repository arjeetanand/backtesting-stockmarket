"""Local-only parsing and persistence for user-reviewed portfolio snapshots."""

from __future__ import annotations

import base64
import binascii
import io
import os
import posixpath
import re
import selectors
import shutil
import struct
import subprocess
import tempfile
import time as monotonic_time
import zipfile
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Literal, overload
from uuid import uuid4
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.stock_research import StockResearchService

MAX_FILE_BYTES = 10_000_000
MAX_XLSX_ENTRIES = 500
MAX_XLSX_EXPANDED_BYTES = 50_000_000
MAX_XLSX_XML_BYTES = 8_000_000
MAX_XLSX_ROWS = 5_000
MAX_XLSX_COLUMNS = 100
MAX_HOLDINGS = 500
MAX_PDF_PAGES = 5
MAX_TEXT_CHARS = 250_000
MAX_IMAGE_PIXELS = 20_000_000
PROCESS_TIMEOUT_SECONDS = 10
MAX_RENDERED_IMAGE_BYTES = 15_000_000
PORTFOLIO_ANALYSIS_BARS = 500
PORTFOLIO_STALE_AFTER_DAYS = 5
PORTFOLIO_SNAPSHOT_KIND = "portfolio_snapshot"


class PortfolioImportError(ValueError):
    """An expected upload or parsing failure with a safe user-facing status."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


_HEADER_ALIASES: dict[str, set[str]] = {
    "symbol": {"symbol", "ticker", "scrip", "scripcode", "scripname", "security", "tradingsymbol", "instrument", "stock"},
    "quantity": {"qty", "quantity", "netqty", "netquantity", "shares", "units", "holdingqty", "closingqty"},
    "average_price": {
        "avgprice", "averageprice", "avgcost", "averagecost", "avgbuyprice", "averagebuyprice",
        "buyprice", "purchaseprice", "costprice", "weightedaverageprice", "averagerate", "avgrate",
    },
    "total_cost": {"totalcost", "costamount", "investedamount", "investmentamount", "costvalue"},
}
_TEXT_HEADER_PATTERNS = {
    "symbol": re.compile(r"\b(?:nse\s*)?(?:symbol|ticker|scrip(?:\s*(?:code|name))?|security|instrument|stock)\b", re.I),
    "quantity": re.compile(r"\b(?:net\s*)?(?:quantity|qty|shares|units)\b", re.I),
    "average_price": re.compile(r"\b(?:(?:weighted\s+)?average|avg)\s*(?:buy\s*)?(?:price|cost|rate)\b|\b(?:buy|purchase|cost)\s+price\b", re.I),
    "total_cost": re.compile(r"\b(?:total|invested)\s+(?:cost|amount|value)\b", re.I),
}
_SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9&.-]{0,24}$")
_NUMBER_PATTERN = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?")
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff", ".webp"}
_IMAGE_MIME_TYPES = {
    "image/png", "image/jpeg", "image/pjpeg", "image/gif", "image/bmp", "image/x-ms-bmp",
    "image/tiff", "image/x-tiff", "image/webp",
}


def decode_upload(filename: str, content_type: str | None, encoded: str) -> tuple[str, bytes]:
    """Validate the bounded JSON upload and return its format and bytes."""
    if len(filename) > 255 or not filename.strip():
        raise PortfolioImportError("Choose a file with a valid name.")
    suffix = Path(filename).suffix.lower()
    if suffix == ".xlsx":
        file_format = "xlsx"
    elif suffix == ".pdf":
        file_format = "pdf"
    elif suffix in _IMAGE_SUFFIXES:
        file_format = "image"
    else:
        raise PortfolioImportError("Supported files are .xlsx, .pdf, and common PNG, JPEG, GIF, BMP, TIFF, or WebP images.", 415)
    if len(encoded) > (MAX_FILE_BYTES * 4 // 3) + 8:
        raise PortfolioImportError("This file is larger than the 10 MB upload limit.", 413)
    try:
        payload = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise PortfolioImportError("The upload was not valid base64 data.") from None
    if not payload:
        raise PortfolioImportError("The selected file is empty.")
    if len(payload) > MAX_FILE_BYTES:
        raise PortfolioImportError("This file is larger than the 10 MB upload limit.", 413)

    mime = (content_type or "").split(";", 1)[0].strip().lower()
    expected_mimes = {
        "xlsx": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
        "pdf": {"application/pdf"},
        "image": _IMAGE_MIME_TYPES,
    }[file_format]
    if mime and mime != "application/octet-stream" and mime not in expected_mimes:
        raise PortfolioImportError("The file type does not match its declared content type.", 415)

    if file_format == "xlsx":
        _validate_xlsx_container(payload)
    elif file_format == "pdf":
        if not payload.startswith(b"%PDF-"):
            raise PortfolioImportError("The file name says PDF, but its contents are not a PDF.", 415)
    else:
        detected = _image_format(payload)
        extension_formats = {
            ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".gif": "gif", ".bmp": "bmp",
            ".tif": "tiff", ".tiff": "tiff", ".webp": "webp",
        }
        if detected != extension_formats[suffix]:
            raise PortfolioImportError("The image contents do not match the selected file extension.", 415)
    return file_format, payload


def preview_portfolio_file(file_format: str, payload: bytes) -> dict[str, Any]:
    """Parse holdings in memory. This function never writes the source file."""
    if file_format == "xlsx":
        holdings, warnings = _parse_xlsx(payload)
    elif file_format == "pdf":
        holdings, warnings = _parse_pdf(payload)
    elif file_format == "image":
        _check_image_dimensions(payload)
        holdings, warnings = _parse_text(_run_ocr(payload))
    else:
        raise PortfolioImportError("Unsupported portfolio file type.", 415)
    if not holdings:
        warnings.append("No holdings were detected. Add or correct rows in the preview before saving.")
    return {"source_format": file_format, "holdings": holdings, "warnings": warnings[:20]}


def normalize_holdings(holdings: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate and combine repeated symbols using quantity-weighted average cost."""
    if not holdings or len(holdings) > MAX_HOLDINGS:
        raise PortfolioImportError(f"Add between 1 and {MAX_HOLDINGS} valid holdings before saving.", 422)
    totals: dict[str, tuple[Decimal, Decimal]] = {}
    for holding in holdings:
        try:
            symbol = normalize_symbol(str(holding.get("symbol", "")))
            quantity = _positive_decimal(holding.get("quantity"), "quantity")
            average_price = _positive_decimal(holding.get("average_price"), "average price")
        except PortfolioImportError:
            raise
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise PortfolioImportError(str(exc) or "A holding contains an invalid number.", 422) from None
        current_quantity, current_cost = totals.get(symbol, (Decimal(0), Decimal(0)))
        totals[symbol] = (current_quantity + quantity, current_cost + quantity * average_price)

    normalized = [
        {
            "symbol": symbol,
            "quantity": _format_decimal(quantity),
            "average_price": _format_decimal(cost / quantity),
            "cost_basis": _format_decimal(cost),
        }
        for symbol, (quantity, cost) in sorted(totals.items())
    ]
    total_shares = sum((Decimal(item["quantity"]) for item in normalized), Decimal(0))
    total_cost = sum((Decimal(item["cost_basis"]) for item in normalized), Decimal(0))
    return {
        "holdings": normalized,
        "total_positions": len(normalized),
        "total_shares": _format_decimal(total_shares),
        "total_cost_basis": _format_decimal(total_cost),
    }


def save_portfolio_snapshot(
    artifacts: SqliteArtifactStore,
    source_format: str,
    holdings: list[dict[str, Any]],
) -> dict[str, Any]:
    """Persist only confirmed, normalized holdings; original upload bytes are never saved."""
    if source_format not in {"xlsx", "pdf", "image", "manual"}:
        raise PortfolioImportError("Choose a supported source type.", 422)
    normalized = normalize_holdings(holdings)
    snapshot = {
        "snapshot_id": uuid4().hex,
        "created_at": datetime.now(UTC).isoformat(),
        "source_format": source_format,
        **normalized,
    }
    artifacts.save(PORTFOLIO_SNAPSHOT_KIND, snapshot["snapshot_id"], snapshot)
    return snapshot


def list_portfolio_snapshots(artifacts: SqliteArtifactStore, limit: int = 20) -> list[dict[str, Any]]:
    return artifacts.list_with_metadata(PORTFOLIO_SNAPSHOT_KIND, limit=max(1, min(limit, 50)))


def analyze_portfolio_snapshot(
    cache: SqliteMarketCache,
    snapshot: dict[str, Any],
    *,
    today: datetime | None = None,
    market_sync: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Value a saved snapshot using only bounded local daily bars and describe observed context."""
    holdings = snapshot.get("holdings")
    if not isinstance(holdings, list) or not holdings or len(holdings) > MAX_HOLDINGS:
        raise PortfolioImportError("The saved portfolio snapshot is invalid.", 422)
    normalized = normalize_holdings(holdings)
    symbols = [item["symbol"] for item in normalized["holdings"]]
    bars_by_symbol = cache.get_recent_bars(symbols, "1day", PORTFOLIO_ANALYSIS_BARS)
    local_today = (today or datetime.now(ZoneInfo("Asia/Kolkata"))).date()

    positions: list[dict[str, Any]] = []
    total_cost = Decimal(0)
    total_market_value = Decimal(0)
    priced_positions = 0
    all_dates: list[str] = []
    for holding in normalized["holdings"]:
        symbol = holding["symbol"]
        quantity = Decimal(holding["quantity"])
        average_price = Decimal(holding["average_price"])
        cost_basis = Decimal(holding["cost_basis"])
        bars = bars_by_symbol.get(symbol, [])
        ordered = sorted(bars, key=lambda bar: bar.timestamp)
        closes = [float(bar.close) for bar in ordered]
        volumes = [float(bar.volume) for bar in ordered]
        data_as_of = ordered[-1].timestamp.date().isoformat() if ordered else None
        if data_as_of:
            all_dates.append(data_as_of)
            age_days = max((local_today - ordered[-1].timestamp.date()).days, 0)
            freshness = "stale" if age_days > PORTFOLIO_STALE_AFTER_DAYS else "fresh"
        else:
            age_days = None
            freshness = "missing"

        rule = StockResearchService.assess_current_bars(ordered, today)

        close = Decimal(str(closes[-1])) if closes else None
        market_value = quantity * close if close is not None else None
        unrealized_pnl = market_value - cost_basis if market_value is not None else None
        if market_value is not None:
            total_market_value += market_value
            priced_positions += 1
        total_cost += cost_basis

        sma20 = _mean(closes[-20:]) if len(closes) >= 20 else None
        sma50 = _mean(closes[-50:]) if len(closes) >= 50 else None
        sma200 = _mean(closes[-200:]) if len(closes) >= 200 else None
        current_month = (local_today.year, local_today.month)
        month_closes: dict[tuple[int, int], float] = {}
        for bar in ordered:
            bar_month = (bar.timestamp.year, bar.timestamp.month)
            if bar_month < current_month:
                month_closes[bar_month] = float(bar.close)
        completed_month_values = [month_closes[key] for key in sorted(month_closes)][-20:]
        sma20_monthly = _mean(completed_month_values) if len(completed_month_values) == 20 else None
        relative_volume = None
        if len(volumes) >= 21:
            prior_volume_avg = _mean(volumes[-21:-1])
            if prior_volume_avg and prior_volume_avg > 0:
                relative_volume = volumes[-1] / prior_volume_avg

        observations: list[str] = []
        if close is None:
            observations.append("No local daily close is available for this symbol.")
        else:
            observations.append(f"Latest local daily close is ₹{_money(close)} as of {data_as_of}.")
            if sma20 is not None:
                observations.append(_relative_observation("Close", closes[-1], "20-day average", sma20))
            if sma50 is not None:
                observations.append(_relative_observation("Close", closes[-1], "50-day average", sma50))
            if sma200 is not None:
                observations.append(_relative_observation("Close", closes[-1], "200-day average", sma200))
            if sma20_monthly is not None:
                observations.append(_relative_observation("Close", closes[-1], "20-completed-month average", sma20_monthly))
            if relative_volume is not None:
                observations.append(f"Latest daily volume was {relative_volume:.2f}× the prior 20-session average volume.")
            if freshness == "stale":
                observations.append(f"Local price data is {age_days} calendar days old; refresh NSE daily data before relying on this valuation.")

        positions.append({
            "symbol": symbol,
            "quantity": holding["quantity"],
            "average_price": _money(average_price),
            "cost_basis": _money(cost_basis),
            "latest_close": _money(close) if close is not None else None,
            "market_value": _money(market_value) if market_value is not None else None,
            "unrealized_pnl": _money(unrealized_pnl) if unrealized_pnl is not None else None,
            "unrealized_pnl_pct": _percent(unrealized_pnl / cost_basis * Decimal(100)) if unrealized_pnl is not None and cost_basis > 0 else None,
            "data_as_of": data_as_of,
            "data_age_days": age_days,
            "freshness": freshness,
            "indicators": {
                "sma20": _money(sma20) if sma20 is not None else None,
                "sma50": _money(sma50) if sma50 is not None else None,
                "sma200": _money(sma200) if sma200 is not None else None,
                "sma20_completed_months": _money(sma20_monthly) if sma20_monthly is not None else None,
                "relative_volume_20d": _percent(Decimal(str(relative_volume))) if relative_volume is not None else None,
                "daily_bars_used": len(ordered),
                "completed_months_used": len(completed_month_values),
            },
            "rule_assessment": {
                **rule,
                **{
                    key: _money(rule[key]) if rule[key] is not None else None
                    for key in ("entry_trigger", "stop_loss", "target_1r", "target_2r", "risk_per_share")
                },
            },
            "observations": observations,
        })

    for position in positions:
        market_value = position["market_value"]
        position["market_value_weight_pct"] = (
            _percent(Decimal(market_value) / total_market_value * Decimal(100))
            if market_value is not None and total_market_value > 0
            else None
        )

    review_priorities: list[str] = []
    missing_symbols = [item["symbol"] for item in positions if item["freshness"] == "missing"]
    stale_symbols = [item["symbol"] for item in positions if item["freshness"] == "stale"]
    if missing_symbols or stale_symbols:
        details = []
        if missing_symbols:
            details.append(f"no cached close: {_symbol_summary(missing_symbols)}")
        if stale_symbols:
            details.append(f"stale close: {_symbol_summary(stale_symbols)}")
        review_priorities.append(f"Refresh NSE daily data before relying on the valuation ({'; '.join(details)}).")

    for status, label, message in (
        ("insufficient_history", "Need more data", "Import more NSE history before using these indicators or levels"),
        ("no_long_setup", "Rule blockers", "Review each holding's listed reasons; these positions do not currently meet the fixed long rule"),
        ("watch", "Wait for confirmation", "These are watch-only setups; check each conditional entry trigger and reason"),
        ("triggered", "Triggered setups", "Review these symbols in Stock Research; this portfolio view does not evaluate their historical validation gate"),
    ):
        matched = [item["symbol"] for item in positions if item["rule_assessment"]["status"] == status]
        if matched:
            review_priorities.append(f"{label}: {_symbol_summary(matched)}. {message}.")

    priced = [item for item in positions if item["market_value"] is not None]
    if len(priced) > 1:
        largest = max(priced, key=lambda item: Decimal(item["market_value"]))
        review_priorities.append(
            f"Exposure check: {largest['symbol']} is {largest['market_value_weight_pct']}% of priced market value; compare that concentration with your own risk limit."
        )

    result = {
        "snapshot_id": snapshot.get("snapshot_id", ""),
        "analyzed_at": datetime.now(UTC).isoformat(),
        "data_source": "local_cached_official_nse_daily_ohlcv",
        "price_basis": "latest cached end-of-day close; daily data only",
        "data_as_of": max(all_dates, default=None),
        "totals": {
            "total_positions": len(positions),
            "priced_positions": priced_positions,
            "total_cost_basis": _money(total_cost),
            "priced_market_value": _money(total_market_value),
            "unrealized_pnl_on_priced_positions": _money(total_market_value - sum((Decimal(item["cost_basis"]) for item in positions if item["market_value"] is not None), Decimal(0))),
        },
        "review_priorities": review_priorities,
        "positions": positions,
    }
    if market_sync is not None:
        result["market_sync"] = market_sync
    return result


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _money(value: Decimal | float | None) -> str:
    if value is None:
        return ""
    number = value if isinstance(value, Decimal) else Decimal(str(value))
    return format(number.quantize(Decimal("0.01")), "f")


def _percent(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01")), "f")


def _relative_observation(label: str, value: float, reference_label: str, reference: float) -> str:
    relation = "above" if value > reference else "below" if value < reference else "at"
    difference_pct = (value / reference - 1) * 100 if reference > 0 else 0
    return f"{label} is {relation} the {reference_label} by {difference_pct:+.1f}%."


def _symbol_summary(symbols: list[str]) -> str:
    visible = ", ".join(symbols[:5])
    remaining = len(symbols) - 5
    return f"{visible} (+{remaining} more)" if remaining > 0 else visible


def normalize_symbol(value: str) -> str:
    symbol = value.strip().upper().removeprefix("NSE:").removesuffix(".NS").removesuffix("-EQ").strip()
    if not _SYMBOL_PATTERN.fullmatch(symbol):
        raise ValueError("Use a valid NSE trading symbol in each row.")
    return symbol


def _positive_decimal(value: Any, label: str) -> Decimal:
    number = Decimal(str(value).replace(",", "").strip())
    if not number.is_finite() or number <= 0:
        raise ValueError(f"Enter a positive, finite {label}.")
    return number


def _format_decimal(value: Decimal) -> str:
    return format(value.normalize(), "f") if value else "0"


def _validate_xlsx_container(payload: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            members = archive.infolist()
            if len(members) > MAX_XLSX_ENTRIES or sum(item.file_size for item in members) > MAX_XLSX_EXPANDED_BYTES:
                raise PortfolioImportError("This spreadsheet expands beyond the safe parsing limit.", 413)
            names = {item.filename for item in members}
            if "[Content_Types].xml" not in names or "xl/workbook.xml" not in names:
                raise PortfolioImportError("The .xlsx file does not contain a valid workbook.", 415)
            if any(name.endswith("vbaProject.bin") for name in names):
                raise PortfolioImportError("Macro-enabled spreadsheets are not supported.", 415)
    except zipfile.BadZipFile:
        raise PortfolioImportError("The .xlsx file is not a valid workbook.", 415) from None


def _read_zip_xml(archive: zipfile.ZipFile, name: str) -> ElementTree.Element:
    try:
        info = archive.getinfo(name)
    except KeyError:
        raise PortfolioImportError("The spreadsheet is missing a required workbook part.", 415) from None
    if info.file_size > MAX_XLSX_XML_BYTES:
        raise PortfolioImportError("A spreadsheet section is larger than the safe parsing limit.", 413)
    try:
        content = archive.read(info)
        if len(content) > MAX_XLSX_XML_BYTES:
            raise PortfolioImportError("A spreadsheet section is larger than the safe parsing limit.", 413)
        if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
            raise PortfolioImportError("XML declarations with custom entities are not supported.", 415)
        return ElementTree.fromstring(content)
    except (ElementTree.ParseError, zipfile.BadZipFile, RuntimeError):
        raise PortfolioImportError("A spreadsheet section could not be read safely.", 415) from None


def _parse_xlsx(payload: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    try:
        archive = zipfile.ZipFile(io.BytesIO(payload))
    except zipfile.BadZipFile:
        raise PortfolioImportError("The .xlsx file is not a valid workbook.", 415) from None
    with archive:
        workbook = _read_zip_xml(archive, "xl/workbook.xml")
        namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
        relation_namespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
        relationship_id = workbook.find("x:sheets/x:sheet", namespace)
        if relationship_id is None:
            raise PortfolioImportError("The spreadsheet has no worksheet to read.")
        relation_id = relationship_id.attrib.get(f"{{{relation_namespace}}}id", "")
        relationships = _read_zip_xml(archive, "xl/_rels/workbook.xml.rels")
        relationship = next(
            (item for item in relationships if item.attrib.get("Id") == relation_id),
            None,
        )
        if relationship is None or relationship.attrib.get("TargetMode") == "External":
            raise PortfolioImportError("The spreadsheet's first worksheet could not be located.")
        target = relationship.attrib.get("Target", "")
        worksheet_path = posixpath.normpath(target.lstrip("/") if target.startswith("/xl/") else posixpath.join("xl", target))
        if not worksheet_path.startswith("xl/worksheets/"):
            raise PortfolioImportError("The spreadsheet's worksheet path is invalid.", 415)

        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared_xml = _read_zip_xml(archive, "xl/sharedStrings.xml")
            shared_strings = ["".join(text.text or "" for text in item.findall(".//x:t", namespace)) for item in shared_xml]
        sheet = _read_zip_xml(archive, worksheet_path)
        rows: list[tuple[int, list[str]]] = []
        for row_index, row in enumerate(sheet.findall(".//x:sheetData/x:row", namespace), start=1):
            if row_index > MAX_XLSX_ROWS:
                raise PortfolioImportError("The spreadsheet has too many rows to preview safely.", 413)
            cells: dict[int, str] = {}
            for cell in row.findall("x:c", namespace):
                coordinate = cell.attrib.get("r", "")
                column = _column_index(coordinate)
                if column is None:
                    continue
                if column >= MAX_XLSX_COLUMNS:
                    raise PortfolioImportError("The spreadsheet has a column beyond the safe parsing limit.", 413)
                value = cell.findtext("x:v", default="", namespaces=namespace)
                if cell.attrib.get("t") == "s" and value:
                    try:
                        value = shared_strings[int(value)]
                    except (ValueError, IndexError):
                        value = ""
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(text.text or "" for text in cell.findall(".//x:t", namespace))
                cells[column] = value.strip()
            if cells:
                width = max(cells)
                rows.append((int(row.attrib.get("r", row_index)), [cells.get(index, "") for index in range(width + 1)]))
        return _parse_tabular_rows(rows)


def _column_index(coordinate: str) -> int | None:
    match = re.match(r"^([A-Z]+)\d+$", coordinate.upper())
    if match is None:
        return None
    index = 0
    for char in match.group(1):
        index = index * 26 + ord(char) - ord("A") + 1
    return index - 1


def _parse_tabular_rows(rows: list[tuple[int, list[str]]]) -> tuple[list[dict[str, Any]], list[str]]:
    header_index: int | None = None
    columns: dict[str, int] = {}
    for index, (_, values) in enumerate(rows[:50]):
        candidate: dict[str, int] = {}
        for column, value in enumerate(values):
            kind = _header_kind(value)
            if kind is not None:
                candidate[kind] = column
        if "symbol" in candidate and "quantity" in candidate:
            header_index, columns = index, candidate
            break
    if header_index is None:
        return [], ["Could not find symbol and quantity columns. Add the rows manually or choose a clearer statement."]

    holdings: list[dict[str, Any]] = []
    skipped = 0
    for source_row, values in rows[header_index + 1 :]:
        if not any(values):
            continue
        symbol_value = _cell(values, columns.get("symbol"))
        quantity = _parse_number(_cell(values, columns.get("quantity")))
        average_price = _parse_number(_cell(values, columns.get("average_price")))
        if average_price is None and (total_cost := _parse_number(_cell(values, columns.get("total_cost")))) is not None and quantity:
            average_price = total_cost / quantity
        try:
            symbol = normalize_symbol(symbol_value)
        except ValueError:
            skipped += 1
            continue
        if quantity is None or quantity <= 0:
            skipped += 1
            continue
        if average_price is not None and average_price <= 0:
            average_price = None
        holdings.append({
            "symbol": symbol,
            "quantity": _format_decimal(quantity),
            "average_price": _format_decimal(average_price) if average_price is not None else "",
            "source_row": str(source_row),
        })
        if len(holdings) > MAX_HOLDINGS:
            raise PortfolioImportError(f"The statement has more than {MAX_HOLDINGS} holdings.", 413)

    warnings = []
    if skipped:
        warnings.append(f"Skipped {skipped} rows with an unreadable symbol or quantity.")
    if any(not item["average_price"] for item in holdings):
        warnings.append("Some average prices were not detected. Fill them in before saving.")
    return holdings, warnings


def _header_kind(value: str) -> str | None:
    normalized = re.sub(r"[^a-z0-9]", "", value.lower())
    return next((kind for kind, aliases in _HEADER_ALIASES.items() if normalized in aliases), None)


def _cell(values: list[str], column: int | None) -> str:
    return values[column].strip() if column is not None and column < len(values) else ""


def _parse_number(value: str) -> Decimal | None:
    cleaned = value.upper().replace("INR", "").replace("RS.", "").replace("RS", "").replace("₹", "").strip()
    match = _NUMBER_PATTERN.search(cleaned)
    if match is None:
        return None
    try:
        result = Decimal(match.group(0).replace(",", ""))
    except InvalidOperation:
        return None
    return result if result.is_finite() else None


def _parse_pdf(payload: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    pdfinfo = shutil.which("pdfinfo")
    pdftotext = shutil.which("pdftotext")
    if not pdfinfo:
        raise PortfolioImportError("Local PDF parsing needs the Poppler pdfinfo tool. No file was saved.", 503)
    page_info = _run_tool([pdfinfo, "-"], payload)
    pages_match = re.search(r"^Pages:\s+(\d+)\s*$", page_info, re.M)
    if pages_match is None:
        raise PortfolioImportError("This PDF's page count could not be checked safely.")
    page_count = int(pages_match.group(1))
    if page_count < 1 or page_count > MAX_PDF_PAGES:
        raise PortfolioImportError(f"PDFs must contain between 1 and {MAX_PDF_PAGES} pages.", 413)
    if re.search(r"^Encrypted:\s+yes\s*$", page_info, re.M | re.I):
        raise PortfolioImportError("Password-protected PDFs are not supported.")

    if pdftotext:
        text = _run_tool([pdftotext, "-layout", "-enc", "UTF-8", "-", "-"], payload)
        if len(text) > MAX_TEXT_CHARS:
            raise PortfolioImportError("The PDF contains too much text to preview safely.", 413)
        holdings, warnings = _parse_text(text)
        if holdings:
            return holdings, warnings

    renderer = shutil.which("pdftoppm")
    if not renderer:
        return [], ["No holdings were detected in PDF text. Local PDF OCR needs pdftoppm and Tesseract."]
    if not shutil.which("tesseract"):
        return [], ["No holdings were detected in PDF text. Install Tesseract locally to OCR PDF pages."]
    ocr_text: list[str] = []
    for page in range(1, page_count + 1):
        with tempfile.TemporaryDirectory(prefix="backtrack-pdf-ocr-") as directory:
            prefix = Path(directory) / "page"
            cache_home = Path(directory) / "cache"
            cache_home.mkdir()
            environment = os.environ.copy()
            environment["XDG_CACHE_HOME"] = str(cache_home)
            fontconfig_file = next((
                candidate for candidate in (
                    Path("/etc/fonts/fonts.conf"),
                    Path("/opt/homebrew/etc/fonts/fonts.conf"),
                    Path("/usr/local/etc/fonts/fonts.conf"),
                ) if candidate.is_file()
            ), None)
            if fontconfig_file is not None and not environment.get("FONTCONFIG_FILE"):
                environment["FONTCONFIG_FILE"] = str(fontconfig_file)
                environment.setdefault("FONTCONFIG_PATH", str(fontconfig_file.parent))
            _run_tool(
                [renderer, "-f", str(page), "-l", str(page), "-singlefile", "-png", "-scale-to", "1600", "-", str(prefix)],
                payload,
                env=environment,
            )
            rendered = prefix.with_suffix(".png")
            if not rendered.is_file() or rendered.stat().st_size > MAX_RENDERED_IMAGE_BYTES:
                raise PortfolioImportError("A PDF page could not be rendered safely for local OCR.")
            image = rendered.read_bytes()
            if not image.startswith(b"\x89PNG\r\n\x1a\n"):
                raise PortfolioImportError("A PDF page could not be rendered for local OCR.")
        ocr_text.append(_run_ocr(image))
    holdings, warnings = _parse_text("\n".join(ocr_text))
    return holdings, warnings


def _parse_text(text: str) -> tuple[list[dict[str, Any]], list[str]]:
    lines = [line.rstrip("\r\n") for line in text.replace("\x0c", "\n").splitlines()]
    header_index: int | None = None
    header_columns: list[tuple[str, int]] = []
    for index, line in enumerate(lines[:100]):
        found: list[tuple[str, int]] = []
        for kind, pattern in _TEXT_HEADER_PATTERNS.items():
            match = pattern.search(line)
            if match:
                found.append((kind, match.start()))
        kinds = {kind for kind, _ in found}
        if "symbol" in kinds and "quantity" in kinds:
            header_index = index
            header_columns = sorted(found, key=lambda item: item[1])
            break
    if header_index is None:
        return [], ["Could not find symbol and quantity headings. Add the rows manually or choose a clearer statement."]

    tabular: list[tuple[int, list[str]]] = []
    for row_index, line in enumerate(lines[header_index + 1 :], start=header_index + 2):
        if not line.strip():
            continue
        cells: dict[str, str] = {}
        for column_index, (kind, start) in enumerate(header_columns):
            end = header_columns[column_index + 1][1] if column_index + 1 < len(header_columns) else len(line)
            cells[kind] = line[start:end].strip()
        symbol = _first_token(cells.get("symbol", ""))
        quantity = _parse_number(cells.get("quantity", ""))
        average_price = _parse_number(cells.get("average_price", ""))
        if average_price is None and (total_cost := _parse_number(cells.get("total_cost", ""))) is not None and quantity:
            average_price = total_cost / quantity
        if "average_price" in cells or not symbol or quantity is None:
            # Text extraction often collapses columns; prefer a complete common row over shifted columns.
            match = re.match(
                r"^\s*(?:NSE:)?([A-Z][A-Z0-9&.-]{0,24})(?:-EQ)?\s+([\d,]+(?:\.\d+)?)\s+(?:₹|INR|RS\.?\s*)?([\d,]+(?:\.\d+)?)\s*$",
                line,
                re.I,
            )
            if match:
                symbol = match.group(1)
                quantity = _parse_number(match.group(2))
                average_price = _parse_number(match.group(3))
        try:
            normalized_symbol = normalize_symbol(symbol)
        except ValueError:
            continue
        if quantity is None or quantity <= 0:
            continue
        if average_price is not None and average_price <= 0:
            average_price = None
        tabular.append((row_index, [normalized_symbol, _format_decimal(quantity), _format_decimal(average_price) if average_price is not None else ""]))
        if len(tabular) > MAX_HOLDINGS:
            raise PortfolioImportError(f"The statement has more than {MAX_HOLDINGS} holdings.", 413)
    holdings = [
        {"symbol": symbol, "quantity": quantity, "average_price": price, "source_row": str(row)}
        for row, (symbol, quantity, price) in tabular
    ]
    warnings = ["Some average prices were not detected. Fill them in before saving."] if any(not item["average_price"] for item in holdings) else []
    return holdings, warnings


def _first_token(value: str) -> str:
    match = re.search(r"(?:NSE:)?[A-Z][A-Z0-9&.-]{0,24}(?:-EQ)?", value.strip(), re.I)
    return match.group(0) if match else ""


@overload
def _run_tool(command: list[str], payload: bytes, binary: Literal[False] = False, env: dict[str, str] | None = None) -> str: ...


@overload
def _run_tool(command: list[str], payload: bytes, binary: Literal[True], env: dict[str, str] | None = None) -> bytes: ...


def _run_tool(command: list[str], payload: bytes, binary: bool = False, env: dict[str, str] | None = None) -> str | bytes:
    output_limit = MAX_RENDERED_IMAGE_BYTES if binary else MAX_TEXT_CHARS * 4
    output = bytearray()
    selector = selectors.DefaultSelector()
    process: subprocess.Popen[bytes] | None = None
    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
            env=env,
        )
    except FileNotFoundError:
        raise PortfolioImportError("A required local document tool is not installed.", 503) from None
    assert process.stdin is not None and process.stdout is not None and process.stderr is not None
    sent = 0
    deadline = monotonic_time.monotonic() + PROCESS_TIMEOUT_SECONDS
    try:
        for stream, event, name in (
            (process.stdout, selectors.EVENT_READ, "stdout"),
            (process.stderr, selectors.EVENT_READ, "stderr"),
        ):
            os.set_blocking(stream.fileno(), False)
            selector.register(stream, event, (name, stream))
        if payload:
            os.set_blocking(process.stdin.fileno(), False)
            selector.register(process.stdin, selectors.EVENT_WRITE, ("stdin", process.stdin))
        else:
            process.stdin.close()

        while selector.get_map():
            remaining = deadline - monotonic_time.monotonic()
            if remaining <= 0:
                raise PortfolioImportError("Document parsing timed out. Use a smaller statement.", 413)
            for key, _ in selector.select(min(remaining, 0.25)):
                stream_name, stream = key.data
                if stream_name == "stdin":
                    if sent >= len(payload):
                        selector.unregister(stream)
                        stream.close()
                        continue
                    try:
                        sent += os.write(stream.fileno(), payload[sent : sent + 65_536])
                    except BrokenPipeError:
                        selector.unregister(stream)
                        stream.close()
                    if sent >= len(payload) and not stream.closed:
                        selector.unregister(stream)
                        stream.close()
                    continue

                chunk = os.read(stream.fileno(), 65_536)
                if not chunk:
                    selector.unregister(stream)
                    stream.close()
                    continue
                if stream_name == "stdout":
                    if len(output) + len(chunk) > output_limit:
                        raise PortfolioImportError("The document produced too much text to preview safely.", 413)
                    output.extend(chunk)

        try:
            return_code = process.wait(timeout=max(deadline - monotonic_time.monotonic(), 0.05))
        except subprocess.TimeoutExpired:
            raise PortfolioImportError("Document parsing timed out. Use a smaller statement.", 413) from None
        if return_code != 0:
            raise PortfolioImportError("The local document parser could not read this file.")
    except PortfolioImportError:
        if process.poll() is None:
            process.kill()
            process.wait()
        raise
    finally:
        selector.close()
        if process.poll() is None:
            process.kill()
            process.wait()
        for stream in (process.stdin, process.stdout, process.stderr):
            if stream is not None and not stream.closed:
                stream.close()
    return bytes(output) if binary else output.decode("utf-8", errors="replace")


def _run_ocr(image: bytes) -> str:
    tesseract = shutil.which("tesseract")
    if not tesseract:
        raise PortfolioImportError("Local image OCR needs Tesseract. No file was saved.", 503)
    try:
        output = _run_tool([tesseract, "stdin", "stdout", "--psm", "6", "-l", "eng"], image)
    except PortfolioImportError as exc:
        if exc.status_code == 400:
            raise PortfolioImportError("Local OCR could not read this image. Check that it is a clear PNG, JPEG, GIF, BMP, TIFF, or WebP file.") from None
        raise
    if not isinstance(output, str):
        raise PortfolioImportError("Local OCR could not read this image. Check that it is a clear PNG, JPEG, GIF, BMP, TIFF, or WebP file.")
    if len(output) > MAX_TEXT_CHARS:
        raise PortfolioImportError("The image produced too much text to preview safely.", 413)
    return output


def _image_format(payload: bytes) -> str:
    if payload.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if payload.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if payload.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if payload.startswith(b"BM"):
        return "bmp"
    if payload.startswith((b"II*\x00", b"MM\x00*")):
        return "tiff"
    if len(payload) >= 12 and payload.startswith(b"RIFF") and payload[8:12] == b"WEBP":
        return "webp"
    raise PortfolioImportError("The selected image format is not supported or the file contents are invalid.", 415)


def _check_image_dimensions(payload: bytes) -> None:
    kind = _image_format(payload)
    dimensions = _image_dimensions(kind, payload)
    if dimensions is None:
        raise PortfolioImportError("The image dimensions could not be checked safely.", 415)
    width, height = dimensions
    if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
        raise PortfolioImportError("Images must be no larger than 20 megapixels.", 413)


def _image_dimensions(kind: str, payload: bytes) -> tuple[int, int] | None:
    try:
        if kind == "png" and len(payload) >= 24:
            return struct.unpack_from(">II", payload, 16)
        if kind == "gif" and len(payload) >= 10:
            return struct.unpack_from("<HH", payload, 6)
        if kind == "bmp" and len(payload) >= 26:
            width, height = struct.unpack_from("<ii", payload, 18)
            return abs(width), abs(height)
        if kind == "jpeg":
            return _jpeg_dimensions(payload)
        if kind == "tiff":
            return _tiff_dimensions(payload)
        if kind == "webp":
            return _webp_dimensions(payload)
    except (struct.error, OverflowError):
        return None
    return None


def _jpeg_dimensions(payload: bytes) -> tuple[int, int] | None:
    offset = 2
    frame_markers = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset + 4 <= len(payload):
        if payload[offset] != 0xFF:
            offset += 1
            continue
        while offset < len(payload) and payload[offset] == 0xFF:
            offset += 1
        if offset >= len(payload):
            return None
        marker = payload[offset]
        offset += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if offset + 2 > len(payload):
            return None
        length = struct.unpack_from(">H", payload, offset)[0]
        if length < 2 or offset + length > len(payload):
            return None
        if marker in frame_markers and length >= 7:
            height, width = struct.unpack_from(">HH", payload, offset + 3)
            return width, height
        offset += length
    return None


def _tiff_dimensions(payload: bytes) -> tuple[int, int] | None:
    endian = "<" if payload[:2] == b"II" else ">"
    if len(payload) < 8 or struct.unpack_from(endian + "H", payload, 2)[0] != 42:
        return None
    ifd = struct.unpack_from(endian + "I", payload, 4)[0]
    if ifd + 2 > len(payload):
        return None
    count = struct.unpack_from(endian + "H", payload, ifd)[0]
    if count > 1024 or ifd + 2 + count * 12 > len(payload):
        return None
    values: dict[int, int] = {}
    for index in range(count):
        entry = ifd + 2 + index * 12
        tag, value_type, value_count = struct.unpack_from(endian + "HHI", payload, entry)
        if tag not in {256, 257} or value_count != 1:
            continue
        if value_type == 3:
            values[tag] = struct.unpack_from(endian + "H", payload, entry + 8)[0]
        elif value_type == 4:
            values[tag] = struct.unpack_from(endian + "I", payload, entry + 8)[0]
    return (values[256], values[257]) if {256, 257}.issubset(values) else None


def _webp_dimensions(payload: bytes) -> tuple[int, int] | None:
    if len(payload) < 30:
        return None
    chunk = payload[12:16]
    if chunk == b"VP8X" and len(payload) >= 30:
        width = 1 + int.from_bytes(payload[24:27], "little")
        height = 1 + int.from_bytes(payload[27:30], "little")
        return width, height
    if chunk == b"VP8L" and len(payload) >= 25 and payload[20] == 0x2F:
        b1, b2, b3, b4 = payload[21:25]
        return 1 + b1 + ((b2 & 0x3F) << 8), 1 + ((b2 & 0xC0) >> 6) + (b3 << 2) + ((b4 & 0x0F) << 10)
    if chunk == b"VP8 " and len(payload) >= 30 and payload[23:26] == b"\x9d\x01\x2a":
        width = struct.unpack_from("<H", payload, 26)[0] & 0x3FFF
        height = struct.unpack_from("<H", payload, 28)[0] & 0x3FFF
        return width, height
    return None
