"""Versioned API routes."""

from __future__ import annotations

import csv
import io
from dataclasses import asdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any, cast
from uuid import uuid4

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Response, status

from quant_research.api.schemas import (
    CacheStatusResponse,
    CatalogueRefreshResponse,
    CustomBacktestRequest,
    DataInventoryItem,
    HealthResponse,
    HypothesisRequest,
    InstrumentResponse,
    MarketAvailabilityResponse,
    MarketDataResponse,
    MlExperimentRequest,
    NseImportCoverageItem,
    NseImportJobResponse,
    NseImportPreviewResponse,
    NseImportRequest,
    NseImportStatusResponse,
    PatternStrategyRequest,
    ProviderStatus,
    ReplayOrderRequest,
    ReplaySessionRequest,
    ReplayStepRequest,
    ResearchDataEnsureRequest,
    RobustnessAnalysisRequest,
    SmaBacktestRequest,
    YouTubeStrategyRequest,
)
from quant_research.data_providers.base import MarketDataProviderError
from quant_research.domain.backtesting.models import BacktestResult
from quant_research.domain.backtesting.vector_engine import run_rule_backtest
from quant_research.domain.data.models import OHLCVBar
from quant_research.domain.robustness.diagnostics import analyze_robustness
from quant_research.domain.utils.hashing import calculate_value_hash
from quant_research.domain.validity.auditor import audit_validity
from quant_research.llm.ollama import OllamaError
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.hypotheses import HypothesisAnalysis, HypothesisCommand, HypothesisService
from quant_research.services.ml_research import MlExperimentCommand, MlResearchService, ModelName
from quant_research.services.nifty500_catalogue import Nifty500CatalogueError, Nifty500CatalogueImporter
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
    nifty500_catalogue: Nifty500CatalogueImporter | None = None,
    artifacts: SqliteArtifactStore | None = None,
    ml_research: MlResearchService | None = None,
) -> APIRouter:
    """Build routes bound to one fully configured application service."""
    router = APIRouter(prefix="/api/v1")
    import_jobs: dict[str, dict[str, Any]] = {}

    def save_import_job(job_id: str, payload: dict[str, Any]) -> None:
        import_jobs[job_id] = payload
        if artifacts is not None:
            artifacts.save("import_job", job_id, payload)

    def get_import_job(job_id: str) -> dict[str, Any] | None:
        return import_jobs.get(job_id) or (artifacts.get("import_job", job_id) if artifacts is not None else None)

    def selected_symbols(payload: NseImportRequest) -> list[str]:
        if payload.preset == "custom":
            return payload.symbols
        if payload.preset == "nse_equities":
            if market_cache is None:
                return []
            return market_cache.universe_symbols("nse_equities")
        return sorted(set(SENSEX_NSE_STARTER + BANKING_STARTER + SECTOR_ETF_STARTER))

    def weekday_count(start: date, end: date) -> int:
        return sum(1 for offset in range((end - start).days + 1) if (start + timedelta(days=offset)).weekday() < 5)

    def run_import(job_id: str, symbols: list[str], payload: NseImportRequest) -> None:
        if nse_importer is None:
            save_import_job(job_id, {"status": "failed", "message": "NSE importer is not configured."})
            return
        try:
            def progress(stage: str, completed_days: int, total_days: int) -> None:
                save_import_job(job_id, {
                    **(get_import_job(job_id) or {}),
                    "status": "running",
                    "stage": stage,
                    "completed_days": completed_days,
                    "total_days": total_days,
                    "message": f"{stage} ({completed_days}/{total_days} trading days).",
                })

            save_import_job(job_id, {**(get_import_job(job_id) or {}), "status": "running", "stage": "Preparing import", "message": "Validating local NSE cache."})
            result = nse_importer.import_daily_universe(symbols, payload.start, payload.end, progress=progress)
            summary = (
                f"Import finished: {result.downloaded_days} archives downloaded, "
                f"{result.reused_archive_days} saved archives reused, "
                f"{result.already_available_days} archive-days already complete, "
                f"{result.skipped_days} archive-days skipped, "
                f"{result.stored_bars} candles stored, and {result.archive_rows} raw rows saved."
            )
            if result.skipped_days:
                summary += " No official NSE archive was available for the skipped dates."
            save_import_job(job_id, {**(get_import_job(job_id) or {}), "status": "complete", "stage": "Complete", "message": summary, **asdict(result)})
        except RuntimeError as exc:
            save_import_job(job_id, {**(get_import_job(job_id) or {}), "status": "failed", "stage": "Import failed", "message": str(exc)})

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
                name="local_nse_cache",
                configured=True,
                live_feed=False,
                notes="Locally cached official NSE daily OHLCV for research backtests; no paid account, API key, or order execution is required.",
            ),
        ]

    @router.get("/data/cache", response_model=CacheStatusResponse, tags=["market data"])
    def cache_status() -> CacheStatusResponse:
        if market_cache is None:
            return CacheStatusResponse(symbols=0, bars=0, earliest=None, latest=None)
        return CacheStatusResponse(**asdict(market_cache.summary()))

    @router.get("/data/availability", response_model=MarketAvailabilityResponse, tags=["market data"])
    def data_availability(symbol: Annotated[str, Query(min_length=1, max_length=50)]) -> MarketAvailabilityResponse:
        if market_cache is None:
            return MarketAvailabilityResponse(symbol=symbol.upper(), timeframe="1day", bars=0, earliest=None, latest=None, latest_close=None)
        return MarketAvailabilityResponse(**asdict(market_cache.market_availability(symbol, "1day")))

    @router.get("/data/instruments", response_model=list[InstrumentResponse], tags=["market data"])
    def instruments(query: str = "", limit: int = Query(default=50, ge=1, le=100)) -> list[InstrumentResponse]:
        if market_cache is None:
            return []
        return [InstrumentResponse(**asdict(item)) for item in market_cache.search_instruments(query=query, limit=limit)]

    @router.get("/data/inventory", response_model=list[DataInventoryItem], tags=["market data"])
    def data_inventory(
        query: str = "",
        start: date | None = None,
        end: date | None = None,
        limit: int = Query(default=200, ge=1, le=500),
    ) -> list[DataInventoryItem]:
        """Show catalogue symbols together with their exact local history coverage."""
        if market_cache is None:
            return []
        catalogue = market_cache.search_instruments(query=query, limit=limit)
        metadata = {item.symbol: item for item in catalogue}
        symbols = list(metadata)
        for stored_symbol in market_cache.stored_symbols(query=query, limit=limit):
            if stored_symbol not in metadata:
                symbols.append(stored_symbol)
        symbols = symbols[:limit]
        coverage = {item.symbol: item for item in market_cache.coverage(symbols, "1day")}
        requested_days = weekday_count(start, end) if start and end and start <= end else 0
        cached_days = market_cache.coverage_days(symbols, "1day", start, end) if start and end and start <= end else {}
        return [
            DataInventoryItem(
                symbol=symbol,
                company_name=metadata[symbol].company_name if symbol in metadata else None,
                industry=metadata[symbol].industry if symbol in metadata else None,
                bars=coverage[symbol].bars,
                earliest=coverage[symbol].earliest,
                latest=coverage[symbol].latest,
                cached_days=cached_days.get(symbol, 0),
                requested_days=requested_days,
                missing_days=max(0, requested_days - cached_days.get(symbol, 0)),
                fully_available=requested_days > 0 and cached_days.get(symbol, 0) >= requested_days,
            )
            for symbol in symbols
        ]

    @router.get("/data/instruments/export", tags=["market data"])
    def export_instruments() -> Response:
        if market_cache is None:
            instruments = []
        else:
            instruments = market_cache.search_instruments(query="", limit=10_000)
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["Symbol", "Company Name", "Industry", "Series", "ISIN"])
        writer.writerows([[item.symbol, item.company_name, item.industry or "", item.series or "", item.isin or ""] for item in instruments])
        return Response(
            content=stream.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=nse_equity_catalogue.csv"},
        )

    @router.post("/data/instruments/refresh", response_model=CatalogueRefreshResponse, tags=["market data"])
    def refresh_nse_equity_catalogue() -> CatalogueRefreshResponse:
        if nifty500_catalogue is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="NSE equity catalogue importer is not configured.")
        try:
            return CatalogueRefreshResponse(**asdict(nifty500_catalogue.refresh()))
        except Nifty500CatalogueError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    # Backwards-compatible endpoint for saved clients. It now refreshes the
    # complete NSE equity catalogue instead of an index-only universe.
    @router.post("/data/nifty500/refresh", response_model=CatalogueRefreshResponse, tags=["market data"], deprecated=True)
    def refresh_nifty500_catalogue() -> CatalogueRefreshResponse:
        return refresh_nse_equity_catalogue()

    @router.post("/data/nse-import", response_model=NseImportJobResponse, status_code=status.HTTP_202_ACCEPTED, tags=["market data"])
    def start_nse_import(payload: NseImportRequest, background_tasks: BackgroundTasks) -> NseImportJobResponse:
        if payload.start > payload.end:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="start must be on or before end.")
        symbols = selected_symbols(payload)
        if not symbols:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Choose at least one symbol.")
        if weekday_count(payload.start, payload.end) == 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Choose a date range containing at least one weekday.")
        if market_cache is not None:
            total_days = weekday_count(payload.start, payload.end)
            day_counts = market_cache.coverage_days(symbols, "1day", payload.start, payload.end)
            if total_days > 0 and day_counts and all(count >= total_days for count in day_counts.values()):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This date range is already available locally for every selected symbol. Choose a newer or missing period instead.",
                )
        job_id = f"nse_{uuid4().hex[:10]}"
        save_import_job(job_id, {"status": "queued", "stage": "Queued", "message": "Official NSE import has been queued."})
        background_tasks.add_task(run_import, job_id, symbols, payload)
        return NseImportJobResponse(job_id=job_id, status="queued", symbols=len(symbols))

    @router.post("/research/ensure-data", response_model=NseImportJobResponse, status_code=status.HTTP_202_ACCEPTED, tags=["research"])
    def ensure_research_data(payload: ResearchDataEnsureRequest, background_tasks: BackgroundTasks) -> NseImportJobResponse:
        """Ensure one symbol has a year of warm-up history through today before backtesting."""
        if nse_importer is None or market_cache is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="The local NSE importer is not configured.")
        today = date.today()
        if payload.start > today:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="The requested start date cannot be in the future.")
        source_start = payload.start - timedelta(days=365)
        symbol = payload.symbol.strip().upper().removesuffix(".NS")
        job_id = f"research_nse_{uuid4().hex[:10]}"
        save_import_job(job_id, {
            "status": "queued",
            "stage": "Queued",
            "message": "Preparing one year of warm-up history and all missing data through today.",
        })
        background_tasks.add_task(
            run_import,
            job_id,
            [symbol],
            NseImportRequest(start=source_start, end=today, preset="custom", symbols=[symbol]),
        )
        return NseImportJobResponse(job_id=job_id, status="queued", symbols=1, source_start=source_start, source_end=today)

    @router.post("/data/nse-import/preview", response_model=NseImportPreviewResponse, tags=["market data"])
    def preview_nse_import(payload: NseImportRequest) -> NseImportPreviewResponse:
        if payload.start > payload.end:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="start must be on or before end.")
        symbols = selected_symbols(payload)
        if not symbols:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Choose at least one symbol.")
        if weekday_count(payload.start, payload.end) == 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Choose a date range containing at least one weekday.")
        total_days = weekday_count(payload.start, payload.end)
        coverage = market_cache.coverage(symbols, "1day") if market_cache is not None else []
        day_counts = market_cache.coverage_days(symbols, "1day", payload.start, payload.end) if market_cache is not None else {}
        range_bars = market_cache.bars_in_range(symbols, "1day", payload.start, payload.end) if market_cache is not None else {}
        items = [
            NseImportCoverageItem(
                symbol=item.symbol,
                bars=range_bars.get(item.symbol, 0),
                earliest=item.earliest,
                latest=item.latest,
                cached_days=day_counts.get(item.symbol, 0),
                missing_days=max(0, total_days - day_counts.get(item.symbol, 0)),
                total_days=total_days,
                fully_available=total_days == 0 or day_counts.get(item.symbol, 0) >= total_days,
            )
            for item in coverage
        ]
        complete = bool(items) and all(item.fully_available for item in items)
        complete_symbols = sum(1 for item in items if item.fully_available)
        missing_symbols = len(items) - complete_symbols
        partial_symbols = sum(1 for item in items if item.cached_days > 0 and not item.fully_available)
        cached_bars = sum(item.bars for item in items)
        cached_days = sum(item.cached_days for item in items)
        missing_days = sum(item.missing_days for item in items)
        return NseImportPreviewResponse(
            requested_symbols=len(symbols),
            complete_symbols=complete_symbols,
            partial_symbols=partial_symbols,
            missing_symbols=missing_symbols,
            cached_bars=cached_bars,
            estimated_missing_bars=missing_days,
            cached_trading_days=cached_days,
            missing_trading_days=missing_days,
            total_trading_days=total_days,
            fully_available=complete,
            message=(
                f"{complete_symbols} symbols are complete; {missing_symbols} need data. "
                f"Estimated {missing_days} symbol-days remain. Cached bars are never duplicated."
                if complete
                else f"{complete_symbols} symbols are complete; {missing_symbols} need data. "
                f"Estimated {missing_days} symbol-days will be checked and only missing NSE archives imported."
            ),
            coverage=items,
        )

    @router.get("/data/nse-import/{job_id}", response_model=NseImportStatusResponse, tags=["market data"])
    def nse_import_status(job_id: str) -> NseImportStatusResponse:
        current = get_import_job(job_id)
        if current is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import job was not found.")
        return NseImportStatusResponse(job_id=job_id, **current)

    @router.post("/research/hypothesis", response_model=HypothesisAnalysis, tags=["research"])
    def analyse_hypothesis(payload: HypothesisRequest) -> HypothesisAnalysis:
        cache_key = calculate_value_hash({"model": hypotheses.model, **payload.model_dump(mode="json")})
        if artifacts is not None:
            cached = artifacts.get("hypothesis", cache_key)
            if cached is not None:
                return HypothesisAnalysis.model_validate(cached)
        try:
            result = hypotheses.analyse(
                HypothesisCommand(
                    hypothesis=payload.hypothesis,
                    symbol=payload.symbol,
                    timeframe=payload.timeframe,
                    strategy_id=payload.strategy_id,
                )
            )
            if artifacts is not None:
                artifacts.save("hypothesis", cache_key, result.model_dump(mode="json"))
            return result
        except OllamaError as exc:
            # Ollama is an optional local assistant. Keep the research workflow
            # usable when it is cold, stopped, or missing a model; the response
            # is explicitly labelled as a deterministic fallback and is not
            # cached, so a later retry can use Ollama once it is healthy.
            return hypotheses.curated_fallback(
                HypothesisCommand(
                    hypothesis=payload.hypothesis,
                    symbol=payload.symbol,
                    timeframe=payload.timeframe,
                    strategy_id=payload.strategy_id,
                ),
                reason=str(exc),
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.post("/strategy/youtube", tags=["research"])
    def youtube_strategy(payload: YouTubeStrategyRequest) -> dict[str, object]:
        cache_key = calculate_value_hash({"url": payload.url.strip(), "transcript": payload.transcript or ""})
        if artifacts is not None:
            cached = artifacts.get("youtube_strategy", cache_key)
            if cached is not None:
                return cached
        try:
            result = asdict(extract_strategy(payload.url, payload.transcript))
            if artifacts is not None:
                artifacts.save("youtube_strategy", cache_key, result)
            return result
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.post("/ml/experiments", tags=["machine learning"])
    def run_ml_experiment(payload: MlExperimentRequest) -> dict[str, object]:
        if ml_research is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="The ML research service is not configured.")
        try:
            return ml_research.run(
                MlExperimentCommand(
                    symbol=payload.symbol,
                    timeframe=payload.timeframe,
                    start=payload.start,
                    end=payload.end,
                    horizon_days=payload.horizon_days,
                    train_ratio=payload.train_ratio,
                    validation_ratio=payload.validation_ratio,
                    test_ratio=payload.test_ratio,
                    models=cast(tuple[ModelName, ...], tuple(payload.models)),
                    commission_pct=payload.commission_pct,
                    slippage_pct=payload.slippage_pct,
                )
            )
        except (MarketDataUnavailableError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.get("/ml/experiments", tags=["machine learning"])
    def list_ml_experiments(limit: Annotated[int, Query(ge=1, le=100)] = 25) -> list[dict[str, Any]]:
        if ml_research is None:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="The ML research service is not configured.")
        return ml_research.list(limit)

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
        frame = market_frame(payload.symbol, payload.timeframe, payload.start, payload.end)
        cache_key = calculate_value_hash({"kind": "custom_backtest", **payload.model_dump(mode="json"), "data": frame.to_dict("records")})
        if artifacts is not None:
            cached = artifacts.get("custom_backtest", cache_key)
            if cached is not None:
                return cached
        res = run_rule_backtest(
            df=frame,
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            strategy_id=payload.strategy_id,
            rsi_period=payload.rsi_period,
            rsi_oversold=payload.rsi_oversold,
            rsi_overbought=payload.rsi_overbought,
            fast_ema=payload.fast_ema,
            slow_ema=payload.slow_ema,
            initial_capital=payload.initial_capital,
            commission_pct=payload.commission_pct,
            slippage_pct=payload.slippage_pct,
            stop_loss_pct=payload.stop_loss_pct,
            take_profit_pct=payload.take_profit_pct,
            position_size_pct=payload.position_size_pct,
            position_size_amount=payload.position_size_amount,
        )
        result = asdict(res)
        if artifacts is not None:
            artifacts.save("custom_backtest", cache_key, result)
        return result

    @router.post(
        "/robustness/analyze",
        tags=["robustness"],
    )
    def analyze_strategy_robustness(payload: RobustnessAnalysisRequest) -> dict[str, object]:
        """Analyze parameter sensitivity 2D heatmap, Monte Carlo return distributions, and stress tests."""
        frame = market_frame(payload.symbol, payload.timeframe, payload.start, payload.end)
        cache_key = calculate_value_hash({"kind": "robustness", **payload.model_dump(mode="json"), "data": frame.to_dict("records")})
        if artifacts is not None:
            cached = artifacts.get("robustness", cache_key)
            if cached is not None:
                return cached
        report = analyze_robustness(
            df=frame,
            symbol=payload.symbol,
            lookback_range=payload.lookback_range,
            threshold_range=payload.threshold_range,
        )
        result = asdict(report)
        if artifacts is not None:
            artifacts.save("robustness", cache_key, result)
        return result

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

    @router.delete("/backtests", tags=["backtests"])
    def clear_backtests() -> dict[str, object]:
        """Delete saved backtest runs only; market data is untouched."""
        return {"deleted_runs": research.clear_backtests(), "message": "Saved backtest runs cleared. Market data was preserved."}

    @router.delete("/testing-history", tags=["research"])
    def clear_testing_history() -> dict[str, object]:
        """Delete saved tests and analysis artifacts without deleting market data."""
        deleted_runs = research.clear_backtests()
        deleted_artifacts = artifacts.clear_kinds(("custom_backtest", "hypothesis", "robustness", "youtube_strategy", "replay_session")) if artifacts is not None else 0
        return {
            "deleted_runs": deleted_runs,
            "deleted_artifacts": deleted_artifacts,
            "message": "Testing history cleared. NSE market data, instruments, archives, and import coverage were preserved.",
        }

    @router.get("/backtests/{run_id}", response_model=BacktestResult, tags=["backtests"])
    def get_backtest(run_id: str) -> BacktestResult:
        result = research.get_backtest(run_id)
        if result is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest run was not found.")
        return result

    @router.delete("/backtests/{run_id}", tags=["backtests"])
    def delete_backtest(run_id: str) -> Response:
        if not research.delete_backtest(run_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest run was not found.")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @router.get("/research/artifacts/{kind}", tags=["research"])
    def list_saved_artifacts(kind: str, limit: int = Query(default=100, ge=1, le=500)) -> list[dict[str, Any]]:
        """Return saved computed artifacts so clients can reopen prior work."""
        if artifacts is None or kind not in {"custom_backtest", "robustness", "hypothesis"}:
            return []
        return artifacts.list_with_metadata(kind, limit=limit)

    @router.delete("/research/artifacts/{kind}/{artifact_key}", tags=["research"])
    def delete_saved_artifact(kind: str, artifact_key: str) -> Response:
        if artifacts is None or kind not in {"custom_backtest", "robustness", "hypothesis", "youtube_strategy", "replay_session"}:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved testing artifact was not found.")
        if not artifacts.delete(kind, artifact_key):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Saved testing artifact was not found.")
        return Response(status_code=status.HTTP_204_NO_CONTENT)

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
                store=artifacts,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc

    @router.get("/replay/sessions/{session_id}", tags=["replay"])
    def get_replay_session(session_id: str) -> dict[str, object]:
        """Fetch current Replay session state and revealed bars."""
        from quant_research.services.replay import get_session

        session = get_session(session_id, store=artifacts)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found.")
        return session

    @router.post("/replay/sessions/{session_id}/step", tags=["replay"])
    def step_replay_session(session_id: str, payload: ReplayStepRequest) -> dict[str, object]:
        """Advance the replay cursor by 1 or more historical candles."""
        from quant_research.services.replay import step_session

        session = step_session(session_id, steps=payload.steps, store=artifacts)
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
            store=artifacts,
        )
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found or already finished.")
        return session

    @router.post("/replay/sessions/{session_id}/orders/{order_id}/close", tags=["replay"])
    def close_replay_order(session_id: str, order_id: str) -> dict[str, object]:
        """Close an open position at the current replay candle price."""
        from quant_research.services.replay import close_order

        session = close_order(session_id, order_id, store=artifacts)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session or order not found.")
        return session

    @router.post("/replay/sessions/{session_id}/finish", tags=["replay"])
    def finish_replay_session(session_id: str) -> dict[str, object]:
        """Conclude the replay session and calculate final performance metrics."""
        from quant_research.services.replay import finish_session

        session = finish_session(session_id, store=artifacts)
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found.")
        return session

    @router.post("/pattern-finder/test", tags=["pattern-finder"])
    def test_pattern_strategy(payload: PatternStrategyRequest) -> dict[str, Any]:
        """Run pattern finder historical trade scan with true vs false positive breakdown."""
        from quant_research.services.pattern_strategy import analyze_symbol_pattern

        db_path = market_cache.path if market_cache is not None else Path("data/market_cache.sqlite3")
        try:
            return analyze_symbol_pattern(
                db_path=db_path,
                symbol=payload.symbol,
                target_gain_pct=payload.target_gain_pct,
                rvol_threshold=payload.rvol_threshold,
                dist_52w_pct=payload.dist_52w_pct,
                hold_days=payload.hold_days,
            )
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return router
