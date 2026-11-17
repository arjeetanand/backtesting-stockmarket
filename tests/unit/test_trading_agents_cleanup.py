from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import APIRouter, HTTPException

from quant_research.api.routes.api import create_api_router
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService
from quant_research.services.stock_research import ARTIFACT_KIND


class _StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


@pytest.fixture
def saved_research(tmp_path: Path) -> tuple[APIRouter, SqliteArtifactStore, SqliteMarketCache]:
    path = tmp_path / "market.sqlite3"
    artifacts = SqliteArtifactStore(path)
    cache = SqliteMarketCache(path)
    cache.put([OHLCVBar(
        timestamp=datetime(2026, 11, 16, tzinfo=UTC), symbol="RELIANCE",
        open=100, high=102, low=99, close=101, volume=1_000,
    )], "1day", "test")
    for run_id in ("run-1", "run-2"):
        artifacts.save(ARTIFACT_KIND, run_id, {"run_id": run_id})
        for model in ("model-a", "model-b"):
            artifacts.save("trading_agents_review", f"{model}:{run_id}", {"source_run_id": run_id})
    artifacts.save("import_job", "import-1", {"status": "completed"})
    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()), HypothesisService(_StubLlm()),
        market_cache=cache, artifacts=artifacts,
    )
    return router, artifacts, cache


def test_clear_history_removes_ai_reviews_and_preserves_market_data(
    saved_research: tuple[APIRouter, SqliteArtifactStore, SqliteMarketCache],
) -> None:
    router, artifacts, cache = saved_research
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/testing-history"))
    result = endpoint()
    assert result["deleted_artifacts"] == 6
    assert artifacts.list(ARTIFACT_KIND) == artifacts.list("trading_agents_review") == []
    assert artifacts.get("import_job", "import-1") == {"status": "completed"}
    assert cache.summary().bars == 1


def test_delete_analysis_removes_only_its_ai_reviews(
    saved_research: tuple[APIRouter, SqliteArtifactStore, SqliteMarketCache],
) -> None:
    router, artifacts, cache = saved_research
    endpoint = next(route.endpoint for route in router.routes
                    if route.path.endswith("/research/artifacts/{kind}/{artifact_key}") and "DELETE" in route.methods)
    assert endpoint(ARTIFACT_KIND, "run-1").status_code == 204
    assert artifacts.get(ARTIFACT_KIND, "run-1") is None
    assert artifacts.get(ARTIFACT_KIND, "run-2") == {"run_id": "run-2"}
    assert artifacts.list("trading_agents_review") == [{"source_run_id": "run-2"}] * 2
    assert cache.summary().bars == 1
    with pytest.raises(HTTPException) as caught:
        endpoint(ARTIFACT_KIND, "missing")
    assert caught.value.status_code == 404
    assert len(artifacts.list("trading_agents_review")) == 2
