from __future__ import annotations

import asyncio
import base64
import io
import json
import struct
import sys
import zipfile
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

from quant_research.api.routes.portfolio import SavePortfolioSnapshotRequest, create_portfolio_router
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services import portfolio_import as portfolio


def _xlsx_bytes(rows: list[list[str]]) -> bytes:
    worksheet_rows = []
    for row_number, row in enumerate(rows, start=1):
        cells = []
        for column_number, value in enumerate(row, start=1):
            column = chr(ord("A") + column_number - 1)
            cells.append(f'<c r="{column}{row_number}" t="inlineStr"><is><t>{value}</t></is></c>')
        worksheet_rows.append(f'<row r="{row_number}">{"".join(cells)}</row>')
    files = {
        "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Holdings" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/></Relationships>',
        "xl/worksheets/sheet1.xml": f'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(worksheet_rows)}</sheetData></worksheet>',
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def _png(width: int = 20, height: int = 20) -> bytes:
    return b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", width, height) + b"\x08\x02\x00\x00\x00"


def _bars(symbol: str, start: date, sessions: int, *, last_close: float = 100.0, volume_offset: float = 0.0) -> list[OHLCVBar]:
    day = start
    bars: list[OHLCVBar] = []
    while len(bars) < sessions:
        if day.weekday() < 5:
            index = len(bars)
            close = last_close - (sessions - index - 1) * 0.1
            bars.append(OHLCVBar(
                timestamp=datetime.combine(day, time(16), tzinfo=ZoneInfo("Asia/Kolkata")),
                symbol=symbol,
                open=close,
                high=close + 1,
                low=close - 1,
                close=close,
                volume=1000 + index + volume_offset,
            ))
        day += timedelta(days=1)
    return bars


def test_decode_and_preview_xlsx_extracts_holdings() -> None:
    raw = _xlsx_bytes([
        ["Symbol", "Quantity", "Average Price"],
        ["RELIANCE", "2", "1234.50"],
        ["TCS", "3", "4100"],
    ])
    fmt, payload = portfolio.decode_upload(
        "holdings.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        base64.b64encode(raw).decode("ascii"),
    )

    preview = portfolio.preview_portfolio_file(fmt, payload)

    assert preview["source_format"] == "xlsx"
    assert preview["holdings"] == [
        {"symbol": "RELIANCE", "quantity": "2", "average_price": "1234.5", "source_row": "2"},
        {"symbol": "TCS", "quantity": "3", "average_price": "4100", "source_row": "3"},
    ]
    assert preview["warnings"] == []


def test_decode_rejects_mismatched_type_and_oversized_base64() -> None:
    with pytest.raises(portfolio.PortfolioImportError, match="contents are not a PDF"):
        portfolio.decode_upload("report.pdf", "application/pdf", base64.b64encode(b"not-pdf").decode())
    with pytest.raises(portfolio.PortfolioImportError, match="larger than") as exc_info:
        portfolio.decode_upload("holdings.xlsx", None, "A" * ((portfolio.MAX_FILE_BYTES * 4 // 3) + 9))
    assert exc_info.value.status_code == 413


def test_preview_image_ocr_is_local_and_pixel_limited(monkeypatch: pytest.MonkeyPatch) -> None:
    image = _png()
    monkeypatch.setattr(portfolio, "_run_ocr", lambda _image: "Symbol Quantity Average Price\nRELIANCE 2 1234.50")
    preview = portfolio.preview_portfolio_file("image", image)
    assert preview["holdings"][0]["symbol"] == "RELIANCE"
    assert preview["holdings"][0]["quantity"] == "2"

    with pytest.raises(portfolio.PortfolioImportError, match="20 megapixels"):
        portfolio.preview_portfolio_file("image", _png(5000, 5000))


def test_pdf_page_limit_checked_before_text_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(portfolio.shutil, "which", lambda name: f"/tools/{name}")
    calls: list[list[str]] = []

    def fake_run(command: list[str], _payload: bytes, binary: bool = False) -> str | bytes:
        calls.append(command)
        return "Pages:          6\n" if not binary else b""

    monkeypatch.setattr(portfolio, "_run_tool", fake_run)
    with pytest.raises(portfolio.PortfolioImportError, match="between 1 and 5 pages") as exc_info:
        portfolio.preview_portfolio_file("pdf", b"%PDF-1.4 synthetic")
    assert exc_info.value.status_code == 413
    assert len(calls) == 1


def test_pdf_ocr_reads_a_bounded_temporary_render(monkeypatch: pytest.MonkeyPatch) -> None:
    tools = {"pdfinfo": "/tools/pdfinfo", "pdftotext": None, "pdftoppm": "/tools/pdftoppm", "tesseract": "/tools/tesseract"}
    monkeypatch.setattr(portfolio.shutil, "which", lambda name: tools.get(name))
    rendered_paths: list[Path] = []

    def fake_run(command: list[str], _payload: bytes, binary: bool = False, env: dict[str, str] | None = None) -> str | bytes:
        if command[0] == "/tools/pdfinfo":
            return "Pages:          1\nEncrypted:       no\n"
        assert env is not None
        assert Path(env["XDG_CACHE_HOME"]).is_dir()
        rendered = Path(command[-1]).with_suffix(".png")
        rendered.write_bytes(_png())
        rendered_paths.append(rendered)
        return b"" if binary else ""

    monkeypatch.setattr(portfolio, "_run_tool", fake_run)
    monkeypatch.setattr(portfolio, "_run_ocr", lambda _image: "Symbol       Quantity       Avg Price\nRELIANCE     2              1234.50")

    preview = portfolio.preview_portfolio_file("pdf", b"%PDF-1.4 synthetic")

    assert preview["holdings"] == [{
        "symbol": "RELIANCE", "quantity": "2", "average_price": "1234.5", "source_row": "2",
    }]
    assert preview["warnings"] == []
    assert len(rendered_paths) == 1
    assert not rendered_paths[0].exists()


def test_local_parser_process_output_is_bounded() -> None:
    result = portfolio._run_tool([sys.executable, "-c", "import sys; sys.stdin.read(); print('ok')"], b"input")
    assert result == "ok\n"

    with pytest.raises(portfolio.PortfolioImportError, match="too much text") as exc_info:
        portfolio._run_tool(
            [sys.executable, "-c", "import sys; sys.stdin.read(); print('x' * 1200000)"],
            b"input",
        )
    assert exc_info.value.status_code == 413


def test_normalize_combines_duplicates_with_weighted_average() -> None:
    result = portfolio.normalize_holdings([
        {"symbol": "NSE:reliance", "quantity": "2", "average_price": "100"},
        {"symbol": "RELIANCE.NS", "quantity": "3", "average_price": "120"},
    ])
    assert result["holdings"] == [{
        "symbol": "RELIANCE",
        "quantity": "5",
        "average_price": "112",
        "cost_basis": "560",
    }]
    assert result["total_cost_basis"] == "560"


@pytest.mark.parametrize("value", ["0", "-2", "NaN", "Infinity", "not a number"])
def test_normalize_rejects_invalid_quantities(value: str) -> None:
    with pytest.raises(portfolio.PortfolioImportError):
        portfolio.normalize_holdings([{"symbol": "TCS", "quantity": value, "average_price": "10"}])


def test_confirmed_snapshot_saves_only_normalized_holdings(tmp_path: Path) -> None:
    store = SqliteArtifactStore(tmp_path / "artifacts.sqlite")
    snapshot = portfolio.save_portfolio_snapshot(store, "xlsx", [
        {"symbol": "TCS", "quantity": "4", "average_price": "3000", "source_row": "7"},
    ])
    persisted = store.get(portfolio.PORTFOLIO_SNAPSHOT_KIND, snapshot["snapshot_id"])

    assert persisted is not None
    assert persisted["holdings"] == [{"symbol": "TCS", "quantity": "4", "average_price": "3000", "cost_basis": "12000"}]
    assert "filename" not in persisted
    assert "raw_file" not in persisted
    assert "source_row" not in str(persisted)


def test_local_preview_confirm_and_analysis_api_flow(tmp_path: Path) -> None:
    artifacts = SqliteArtifactStore(tmp_path / "artifacts.sqlite")
    cache = SqliteMarketCache(tmp_path / "market.sqlite")
    cache.put([OHLCVBar(
        timestamp=datetime(2026, 11, 16, 16, tzinfo=ZoneInfo("Asia/Kolkata")),
        symbol="RELIANCE",
        open=199,
        high=202,
        low=198,
        close=200,
        volume=1_000,
    )], "1day", "synthetic-test")
    router = create_portfolio_router(artifacts, cache)
    endpoints = {route.name: route.endpoint for route in router.routes}
    raw = _xlsx_bytes([["Symbol", "Quantity", "Average Price"], ["RELIANCE", "2", "150"]])
    preview_body = json.dumps({
        "filename": "holdings.xlsx",
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "data_base64": base64.b64encode(raw).decode("ascii"),
    }).encode()

    class FakeRequest:
        headers = {"content-length": str(len(preview_body))}

        async def stream(self):
            yield preview_body

    preview = asyncio.run(endpoints["preview_upload"](FakeRequest()))
    preview_payload = preview.model_dump()
    assert len(artifacts.list(portfolio.PORTFOLIO_SNAPSHOT_KIND)) == 0

    save_request = SavePortfolioSnapshotRequest.model_validate({
        "source_format": "xlsx",
        "holdings": [
            {key: row[key] for key in ("symbol", "quantity", "average_price")}
            for row in preview_payload["holdings"]
        ],
    })
    saved = endpoints["save_snapshot"](save_request).model_dump()
    analysis = endpoints["analyze_snapshot"](saved["snapshot_id"]).model_dump()

    assert analysis["positions"][0]["market_value"] == "400.00"
    assert analysis["positions"][0]["unrealized_pnl"] == "100.00"
    assert len(artifacts.list(portfolio.PORTFOLIO_SNAPSHOT_KIND)) == 1
    persisted = artifacts.get(portfolio.PORTFOLIO_SNAPSHOT_KIND, saved["snapshot_id"])
    assert persisted is not None and "filename" not in persisted


def test_analysis_uses_local_daily_cache_and_reports_insufficient_symbols(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite")
    # Five hundred weekday sessions retain more than 20 completed calendar months.
    bars = _bars("RELIANCE", date(2024, 12, 16), 500, last_close=200)
    cache.put(bars, "1day", "synthetic-test")
    snapshot = {
        "snapshot_id": "snapshot-1",
        "holdings": [
            {"symbol": "RELIANCE", "quantity": "2", "average_price": "150", "cost_basis": "300"},
            {"symbol": "MISSING", "quantity": "1", "average_price": "10", "cost_basis": "10"},
        ],
    }

    result = portfolio.analyze_portfolio_snapshot(
        cache,
        snapshot,
        today=datetime(2026, 11, 17, 12, tzinfo=ZoneInfo("Asia/Kolkata")),
    )

    assert result["data_source"] == "local_cached_official_nse_daily_ohlcv"
    assert result["totals"]["priced_positions"] == 1
    assert "Refresh NSE daily data" in result["review_priorities"][0]
    positions = {item["symbol"]: item for item in result["positions"]}
    assert positions["RELIANCE"]["latest_close"] == "200.00"
    assert positions["RELIANCE"]["market_value"] == "400.00"
    assert positions["RELIANCE"]["market_value_weight_pct"] == "100.00"
    assert positions["RELIANCE"]["unrealized_pnl"] == "100.00"
    assert positions["RELIANCE"]["indicators"]["sma20"] is not None
    assert positions["RELIANCE"]["indicators"]["sma50"] is not None
    assert positions["RELIANCE"]["indicators"]["sma200"] is not None
    assert positions["RELIANCE"]["indicators"]["sma20_completed_months"] is not None
    assert positions["RELIANCE"]["indicators"]["relative_volume_20d"] is not None
    rule = positions["RELIANCE"]["rule_assessment"]
    assert rule["status"] == "watch"
    assert rule["entry_trigger"] is not None and rule["stop_loss"] is not None
    assert rule["historical_gate_status"] == "not_evaluated"
    assert any("requires close above SMA50" in reason for reason in rule["reasons"])
    assert positions["MISSING"]["freshness"] == "missing"
    assert positions["MISSING"]["latest_close"] is None
    assert positions["MISSING"]["rule_assessment"]["status"] == "insufficient_history"


def test_portfolio_review_priorities_summarize_rule_status_and_largest_exposure(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite")
    start = date(2024, 12, 16)
    cache.put(_bars("RELIANCE", start, 500, last_close=200), "1day", "synthetic-test")
    cache.put(_bars("TCS", start, 500, last_close=100), "1day", "synthetic-test")
    result = portfolio.analyze_portfolio_snapshot(cache, {
        "snapshot_id": "snapshot-2",
        "holdings": [
            {"symbol": "RELIANCE", "quantity": "2", "average_price": "150"},
            {"symbol": "TCS", "quantity": "1", "average_price": "110"},
        ],
    }, today=datetime(2026, 11, 17, 12, tzinfo=ZoneInfo("Asia/Kolkata")))

    positions = {item["symbol"]: item for item in result["positions"]}
    assert positions["RELIANCE"]["market_value_weight_pct"] == "80.00"
    assert positions["TCS"]["market_value_weight_pct"] == "20.00"
    assert any("RELIANCE is 80.00%" in item for item in result["review_priorities"])
    assert any("watch-only setups" in item for item in result["review_priorities"])
