from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from quant_research.api.routes.api import _fii_dii_response, create_api_router
from quant_research.api.schemas import FiiDiiHistorySyncRequest, FiiDiiImportRequest
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import FiiDiiRow, IndexClose, SqliteMarketCache
from quant_research.services.fii_dii import FiiDiiImportError, NseFiiDiiImporter, TapetideFiiDiiImporter
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


@pytest.mark.parametrize(("range_days", "expected_days"), [(30, {0}), (90, {0, 40})])
def test_tapetide_history_sync_is_bounded_and_kept_separate_from_nse(
    tmp_path: Path, range_days: int, expected_days: set[int]
) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    today = date.today()
    older = today - timedelta(days=40)
    outside = today - timedelta(days=100)
    nse_row = FiiDiiRow(today, "FII", "combined", "equity", 10, 20, -10, "nse")
    cache.store_fii_dii_snapshot("nse", datetime.now(UTC), "nse", "{}", [nse_row])
    importer = TapetideFiiDiiImporter(cache, token="test-token")
    requested: list[tuple[date, date]] = []

    def download(start: date, end: date) -> object:
        requested.append((start, end))
        return {
            "data": [
                {"date": day.isoformat(), "fii_buy_cr": 100, "fii_sell_cr": 80, "fii_net_cr": 20,
                 "dii_buy_cr": 120, "dii_sell_cr": 100, "dii_net_cr": None}
                for day in (today, older, outside)
            ],
            "meta": {"has_more": False},
        }

    importer._download_report = download  # type: ignore[method-assign]
    stored, available_start, available_end = importer.import_history(range_days)

    start = today - timedelta(days=range_days - 1)
    history = cache.get_fii_dii_history_rows(start, today)
    expected_dates = {today - timedelta(days=age) for age in expected_days}
    assert requested == [(start, today)]
    assert stored == 2 * len(expected_dates)
    assert (available_start, available_end) == (min(expected_dates), today)
    assert {row.trading_day for row in history} == expected_dates
    assert {row.net_value for row in history if row.participant == "DII"} == {20}
    assert cache.get_fii_dii_rows(today, today)[0] == nse_row


def test_tapetide_importer_rejects_unsupported_sync_window(tmp_path: Path) -> None:
    importer = TapetideFiiDiiImporter(SqliteMarketCache(tmp_path / "market.sqlite3"))
    with pytest.raises(FiiDiiImportError, match="only 30 or 90 days"):
        importer.import_history(365)


def test_tapetide_parser_rejects_inconsistent_or_paged_response() -> None:
    today = date.today()
    record = {
        "date": today.isoformat(), "fii_buy_cr": 100, "fii_sell_cr": 80, "fii_net_cr": 19,
        "dii_buy_cr": 120, "dii_sell_cr": 100, "dii_net_cr": 20,
    }
    with pytest.raises(FiiDiiImportError, match="does not match buy minus sell"):
        TapetideFiiDiiImporter._rows_from_payload({"data": [record], "meta": {"has_more": False}}, today, today)
    with pytest.raises(FiiDiiImportError, match="paged result"):
        TapetideFiiDiiImporter._rows_from_payload({"data": [record], "meta": {"has_more": True}}, today, today)
    with pytest.raises(FiiDiiImportError, match="complete"):
        TapetideFiiDiiImporter._rows_from_payload({"data": [record], "meta": {}}, today, today)


def test_tapetide_sync_route_returns_actionable_missing_token_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    monkeypatch.delenv("TAPETIDE_API_TOKEN", raising=False)
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        tapetide_fii_dii_importer=TapetideFiiDiiImporter(cache),
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii/history/sync"))

    with pytest.raises(HTTPException) as error:
        endpoint(FiiDiiHistorySyncRequest(range_days=90))

    assert error.value.status_code == 503
    assert "TAPETIDE_API_TOKEN" in error.value.detail


def test_tapetide_sync_route_reads_back_the_separate_history_series(tmp_path: Path) -> None:
    today = date.today()
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = TapetideFiiDiiImporter(cache, token="test-token")
    importer._download_report = lambda _start, _end: {
        "data": [{
            "date": today.isoformat(), "fii_buy_cr": 100, "fii_sell_cr": 80, "fii_net_cr": 20,
            "dii_buy_cr": 120, "dii_sell_cr": 100, "dii_net_cr": 20,
        }],
        "meta": {"has_more": False},
    }  # type: ignore[method-assign]
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        tapetide_fii_dii_importer=importer,
    )
    sync_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii/history/sync"))
    data_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/insights/fii-dii"))

    sync = sync_endpoint(FiiDiiHistorySyncRequest(range_days=30))
    data = data_endpoint(start=today, end=today, source="tapetide")

    assert sync.stored_rows == 2
    assert data.sync_available is True
    assert {row.participant for row in data.rows} == {"FII", "DII"}
    assert {row.scope for row in data.rows} == {"tapetide"}
