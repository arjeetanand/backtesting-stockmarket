from datetime import UTC, date, datetime
from pathlib import Path

import pytest
from fastapi import BackgroundTasks, HTTPException

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import NseImportRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import Instrument, SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.nse_import import NseBhavcopyImporter
from quant_research.services.research import ResearchService


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def test_inventory_shows_catalogue_and_saved_coverage_and_blocks_duplicates(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.replace_instruments(
        [
            Instrument("RELIANCE", "Reliance Industries Ltd.", "Oil & Gas", "EQ", "INE002A01018"),
            Instrument("INFY", "Infosys Ltd.", "Information Technology", "EQ", "INE009A01021"),
        ],
        universe="nifty500",
        source="official-nse",
    )
    cache.put(
        [
            OHLCVBar(
                timestamp=datetime(2025, 1, 2, tzinfo=UTC),
                symbol="RELIANCE",
                open=100,
                high=105,
                low=99,
                close=102,
                volume=1_000,
            )
        ],
        "1day",
        "nse_common_bhavcopy",
    )
    cache.mark_nse_day_covered(["RELIANCE"], "1day", date(2025, 1, 2))

    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        nse_importer=NseBhavcopyImporter(cache),
        market_cache=cache,
        artifacts=SqliteArtifactStore(tmp_path / "artifacts.sqlite3"),
    )
    inventory_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/data/inventory"))
    import_endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/data/nse-import"))

    response = inventory_endpoint(query="RELIANCE", start=date(2025, 1, 1), end=date(2025, 1, 3), limit=200)
    assert response[0].model_dump(mode="json") == {
        "symbol": "RELIANCE",
        "company_name": "Reliance Industries Ltd.",
        "industry": "Oil & Gas",
        "bars": 1,
        "earliest": "2025-01-02T00:00:00Z",
        "latest": "2025-01-02T00:00:00Z",
        "cached_days": 1,
        "requested_days": 3,
        "missing_days": 2,
        "fully_available": False,
    }

    with pytest.raises(HTTPException, match="already available") as duplicate:
        import_endpoint(
            NseImportRequest(start=date(2025, 1, 2), end=date(2025, 1, 2), preset="custom", symbols=["RELIANCE"]),
            BackgroundTasks(),
        )
    assert duplicate.value.status_code == 409

    missing = inventory_endpoint(query="INFY", start=date(2025, 1, 1), end=date(2025, 1, 3), limit=200)
    assert missing[0].bars == 0
    assert missing[0].missing_days == 3
