"""Versioned API routes."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from typing import Annotated, Any
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status

from quant_research.api.schemas import (
    CacheStatusResponse,
    CustomBacktestRequest,
    HealthResponse,
    HypothesisRequest,
    MarketDataResponse,
    NseImportJobResponse,
    NseImportRequest,
    NseImportStatusResponse,
    ProviderStatus,
    ReplayOrderRequest,
    ReplaySessionRequest,
    ReplayStepRequest,
    RobustnessAnalysisRequest,
    SmaBacktestRequest,
    YouTubeStrategyRequest,
)
from quant_research.data_providers.base import MarketDataProviderError
from quant_research.domain.backtesting.models import BacktestResult
from quant_research.domain.backtesting.vector_engine import run_rule_backtest
from quant_research.domain.data.models import OHLCVBar
from quant_research.domain.robustness.diagnostics import analyze_robustness
from quant_research.domain.validity.auditor import audit_validity
from quant_research.llm.ollama import OllamaError
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.hypotheses import HypothesisAnalysis, HypothesisCommand, HypothesisService
from quant_research.services.nse_import import (
    BANKING_STARTER,
    SECTOR_ETF_STARTER,
    SENSEX_NSE_STARTER,
    NseBhavcopyImporter,
)
from quant_research.services.research import (
    MarketDataUnavailableError,
    ResearchService,
    ResearchServiceError,
    SmaBacktestCommand,
)
from quant_research.services.youtube_strategy import extract_strategy


def create_api_router(
    research: ResearchService,
    hypotheses: HypothesisService,
    nse_importer: NseBhavcopyImporter | None = None,
    market_cache: SqliteMarketCache | None = None,
) -> APIRouter:
    """Build routes bound to one fully configured application service."""
    router = APIRouter(prefix="/api/v1")
    import_jobs: dict[str, dict[str, Any]] = {}

    def selected_symbols(payload: NseImportRequest) -> list[str]:
        if payload.preset == "custom":
            return payload.symbols
        return sorted(set(SENSEX_NSE_STARTER + BANKING_STARTER + SECTOR_ETF_STARTER))

    def run_import(job_id: str, symbols: list[str], payload: NseImportRequest) -> None:
        if nse_importer is None:
            import_jobs[job_id] = {"status": "failed", "message": "NSE importer is not configured."}
            return
        try:
            result = nse_importer.import_daily_universe(symbols, payload.start, payload.end)
            import_jobs[job_id] = {"status": "complete", "message": "Official NSE import completed.", **asdict(result)}
        except RuntimeError as exc:
            import_jobs[job_id] = {"status": "failed", "message": str(exc)}

    def market_frame(symbol: str, timeframe: str, start: datetime, end: datetime) -> pd.DataFrame:
        return pd.DataFrame([bar.model_dump() for bar in market_bars(symbol, timeframe, start, end)]).rename(
            columns={"timestamp": "date"}
        )

    def market_bars(symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        try:
            result = research.get_market_data(symbol, timeframe, start, end)
        except MarketDataUnavailableError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        except MarketDataProviderError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        except ResearchServiceError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
        return result.bars

    @router.get("/health", response_model=HealthResponse, tags=["system"])
    def health() -> HealthResponse:
        return HealthResponse(
            status="ok",
            market_data_provider=research.provider_name,
            market_data_configured=research.market_data_configured,
            llm_provider="ollama",
            llm_model=hypotheses.model,
            active_provider=research.provider_name,
            historical_data_key_required=False,
        )

    @router.get("/providers", response_model=list[ProviderStatus], tags=["system"])
    def providers() -> list[ProviderStatus]:
        return [
            ProviderStatus(
                name="yahoo_finance",
                configured=True,
                live_feed=False,
                notes="Keyless historical OHLCV for research backtests; no paid account or API key is required.",
            ),
        ]

    @router.get("/data/cache", response_model=CacheStatusResponse, tags=["market data"])
    def cache_status() -> CacheStatusResponse:
        if market_cache is None:
            return CacheStatusResponse(symbols=0, bars=0, earliest=None, latest=None)
        return CacheStatusResponse(**asdict(market_cache.summary()))

    @router.post("/data/nse-import", response_model=NseImportJobResponse, status_code=status.HTTP_202_ACCEPTED, tags=["market data"])
    def start_nse_import(payload: NseImportRequest, background_tasks: BackgroundTasks) -> NseImportJobResponse:
        if payload.start > payload.end:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="start must be on or before end.")
        symbols = selected_symbols(payload)
        if not symbols:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Choose at least one symbol.")
        job_id = f"nse_{uuid4().hex[:10]}"
        import_jobs[job_id] = {"status": "queued", "message": "Official NSE import has been queued."}
        background_tasks.add_task(run_import, job_id, symbols, payload)
        return NseImportJobResponse(job_id=job_id, status="queued", symbols=len(symbols))

    @router.get("/data/nse-import/{job_id}", response_model=NseImportStatusResponse, tags=["market data"])
    def nse_import_status(job_id: str) -> NseImportStatusResponse:
        current = import_jobs.get(job_id)
        if current is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import job was not found.")
        return NseImportStatusResponse(job_id=job_id, **current)

    @router.post("/research/hypothesis", response_model=HypothesisAnalysis, tags=["research"])
    def analyse_hypothesis(payload: HypothesisRequest) -> HypothesisAnalysis:
        try:
            return hypotheses.analyse(
                HypothesisCommand(
                    hypothesis=payload.hypothesis,
                    symbol=payload.symbol,
                    timeframe=payload.timeframe,
                )
            )
        except OllamaError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.post("/strategy/youtube", tags=["research"])
    def youtube_strategy(payload: YouTubeStrategyRequest) -> dict[str, object]:
        try:
            return asdict(extract_strategy(payload.url, payload.transcript))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.get("/market-data", response_model=MarketDataResponse, tags=["market data"])
    def market_data(
        symbol: Annotated[str, Query(min_length=1, max_length=50)],
        start: datetime,
        end: datetime,
        timeframe: str = "1day",
    ) -> MarketDataResponse:
        try:
            result = research.get_market_data(symbol, timeframe, start, end)
        except MarketDataUnavailableError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        except MarketDataProviderError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        except ResearchServiceError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc
        return MarketDataResponse(
            symbol=result.symbol,
            timeframe=result.timeframe,
            bars=result.bars,
            quality=result.quality,
        )

    @router.post(
        "/backtests/sma-crossover",
        response_model=BacktestResult,
        status_code=status.HTTP_201_CREATED,
        tags=["backtests"],
    )
    def run_sma_backtest(payload: SmaBacktestRequest) -> BacktestResult:
        try:
            return research.run_sma_backtest(
                SmaBacktestCommand(
                    symbol=payload.symbol,
                    start=payload.start,
                    end=payload.end,
                    timeframe=payload.timeframe,
                    fast_window=payload.fast_window,
                    slow_window=payload.slow_window,
                    initial_capital=payload.initial_capital,
                    commission=payload.commission,
                    slippage=payload.slippage,
                )
            )
        except MarketDataUnavailableError as exc:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
        except MarketDataProviderError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
        except ResearchServiceError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.post(
        "/backtests/custom",
        status_code=status.HTTP_201_CREATED,
        tags=["backtests"],
    )
    def run_custom_backtest(payload: CustomBacktestRequest) -> dict[str, object]:
        """Execute a vectorized multi-indicator strategy backtest with strict no-lookahead execution."""
        res = run_rule_backtest(
            df=market_frame(payload.symbol, payload.timeframe, payload.start, payload.end),
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            rsi_period=payload.rsi_period,
            rsi_oversold=payload.rsi_oversold,
            rsi_overbought=payload.rsi_overbought,
            fast_ema=payload.fast_ema,
            slow_ema=payload.slow_ema,
            initial_capital=payload.initial_capital,
            commission_pct=payload.commission_pct,
            slippage_pct=payload.slippage_pct,
        )
        return asdict(res)

    @router.post(
        "/robustness/analyze",
        tags=["robustness"],
    )
    def analyze_strategy_robustness(payload: RobustnessAnalysisRequest) -> dict[str, object]:
        """Analyze parameter sensitivity 2D heatmap, Monte Carlo return distributions, and stress tests."""
        report = analyze_robustness(
            df=market_frame(payload.symbol, payload.timeframe, payload.start, payload.end),
            symbol=payload.symbol,
            lookback_range=payload.lookback_range,
            threshold_range=payload.threshold_range,
        )
        return asdict(report)

    @router.post(
        "/bias-validity/audit",
        tags=["robustness"],
    )
    def audit_strategy_bias(payload: CustomBacktestRequest) -> dict[str, object]:
        """Audit backtest execution for lookahead bias, data leakage, and overfitting risks."""
        res = run_rule_backtest(
            df=market_frame(payload.symbol, payload.timeframe, payload.start, payload.end),
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            rsi_period=payload.rsi_period,
            rsi_oversold=payload.rsi_oversold,
            rsi_overbought=payload.rsi_overbought,
            fast_ema=payload.fast_ema,
            slow_ema=payload.slow_ema,
            initial_capital=payload.initial_capital,
            commission_pct=payload.commission_pct,
            slippage_pct=payload.slippage_pct,
        )
        audit_report = audit_validity(res)
        return asdict(audit_report)

    @router.get("/backtests", response_model=list[BacktestResult], tags=["backtests"])
    def list_backtests() -> list[BacktestResult]:
        return research.list_backtests()

    @router.get("/backtests/{run_id}", response_model=BacktestResult, tags=["backtests"])
    def get_backtest(run_id: str) -> BacktestResult:
        result = research.get_backtest(run_id)
        if result is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest run was not found.")
        return result

    # ── Market Replay Engine Routes ──────────────────────────────
    @router.post("/replay/sessions", status_code=status.HTTP_201_CREATED, tags=["replay"])
    def create_replay_session(payload: ReplaySessionRequest) -> dict[str, object]:
        """Create a simulated order replay from free historical candles only."""
        from quant_research.services.replay import create_session

        historical_bars = market_bars(payload.symbol, payload.timeframe, payload.start, payload.end)
        bars = [
            {
                "date": bar.timestamp.isoformat(),
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": int(bar.volume),
            }
            for bar in historical_bars
        ]
        try:
            return create_session(
                symbol=payload.symbol.strip().upper(),
                timeframe=payload.timeframe,
                start_date=payload.start.date().isoformat(),
                end_date=payload.end.date().isoformat(),
                mode=payload.mode,
                initial_capital=payload.initial_capital,
                bars=bars,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.get("/replay/sessions/{session_id}", tags=["replay"])
    def get_replay_session(session_id: str) -> dict[str, object]:
        """Fetch current Replay session state and revealed bars."""
        from quant_research.services.replay import get_session

        session = get_session(session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found.")
        return session

    @router.post("/replay/sessions/{session_id}/step", tags=["replay"])
    def step_replay_session(session_id: str, payload: ReplayStepRequest) -> dict[str, object]:
        """Advance the replay cursor by 1 or more historical candles."""
        from quant_research.services.replay import step_session

        session = step_session(session_id, steps=payload.steps)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found or already finished.")
        return session

    @router.post("/replay/sessions/{session_id}/orders", status_code=status.HTTP_201_CREATED, tags=["replay"])
    def place_replay_order(session_id: str, payload: ReplayOrderRequest) -> dict[str, object]:
        """Place a simulated market/limit order in the active replay session."""
        from quant_research.services.replay import place_order

        session = place_order(
            session_id=session_id,
            side=payload.side,
            quantity=payload.quantity,
            order_type=payload.order_type,
            price=payload.price,
            stop_loss=payload.stop_loss,
            take_profit=payload.take_profit,
        )
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found or already finished.")
        return session

    @router.post("/replay/sessions/{session_id}/orders/{order_id}/close", tags=["replay"])
    def close_replay_order(session_id: str, order_id: str) -> dict[str, object]:
        """Close an open position at the current replay candle price."""
        from quant_research.services.replay import close_order

        session = close_order(session_id, order_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session or order not found.")
        return session

    @router.post("/replay/sessions/{session_id}/finish", tags=["replay"])
    def finish_replay_session(session_id: str) -> dict[str, object]:
        """Conclude the replay session and calculate final performance metrics."""
        from quant_research.services.replay import finish_session

        session = finish_session(session_id)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found.")
        return session

    return router
