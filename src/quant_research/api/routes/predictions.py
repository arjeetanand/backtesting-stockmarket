"""Local prospective setup tracking; no remote data requests."""

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.prediction_tracking import PredictionTrackingService
from quant_research.services.stock_research import ARTIFACT_KIND


class TrackSetupRequest(BaseModel):
    run_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")


def create_predictions_router(cache: SqliteMarketCache, artifacts: SqliteArtifactStore) -> APIRouter:
    router = APIRouter(prefix="/api/v1/stock-research/predictions", tags=["research"])
    service = PredictionTrackingService(cache, artifacts)

    @router.get("")
    def list_predictions(symbol: str | None = Query(default=None, min_length=1, max_length=50), limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
        return {"predictions": service.list(symbol, limit)}

    @router.post("")
    def track_setup(payload: TrackSetupRequest) -> dict[str, Any]:
        analysis = artifacts.get(ARTIFACT_KIND, payload.run_id)
        if analysis is None:
            raise HTTPException(404, "Saved stock analysis not found.")
        snapshot = service.record(analysis)
        if snapshot is None:
            raise HTTPException(422, "Only completed watch or triggered long setups with valid levels and no later cached bars can be tracked prospectively.")
        return service.evaluate(snapshot["prediction_id"])

    return router
