"""Local portfolio-file preview and user-confirmed snapshot routes."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from quant_research.api.schemas import MarketDataSyncResponse
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.portfolio_import import (
    PORTFOLIO_SNAPSHOT_KIND,
    PortfolioImportError,
    analyze_portfolio_snapshot,
    decode_upload,
    list_portfolio_snapshots,
    normalize_symbol,
    preview_portfolio_file,
    save_portfolio_snapshot,
)

MAX_REQUEST_BYTES = 14_000_000


class ImportPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str = Field(min_length=1, max_length=255)
    content_type: str | None = Field(default=None, max_length=100)
    data_base64: str = Field(min_length=1)


class HoldingPreview(BaseModel):
    symbol: str
    quantity: str
    average_price: str
    source_row: str | None = None


class PortfolioPreviewResponse(BaseModel):
    source_format: Literal["xlsx", "pdf", "image"]
    holdings: list[HoldingPreview]
    warnings: list[str]


class PortfolioHoldingInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    symbol: str = Field(min_length=1, max_length=32)
    quantity: Decimal
    average_price: Decimal

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        return normalize_symbol(value)

    @field_validator("quantity", "average_price")
    @classmethod
    def validate_positive_amount(cls, value: Decimal) -> Decimal:
        if not value.is_finite() or value <= 0:
            raise ValueError("Enter a positive, finite number.")
        return value


class SavePortfolioSnapshotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_format: Literal["xlsx", "pdf", "image", "manual"]
    holdings: list[PortfolioHoldingInput] = Field(min_length=1, max_length=500)


class PortfolioSnapshotResponse(BaseModel):
    snapshot_id: str
    created_at: str
    source_format: Literal["xlsx", "pdf", "image", "manual"]
    holdings: list[dict[str, str]]
    total_positions: int
    total_shares: str
    total_cost_basis: str


class PortfolioSnapshotListResponse(BaseModel):
    snapshots: list[PortfolioSnapshotResponse]


class PortfolioRuleAssessment(BaseModel):
    status: Literal["insufficient_history", "stale_data", "triggered", "watch", "no_long_setup"]
    data_as_of: str | None
    history_bars: int
    data_age_days: int | None
    entry_trigger: str | None
    stop_loss: str | None
    target_1r: str | None
    target_2r: str | None
    risk_per_share: str | None
    reasons: list[str]
    level_note: str
    historical_gate_status: Literal["not_evaluated"]


class PortfolioAnalysisPosition(BaseModel):
    symbol: str
    quantity: str
    average_price: str
    cost_basis: str
    latest_close: str | None
    market_value: str | None
    market_value_weight_pct: str | None
    unrealized_pnl: str | None
    unrealized_pnl_pct: str | None
    data_as_of: str | None
    data_age_days: int | None
    freshness: Literal["fresh", "stale", "missing"]
    indicators: dict[str, str | int | None]
    observations: list[str]
    rule_assessment: PortfolioRuleAssessment


class PortfolioAnalysisResponse(BaseModel):
    snapshot_id: str
    analyzed_at: str
    data_source: str
    price_basis: str
    data_as_of: str | None
    totals: dict[str, str | int]
    review_priorities: list[str]
    positions: list[PortfolioAnalysisPosition]
    market_sync: MarketDataSyncResponse | None = None


def create_portfolio_router(
    artifacts: SqliteArtifactStore,
    cache: SqliteMarketCache | None = None,
) -> APIRouter:
    router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])

    @router.post("/import/preview", response_model=PortfolioPreviewResponse)
    async def preview_upload(request: Request) -> PortfolioPreviewResponse:
        raw_request = await _read_bounded_body(request)
        try:
            upload = ImportPreviewRequest.model_validate_json(raw_request)
        except ValidationError:
            raise HTTPException(status_code=422, detail="Upload metadata is invalid.") from None
        try:
            file_format, file_bytes = decode_upload(upload.filename, upload.content_type, upload.data_base64)
            result = preview_portfolio_file(file_format, file_bytes)
        except PortfolioImportError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
        return PortfolioPreviewResponse.model_validate(result)

    @router.post(
        "/snapshots",
        response_model=PortfolioSnapshotResponse,
        status_code=status.HTTP_201_CREATED,
    )
    def save_snapshot(payload: SavePortfolioSnapshotRequest) -> PortfolioSnapshotResponse:
        try:
            snapshot = save_portfolio_snapshot(
                artifacts,
                payload.source_format,
                [holding.model_dump(mode="python") for holding in payload.holdings],
            )
        except PortfolioImportError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
        return PortfolioSnapshotResponse.model_validate(snapshot)

    @router.get("/snapshots", response_model=PortfolioSnapshotListResponse)
    def snapshots(limit: int = Query(default=20, ge=1, le=50)) -> PortfolioSnapshotListResponse:
        items = list_portfolio_snapshots(artifacts, limit)
        return PortfolioSnapshotListResponse(
            snapshots=[PortfolioSnapshotResponse.model_validate(item) for item in items]
        )

    @router.get("/snapshots/{snapshot_id}/analysis", response_model=PortfolioAnalysisResponse)
    def analyze_snapshot(snapshot_id: str) -> PortfolioAnalysisResponse:
        if cache is None:
            raise HTTPException(status_code=503, detail="Local daily market data is not available.")
        snapshot = artifacts.get(PORTFOLIO_SNAPSHOT_KIND, snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="Portfolio snapshot not found.")
        from quant_research.services.daily_sync import sync_latest_for_analysis

        market_sync = sync_latest_for_analysis(cache)
        try:
            analysis = analyze_portfolio_snapshot(cache, snapshot, market_sync=market_sync)
        except PortfolioImportError as exc:
            raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
        return PortfolioAnalysisResponse.model_validate(analysis)

    return router


async def _read_bounded_body(request: Request) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                raise HTTPException(status_code=413, detail="This upload is larger than the 10 MB file limit.")
        except ValueError:
            raise HTTPException(status_code=400, detail="Upload length is invalid.") from None
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="This upload is larger than the 10 MB file limit.")
        body.extend(chunk)
    return bytes(body)
