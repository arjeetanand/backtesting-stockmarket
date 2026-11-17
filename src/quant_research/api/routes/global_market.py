"""Explicitly requested paid web-search briefs and local saved history."""

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.services.global_market_brief import (
    GlobalMarketBriefError,
    GlobalMarketUnavailableError,
    create_brief,
    saved_briefs,
)


class GlobalMarketRequest(BaseModel):
    topic: Literal["global", "equities", "rates", "commodities"] = "global"
    symbol: str | None = Field(default=None, min_length=1, max_length=40, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9&._-]*$")


def create_global_market_router(artifacts: SqliteArtifactStore) -> APIRouter:
    router = APIRouter(prefix="/api/v1/global-market", tags=["research"])

    @router.get("/briefs")
    def history(topic: str = Query(default="global", max_length=20), symbol: str | None = Query(default=None, max_length=40)) -> dict[str, Any]:
        try:
            return {"briefs": saved_briefs(artifacts, topic, symbol)}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    @router.post("/briefs")
    def generate(payload: GlobalMarketRequest) -> dict[str, Any]:
        try:
            return create_brief(artifacts, payload.topic, payload.symbol)
        except GlobalMarketUnavailableError as exc:
            raise HTTPException(503, str(exc)) from None
        except GlobalMarketBriefError as exc:
            raise HTTPException(502, str(exc)) from None
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None

    return router
