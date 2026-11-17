"""Optional, user-triggered TradingAgents review of freshly synced NSE data."""

from datetime import UTC, datetime
from threading import Lock
from typing import Literal, NoReturn
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from quant_research.api.schemas import StockResearchResponse
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.daily_sync import DailySyncService
from quant_research.services.stock_research import ARTIFACT_KIND, StockResearchService
from quant_research.services.trading_agents import (
    REVIEW_ATTEMPT_ARTIFACT_KIND,
    TradingAgentsReviewError,
    TradingAgentsUnavailableError,
    model_name,
    review_stock_analysis,
)

REVIEW_CACHE_KIND = "trading_agents_review"
REVIEW_VERSION = "v0.7.1"


class TradingAgentsRequest(BaseModel):
    run_id: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")


class TradingAgentsAttempt(BaseModel):
    attempt_id: str
    requested_run_id: str
    source_run_id: str | None
    symbol: str
    status: Literal[
        "running", "completed", "sync_failed", "analysis_failed", "analysis_incomplete",
        "review_unavailable", "review_failed",
    ]
    attempted_at: datetime
    finished_at: datetime | None
    sync_status: Literal["running", "complete", "partial", "failed", "not_started"]
    sync_message: str | None
    sync_target_day: str | None
    latest_trading_day: str | None
    synced_days: int
    skipped_days: int
    data_as_of: str | None
    data_hash: str | None
    model: str | None
    reviewed_at: datetime | None
    cache_hit: bool
    bull_case: str | None
    bear_case: str | None
    review: str | None
    error: str | None


class TradingAgentsResponse(TradingAgentsAttempt):
    analysis: StockResearchResponse


class TradingAgentsHistoryResponse(BaseModel):
    symbol: str
    attempts: list[TradingAgentsAttempt]


class TradingAgentsReviewContent(BaseModel):
    symbol: str
    data_as_of: str
    model: str
    bull_case: str
    bear_case: str
    review: str


def _day(value: object) -> str | None:
    return str(value)[:10] if value is not None else None


def create_trading_agents_router(
    market_cache: SqliteMarketCache,
    artifacts: SqliteArtifactStore,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/stock-research", tags=["research"])
    review_lock = Lock()

    @router.get("/trading-agents/history", response_model=TradingAgentsHistoryResponse)
    def history(
        symbol: str = Query(min_length=1, max_length=50),
        limit: int = Query(default=20, ge=1, le=50),
    ) -> TradingAgentsHistoryResponse:
        normalized = symbol.strip().upper().removesuffix(".NS")
        if not normalized:
            raise HTTPException(422, "Enter a valid NSE symbol.")
        attempts = artifacts.list_with_metadata_by_json_value(
            REVIEW_ATTEMPT_ARTIFACT_KIND,
            "$.symbol",
            normalized,
            limit=limit,
        )
        return TradingAgentsHistoryResponse(
            symbol=normalized,
            attempts=[TradingAgentsAttempt.model_validate(item) for item in attempts],
        )

    @router.post("/trading-agents", response_model=TradingAgentsResponse)
    def review(payload: TradingAgentsRequest) -> TradingAgentsResponse:
        previous = artifacts.get(ARTIFACT_KIND, payload.run_id)
        if previous is None:
            raise HTTPException(404, "Saved analysis not found. Analyze the stock first.")
        if previous.get("run_status") != "completed":
            raise HTTPException(422, "Complete a stock analysis with local NSE history first.")
        symbol = str(previous.get("symbol", "")).strip().upper().removesuffix(".NS")
        if not symbol:
            raise HTTPException(422, "The saved analysis has no valid NSE symbol.")

        # One local refresh/review at a time prevents duplicate concurrent API charges.
        if not review_lock.acquire(blocking=False):
            raise HTTPException(409, "An AI review is already running. Wait for it to finish.")

        attempted_at = datetime.now(UTC).isoformat()
        attempt_id = uuid4().hex
        record: dict[str, object] = {
            "attempt_id": attempt_id,
            "requested_run_id": payload.run_id,
            "source_run_id": None,
            "symbol": symbol,
            "status": "running",
            "attempted_at": attempted_at,
            "finished_at": None,
            "sync_status": "running",
            "sync_message": "Checking the latest available official NSE daily archive.",
            "sync_target_day": None,
            "latest_trading_day": None,
            "synced_days": 0,
            "skipped_days": 0,
            "data_as_of": None,
            "data_hash": None,
            "model": model_name(),
            "reviewed_at": None,
            "cache_hit": False,
            "bull_case": None,
            "bear_case": None,
            "review": None,
            "error": None,
        }
        artifacts.save(REVIEW_ATTEMPT_ARTIFACT_KIND, attempt_id, record)

        def fail(status_code: int, state: str, message: str) -> NoReturn:
            if state == "sync_failed":
                record.update({"sync_status": "failed", "sync_message": message})
            record.update({
                "status": state,
                "finished_at": datetime.now(UTC).isoformat(),
                "error": message,
            })
            artifacts.save(REVIEW_ATTEMPT_ARTIFACT_KIND, attempt_id, record)
            detail: dict[str, object] = {"message": message, "attempt_id": attempt_id}
            if record.get("source_run_id"):
                detail["source_run_id"] = record["source_run_id"]
            raise HTTPException(status_code, detail)

        try:
            try:
                sync_result = DailySyncService(market_cache).sync_latest()
            except Exception:
                fail(502, "sync_failed", "Could not sync the latest official NSE daily data; the AI review was not sent.")

            sync_status = str(sync_result.get("status", "partial"))
            if sync_status not in {"complete", "partial"}:
                fail(502, "sync_failed", "The latest official NSE daily sync did not complete; the AI review was not sent.")
            record.update({
                "sync_status": sync_status,
                "sync_message": str(sync_result.get("message", "NSE daily sync finished.")),
                "sync_target_day": _day(sync_result.get("target_trading_day")),
                "latest_trading_day": _day(sync_result.get("latest_trading_day")),
                "synced_days": int(sync_result.get("synced_days", 0)),
                "skipped_days": int(sync_result.get("skipped_days", 0)),
            })
            artifacts.save(REVIEW_ATTEMPT_ARTIFACT_KIND, attempt_id, record)

            try:
                analysis = StockResearchService(market_cache, artifacts).run(
                    symbol,
                    str(previous.get("company_name") or "") or None,
                )
            except Exception:
                fail(502, "analysis_failed", "The analysis could not be rebuilt from the refreshed NSE cache.")
            record.update({
                "source_run_id": analysis.get("run_id"),
                "data_as_of": analysis.get("data_as_of"),
                "data_hash": analysis.get("data_hash"),
            })
            if analysis.get("run_status") != "completed":
                fail(422, "analysis_incomplete", str(analysis.get("message", "The refreshed analysis is incomplete.")))

            model = model_name()
            record["model"] = model
            data_hash = str(analysis.get("data_hash") or "")
            if not data_hash:
                fail(422, "analysis_incomplete", "The refreshed analysis has no data fingerprint; the AI review was not sent.")
            cache_key = (
                f"{REVIEW_VERSION}:{model}:{symbol}:{data_hash}:age{analysis.get('data_age_days')}"
            )
            cached = artifacts.get(REVIEW_CACHE_KIND, cache_key)
            try:
                if cached is not None:
                    result = TradingAgentsReviewContent.model_validate(cached).model_dump()
                    record["cache_hit"] = True
                    record["reviewed_at"] = cached.get("reviewed_at")
                else:
                    record["reviewed_at"] = datetime.now(UTC).isoformat()
                    result = TradingAgentsReviewContent.model_validate(
                        review_stock_analysis(analysis)
                    ).model_dump()
                    artifacts.save(REVIEW_CACHE_KIND, cache_key, {
                        **result,
                        "reviewed_at": record["reviewed_at"],
                        "source_run_id": record["source_run_id"],
                        "data_hash": data_hash,
                    })
            except TradingAgentsUnavailableError as exc:
                fail(503, "review_unavailable", str(exc))
            except TradingAgentsReviewError as exc:
                fail(502, "review_failed", str(exc))
            except ValueError:
                fail(422, "analysis_incomplete", "The refreshed analysis could not be used for an AI review.")

            record.update({
                **result,
                "status": "completed",
                "finished_at": datetime.now(UTC).isoformat(),
                "error": None,
            })
            artifacts.save(REVIEW_ATTEMPT_ARTIFACT_KIND, attempt_id, record)
            return TradingAgentsResponse.model_validate({**record, "analysis": analysis})
        finally:
            review_lock.release()

    return router
