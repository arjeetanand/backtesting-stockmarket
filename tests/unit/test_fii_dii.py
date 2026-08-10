from datetime import UTC, date, datetime
from pathlib import Path

from quant_research.api.routes.api import _fii_dii_response, create_api_router
from quant_research.api.schemas import FiiDiiImportRequest
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import FiiDiiRow, IndexClose, SqliteMarketCache
from quant_research.services.fii_dii import NseFiiDiiImporter
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
