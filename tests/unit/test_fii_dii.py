import sqlite3
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import BackgroundTasks, HTTPException

from quant_research.api.routes.api import _fii_dii_response, create_api_router
from quant_research.api.schemas import FiiDiiImportRequest
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import FiiDiiRow, IndexClose, SqliteMarketCache
from quant_research.services.fii_dii import NseFiiDiiImporter, TapetideFiiDiiHistoryImporter
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


def test_fii_dii_importer_uses_latest_snapshot_without_fabricating_history(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")

    class StubIndexImporter:
        def __init__(self) -> None:
            self.days: list[date] = []

        def import_days(self, days: list[date]) -> None:
            self.days.extend(days)

    index_importer = StubIndexImporter()
    importer = NseFiiDiiImporter(cache, archive_path=tmp_path / "archives", index_importer=index_importer)  # type: ignore[arg-type]
    calls: list[str] = []

    def download(url: str | None = None) -> object:
        assert url is not None
        calls.append(url)
        return [
            {"category": "FII/FPI", "date": "24-Jul-2026", "buyValue": "120", "sellValue": "150"},
            {"category": "DII", "date": "24-Jul-2026", "buyValue": "190", "sellValue": "130"},
        ]

    importer._download_report = download  # type: ignore[method-assign]
    stored, available_start, available_end = importer.import_reports(date(2026, 7, 23), date(2026, 7, 24))

    assert stored == 2
    assert available_start == date(2026, 7, 24)
    assert available_end == date(2026, 7, 24)
    assert len(calls) == 1
    assert calls[0] == importer.report_url
    assert index_importer.days == [date(2026, 7, 24)]
    assert len(cache.get_fii_dii_rows(date(2026, 7, 23), date(2026, 7, 24))) == 2


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
