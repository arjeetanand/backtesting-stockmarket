import sqlite3
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError

import pytest
from fastapi import BackgroundTasks, HTTPException

from quant_research.api.routes.api import _fii_dii_response, create_api_router
from quant_research.api.schemas import FiiDiiImportRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import FiiDiiRow, IndexClose, SqliteMarketCache
from quant_research.services.fii_dii import FiiDiiImportError, NseFiiDiiImporter, TapetideFiiDiiHistoryImporter
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.nse_indices import NseIndexArchiveImporter
from quant_research.services.research import ResearchService


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def test_fii_dii_parser_normalizes_nse_rows_and_computes_missing_net() -> None:
    rows = NseFiiDiiImporter._rows_from_payload([
        {"category": "FII/FPI", "date": "24-Jul-2026", "buyValue": "11,123.86", "sellValue": "15,016.63"},
        {"category": "DII", "date": "24-Jul-2026", "buyValue": "18,959.43", "sellValue": "13,505.88", "netValue": "5453.55"},
    ])

    assert [(row.participant, row.net_value) for row in rows] == [("FII", -3892.77), ("DII", 5453.55)]
    assert rows[0].trading_day == date(2026, 7, 24)
    assert rows[0].scope == "combined"


def test_fii_dii_cache_aggregates_daily_weekly_monthly_and_keeps_index_close(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    rows = [
        FiiDiiRow(date(2026, 7, 23), "FII", "combined", "equity", 100, 130, -30, "nse"),
        FiiDiiRow(date(2026, 7, 23), "DII", "combined", "equity", 160, 100, 60, "nse"),
        FiiDiiRow(date(2026, 7, 24), "FII", "combined", "equity", 120, 150, -30, "nse"),
        FiiDiiRow(date(2026, 7, 24), "DII", "combined", "equity", 190, 130, 60, "nse"),
    ]
    cache.store_fii_dii_snapshot("snapshot", datetime(2026, 7, 24, tzinfo=UTC), "nse", "{}", rows)
    cache.store_index_closes([IndexClose(date(2026, 7, 24), 24353.55, "nse")])

    response = _fii_dii_response(cache, date(2026, 7, 1), date(2026, 7, 24), "combined", "equity")

    assert response.summaries[0].fii_net == -30
    assert response.summaries[1].dii_net == 120
    assert response.summaries[2].fii_net == -60
    assert response.nifty50[0].close == 24353.55
    assert response.coverage_note is not None


def test_fii_dii_import_endpoint_rejects_invalid_range(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii/import"))

    from fastapi import BackgroundTasks, HTTPException

    try:
        endpoint(FiiDiiImportRequest(start=date(2026, 7, 24), end=date(2026, 7, 1)), BackgroundTasks())
    except HTTPException as exc:
        assert exc.status_code == 422
    else:
        raise AssertionError("Expected invalid FII/DII range to be rejected")


def test_fii_dii_importer_uses_latest_snapshot_without_refetching_saved_rows(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")

    class StubIndexImporter:
        def __init__(self) -> None:
            self.days: list[date] = []

        def import_days(self, days: list[date]) -> None:
            self.days.extend(days)

    index_importer = StubIndexImporter()
    importer = NseFiiDiiImporter(cache, archive_path=tmp_path / "archives", index_importer=index_importer)  # type: ignore[arg-type]
    calls: list[str] = []

    payloads: list[object] = [
        [
            {"category": "FII/FPI", "date": "24-Jul-2026", "buyValue": "120", "sellValue": "150"},
            {"category": "DII", "date": "24-Jul-2026", "buyValue": "190", "sellValue": "130"},
        ],
        [
            {"category": "FII/FPI", "date": "24-Jul-2026", "buyValue": "120", "sellValue": "150"},
            {"category": "DII", "date": "24-Jul-2026", "buyValue": "190", "sellValue": "130"},
        ],
        [
            {"category": "FII/FPI", "date": "24-Jul-2026", "buyValue": "121", "sellValue": "150"},
            {"category": "DII", "date": "24-Jul-2026", "buyValue": "190", "sellValue": "130"},
        ],
    ]

    def download(url: str | None = None) -> object:
        assert url is not None
        calls.append(url)
        return payloads[len(calls) - 1]

    importer._download_report = download  # type: ignore[method-assign]
    stored, available_start, available_end = importer.import_reports(date(2026, 7, 23), date(2026, 7, 24))
    unchanged_rows, _, _ = importer.import_reports(date(2014, 1, 1), date(2026, 7, 24))
    corrected_rows, _, _ = importer.import_reports(date(2014, 1, 1), date(2026, 7, 24))

    assert stored == 2
    assert unchanged_rows == 0
    assert corrected_rows == 1
    assert available_start == date(2026, 7, 24)
    assert available_end == date(2026, 7, 24)
    assert len(calls) == 3
    assert calls[0] == importer.report_url
    assert index_importer.days == [date(2026, 7, 24)] * 3
    assert len(cache.get_fii_dii_rows(date(2026, 7, 23), date(2026, 7, 24))) == 2
    fii_row = next(row for row in cache.get_fii_dii_rows(date(2026, 7, 24), date(2026, 7, 24)) if row.participant == "FII")
    assert fii_row.buy_value == 121
    with sqlite3.connect(cache.path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM fii_dii_snapshots").fetchone()[0] == 2


def test_tapetide_global_sync_fetches_only_missing_official_sessions_once(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    saved_day = date(2025, 1, 2)
    gap_day = date(2025, 1, 3)
    completed_day = date(2025, 1, 6)
    empty_day = date(2025, 1, 7)
    for trading_day in (saved_day, gap_day, completed_day, empty_day):
        cache.record_nse_archive(trading_day, None, "nse", 1)
    cache.store_fii_dii_history_rows([
        FiiDiiRow(trading_day, participant, "tapetide", "equity", buy, sell, buy - sell, "tapetide")
        for trading_day, buy, sell in ((saved_day, 10, 8), (completed_day, 30, 28))
        for participant in ("FII", "DII")
    ])
    importer = TapetideFiiDiiHistoryImporter(cache, "test-token")
    calls: list[tuple[date, date]] = []

    def download(start: date, end: date, cursor: str | None) -> dict[str, object]:
        assert cursor is None
        calls.append((start, end))
        records = [
            {
                "date": gap_day.isoformat(), "fii_buy_cr": 100, "fii_sell_cr": 80, "fii_net_cr": 20,
                "dii_buy_cr": 90, "dii_sell_cr": 70, "dii_net_cr": 20,
            },
            {
                "date": completed_day.isoformat(), "fii_buy_cr": 999, "fii_sell_cr": 1, "fii_net_cr": 998,
                "dii_buy_cr": 999, "dii_sell_cr": 1, "dii_net_cr": 998,
            },
        ]
        return {"data": records, "meta": {"has_more": False, "next_cursor": None}}

    importer._download_page = download  # type: ignore[method-assign]
    result = importer.sync_missing_nse_sessions(saved_day, empty_day)
    again = importer.sync_missing_nse_sessions(saved_day, empty_day)

    assert calls == [(gap_day, empty_day)]
    assert result == {
        "checked_days": 2,
        "stored_rows": 2,
        "pages_fetched": 1,
        "skipped_records": 0,
        "empty_days": 1,
        "incomplete_days": 0,
        "available_start": gap_day,
        "available_end": gap_day,
    }
    assert again["checked_days"] == 0
    assert len(calls) == 1
    assert cache.missing_fii_dii_history_days(saved_day, empty_day) == []
    preserved = cache.get_fii_dii_history_rows(completed_day, completed_day)
    assert [(row.participant, row.buy_value) for row in preserved] == [("DII", 30), ("FII", 30)]
    cache.store_fii_dii_history_rows([
        FiiDiiRow(empty_day, "FII", "tapetide", "equity", 10, 8, 2, "tapetide")
    ])
    assert cache.missing_fii_dii_history_days(saved_day, empty_day) == [empty_day]


def test_tapetide_global_sync_keeps_partial_days_retryable(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    partial_day = date(2025, 1, 3)
    cache.record_nse_archive(partial_day, None, "nse", 1)
    importer = TapetideFiiDiiHistoryImporter(cache, "test-token")

    def download(start: date, end: date, cursor: str | None) -> dict[str, object]:
        assert (start, end, cursor) == (partial_day, partial_day, None)
        return {
            "data": [{
                "date": partial_day.isoformat(), "fii_buy_cr": 100, "fii_sell_cr": 80, "fii_net_cr": 20,
                "dii_buy_cr": None, "dii_sell_cr": None, "dii_net_cr": None,
            }],
            "meta": {"has_more": False, "next_cursor": None},
        }

    importer._download_page = download  # type: ignore[method-assign]
    result = importer.sync_missing_nse_sessions(partial_day, partial_day)

    assert result["incomplete_days"] == 1
    assert result["empty_days"] == 0
    assert cache.missing_fii_dii_history_days(partial_day, partial_day) == [partial_day]


def test_tapetide_sync_reports_invalid_response_shape_without_echoing_values(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = TapetideFiiDiiHistoryImporter(cache, "test-token")
    importer._download_page = lambda *_args: {"error": {"code": "invalid_token", "message": "do not echo"}}  # type: ignore[method-assign]

    with pytest.raises(FiiDiiImportError, match="rejected the configured token") as error:
        importer.sync(date(2025, 1, 3), date(2025, 1, 3))

    assert "do not echo" not in str(error.value)
    assert cache.get_fii_dii_history_rows(date(2025, 1, 3), date(2025, 1, 3)) == []


def test_tapetide_http_errors_use_documented_error_code_without_echoing_message(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = TapetideFiiDiiHistoryImporter(cache, "test-token")

    def fail_request(*_args, **_kwargs):
        raise HTTPError(
            importer.endpoint,
            429,
            "Too Many Requests",
            None,
            BytesIO(b'{"error":{"code":"quota_exhausted","message":"do not echo"}}'),
        )

    monkeypatch.setattr("quant_research.services.fii_dii.urlopen", fail_request)
    with pytest.raises(FiiDiiImportError, match="quota is exhausted") as error:
        importer._download_page(date(2025, 1, 3), date(2025, 1, 3), None)

    assert "do not echo" not in str(error.value)


def test_global_market_sync_reports_source_failures_without_skipping_other_sources(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    latest = datetime(2026, 10, 28, tzinfo=UTC)
    cache.put(
        [OHLCVBar(timestamp=latest, symbol="RELIANCE", open=100, high=101, low=99, close=100, volume=1000)],
        "1day",
        "official-nse-test",
    )

    class FailedDailySync:
        def __init__(self, _cache: SqliteMarketCache) -> None:
            pass

        def sync_latest(self) -> dict[str, object]:
            raise RuntimeError("NSE archive unavailable")

    class FailedNseFiiDii:
        def import_reports(self, start: date, end: date, scope: str) -> tuple[int, date | None, date | None]:
            assert start == date(2014, 1, 1)
            assert end >= latest.date()
            assert scope == "combined"
            raise RuntimeError("NSE FII/DII unavailable")

    class AvailableTapetide:
        configured = True

        def sync_missing_nse_sessions(self, start: date, end: date) -> dict[str, object]:
            assert start == date(2014, 1, 1)
            assert end == latest.date()
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

    monkeypatch.setattr("quant_research.services.daily_sync.DailySyncService", FailedDailySync)
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        fii_dii_importer=FailedNseFiiDii(),  # type: ignore[arg-type]
        tapetide_history_importer=AvailableTapetide(),  # type: ignore[arg-type]
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/data/sync-today"))

    result = endpoint()

    assert result["status"] == "partial"
    assert result["sources"]["nse_daily"]["status"] == "failed"
    assert result["sources"]["nse_fii_dii"]["status"] == "failed"
    assert result["sources"]["tapetide_history"]["status"] == "complete"


def test_nifty50_archive_parser_uses_official_index_row() -> None:
    payload = b"Index Name,Closing Index Value\nNIFTY 50,24353.55\n"
    assert NseIndexArchiveImporter._parse_nifty50_close(payload) == 24353.55


def test_one_year_tapetide_view_reads_saved_rows_and_explains_partial_coverage(tmp_path: Path) -> None:
    today = date.today()
    first_saved_day = today - timedelta(days=60)
    latest_saved_day = today - timedelta(days=1)
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.store_fii_dii_snapshot(
        "nse", datetime.now(UTC), "nse", "{}",
        [FiiDiiRow(latest_saved_day, "FII", "combined", "equity", 10, 5, 5, "nse")],
    )
    with sqlite3.connect(cache.path) as connection:
        connection.executemany(
            """INSERT INTO fii_dii_history_rows
               (trading_day, participant, scope, segment, buy_value, sell_value, net_value, source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (day.isoformat(), participant, "tapetide", "equity", 100, 80, 20, "https://tapetide.com/fii-dii-data")
                for day in (first_saved_day, latest_saved_day)
                for participant in ("FII", "DII")
            ],
        )

    response = _fii_dii_response(
        cache,
        today - timedelta(days=364),
        today,
        "combined",
        "equity",
        source="tapetide",
    )

    assert len(response.rows) == 4
    assert {row.scope for row in response.rows} == {"tapetide"}
    assert response.coverage_days == 2
    assert response.coverage_start == first_saved_day
    assert response.coverage_end == latest_saved_day
    assert response.coverage_note is not None
    assert "missing earlier dates are not available locally" in response.coverage_note
    assert len(cache.get_fii_dii_rows(latest_saved_day, latest_saved_day)) == 1


def test_tapetide_sync_clamps_to_source_start_pages_and_saves_only_tapetide_rows(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.store_fii_dii_snapshot(
        "nse", datetime.now(UTC), "nse", "{}",
        [FiiDiiRow(date(2014, 1, 2), "FII", "combined", "equity", 9, 5, 4, "nse")],
    )
    importer = TapetideFiiDiiHistoryImporter(cache, "test-token")
    calls: list[tuple[date, date, str | None]] = []
    pages = [
        {
            "data": [{
                "date": "2014-01-02", "fii_buy_cr": 120.0, "fii_sell_cr": 100.0, "fii_net_cr": None,
                "dii_buy_cr": None, "dii_sell_cr": None, "dii_net_cr": None,
            }],
            "meta": {"has_more": True, "next_cursor": "page-two"},
        },
        {
            "data": [{
                "date": "2014-01-03", "fii_buy_cr": 110.0, "fii_sell_cr": 90.0, "fii_net_cr": 20.0,
                "dii_buy_cr": 210.0, "dii_sell_cr": 190.0, "dii_net_cr": 20.0,
            }],
            "meta": {"has_more": False, "next_cursor": None},
        },
    ]

    def download(start: date, end: date, cursor: str | None) -> dict[str, object]:
        calls.append((start, end, cursor))
        return pages[len(calls) - 1]

    importer._download_page = download  # type: ignore[method-assign]
    progress: list[str] = []
    result = importer.sync(date(2006, 1, 1), date(2014, 1, 3), progress.append)

    saved = cache.get_fii_dii_history_rows(date(2014, 1, 1), date(2014, 1, 3))
    assert calls == [
        (date(2014, 1, 1), date(2014, 1, 3), None),
        (date(2014, 1, 1), date(2014, 1, 3), "page-two"),
    ]
    assert result == {
        "stored_rows": 3,
        "pages_fetched": 2,
        "skipped_records": 1,
        "available_start": date(2014, 1, 2),
        "available_end": date(2014, 1, 3),
    }
    assert [(row.trading_day, row.participant, row.net_value) for row in saved] == [
        (date(2014, 1, 2), "FII", 20.0),
        (date(2014, 1, 3), "DII", 20.0),
        (date(2014, 1, 3), "FII", 20.0),
    ]
    assert all(row.scope == "tapetide" and row.source == importer.endpoint for row in saved)
    assert len(cache.get_fii_dii_rows(date(2014, 1, 2), date(2014, 1, 3))) == 1
    assert len(progress) == 2


def test_tapetide_sync_rejects_repeated_cursor_without_partial_sqlite_write(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = TapetideFiiDiiHistoryImporter(cache, "test-token")

    def download(start: date, end: date, cursor: str | None) -> dict[str, object]:
        return {
            "data": [{
                "date": "2014-01-02", "fii_buy_cr": 120.0, "fii_sell_cr": 100.0, "fii_net_cr": 20.0,
                "dii_buy_cr": 210.0, "dii_sell_cr": 190.0, "dii_net_cr": 20.0,
            }],
            "meta": {"has_more": True, "next_cursor": "repeat"},
        }

    importer._download_page = download  # type: ignore[method-assign]
    with pytest.raises(RuntimeError, match="pagination did not advance"):
        importer.sync(date(2014, 1, 1), date(2014, 1, 3))

    assert cache.get_fii_dii_history_rows(date(2014, 1, 1), date(2014, 1, 3)) == []


def test_tapetide_sync_requires_token_before_creating_import_job(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        tapetide_history_importer=TapetideFiiDiiHistoryImporter(cache, None),
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii/import"))

    with pytest.raises(HTTPException) as error:
        endpoint(
            FiiDiiImportRequest(start=date(2025, 1, 1), end=date(2025, 12, 31), source="tapetide"),
            BackgroundTasks(),
        )

    assert error.value.status_code == 503
    assert "TAPETIDE_API_TOKEN" in str(error.value.detail)


def test_tapetide_sync_runs_as_background_job_and_reports_saved_coverage(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")

    class StubHistoryImporter:
        configured = True

        def sync(self, start: date, end: date, progress=None) -> dict[str, object]:
            assert start == date(2025, 1, 1)
            assert end == date(2025, 12, 31)
            assert progress is not None
            progress("Downloaded Tapetide history page 1.")
            return {
                "stored_rows": 2,
                "pages_fetched": 1,
                "skipped_records": 0,
                "available_start": date(2025, 1, 2),
                "available_end": date(2025, 12, 30),
            }

    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        tapetide_history_importer=StubHistoryImporter(),  # type: ignore[arg-type]
    )
    start_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii/import"))
    status_endpoint = next(route.endpoint for route in router.routes if "/insights/fii-dii/import/{job_id}" in route.path)
    background_tasks = BackgroundTasks()
    job = start_endpoint(
        FiiDiiImportRequest(start=date(2025, 1, 1), end=date(2025, 12, 31), source="tapetide"),
        background_tasks,
    )

    assert job.source == "tapetide"
    assert job.status == "queued"
    scheduled = background_tasks.tasks[0]
    scheduled.func(*scheduled.args, **scheduled.kwargs)
    status = status_endpoint(job.job_id)

    assert status.status == "complete"
    assert status.pages_fetched == 1
    assert status.available_start == date(2025, 1, 2)
    assert "2 rows saved to SQLite" in status.message


def test_tapetide_job_reports_sqlite_failure_instead_of_staying_running(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")

    class FailingHistoryImporter:
        configured = True

        def sync(self, start: date, end: date, progress=None) -> dict[str, object]:
            raise sqlite3.OperationalError("disk is locked")

    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        tapetide_history_importer=FailingHistoryImporter(),  # type: ignore[arg-type]
    )
    start_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii/import"))
    status_endpoint = next(route.endpoint for route in router.routes if "/insights/fii-dii/import/{job_id}" in route.path)
    background_tasks = BackgroundTasks()
    job = start_endpoint(
        FiiDiiImportRequest(start=date(2025, 1, 1), end=date(2025, 12, 31), source="tapetide"),
        background_tasks,
    )
    scheduled = background_tasks.tasks[0]
    scheduled.func(*scheduled.args, **scheduled.kwargs)

    status = status_endpoint(job.job_id)
    assert status.status == "failed"
    assert "Check the configured cache and retry" in status.message
    assert "disk is locked" not in status.message
