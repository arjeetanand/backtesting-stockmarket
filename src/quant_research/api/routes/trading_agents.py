"""Optional, user-triggered TradingAgents review of an existing NSE analysis."""

from threading import Lock

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.services.stock_research import ARTIFACT_KIND
from quant_research.services.trading_agents import (
    TradingAgentsReviewError,
    TradingAgentsUnavailableError,
    model_name,
    review_stock_analysis,
)


class TradingAgentsRequest(BaseModel):
    run_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")


class TradingAgentsResponse(BaseModel):
    symbol: str
    data_as_of: str
    model: str
    bull_case: str
    bear_case: str
    review: str


def create_trading_agents_router(artifacts: SqliteArtifactStore) -> APIRouter:
    router = APIRouter(prefix="/api/v1/stock-research", tags=["research"])
    review_lock = Lock()

    @router.post("/trading-agents", response_model=TradingAgentsResponse)
    def review(payload: TradingAgentsRequest) -> TradingAgentsResponse:
        analysis = artifacts.get(ARTIFACT_KIND, payload.run_id)
        if analysis is None:
            raise HTTPException(404, "Saved analysis not found. Analyze the stock first.")
        if analysis.get("run_status") != "completed":
            raise HTTPException(422, "Complete a stock analysis with local NSE history first.")
        # One local review at a time prevents duplicate concurrent API charges.
        if not review_lock.acquire(blocking=False):
            raise HTTPException(409, "An AI review is already running. Wait for it to finish.")
        try:
            cache_key = f"v0.7.1:{model_name()}:{payload.run_id}"
            cached = artifacts.get("trading_agents_review", cache_key)
            if cached is not None:
                return TradingAgentsResponse.model_validate(cached)
            try:
                result = TradingAgentsResponse.model_validate(review_stock_analysis(analysis))
            except TradingAgentsUnavailableError as exc:
                raise HTTPException(503, str(exc)) from exc
            except TradingAgentsReviewError as exc:
                raise HTTPException(502, str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(422, "The saved analysis is incomplete. Analyze the stock again.") from exc
            if artifacts.get(ARTIFACT_KIND, payload.run_id) is not None:
                artifacts.save("trading_agents_review", cache_key, {**result.model_dump(), "source_run_id": payload.run_id})
            return result
        finally:
            review_lock.release()

    return router
