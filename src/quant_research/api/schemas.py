"""Request and response schemas exposed by the HTTP API."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from quant_research.domain.data.models import DataQualityReport, OHLCVBar


class HealthResponse(BaseModel):
    status: str
    market_data_provider: str
    market_data_configured: bool
    llm_provider: str
    llm_model: str
    active_provider: str
    historical_data_key_required: bool


class ProviderStatus(BaseModel):
    name: str
    configured: bool
    live_feed: bool
    notes: str


class CacheStatusResponse(BaseModel):
    symbols: int
    bars: int
    earliest: datetime | None
    latest: datetime | None


class MarketAvailabilityResponse(BaseModel):
    symbol: str
    timeframe: str
    bars: int
    earliest: datetime | None
    latest: datetime | None
    latest_close: float | None


class DataInventoryItem(BaseModel):
    symbol: str
    company_name: str | None = None
    industry: str | None = None
    bars: int = 0
    earliest: datetime | None = None
    latest: datetime | None = None
    cached_days: int = 0
    requested_days: int = 0
    missing_days: int = 0
    fully_available: bool = False


class NseImportRequest(BaseModel):
    start: date
    end: date
    preset: str = Field(default="sensex_banks_sector_etfs", pattern="^(sensex_banks_sector_etfs|nse_equities|custom)$")
    symbols: list[str] = Field(default_factory=list, max_length=200)


class ResearchDataEnsureRequest(BaseModel):
    """Requested backtest period; the importer also fetches a one-year warm-up."""

    symbol: str = Field(..., min_length=1, max_length=50)
    start: date


class NseImportJobResponse(BaseModel):
    job_id: str
    status: str
    symbols: int
    source_start: date | None = None
    source_end: date | None = None


class NseImportCoverageItem(BaseModel):
    symbol: str
    bars: int
    earliest: datetime | None
    latest: datetime | None
    cached_days: int = 0
    missing_days: int = 0
    total_days: int = 0
    fully_available: bool


class NseImportPreviewResponse(BaseModel):
    requested_symbols: int
    complete_symbols: int = 0
    partial_symbols: int = 0
    missing_symbols: int = 0
    cached_bars: int = 0
    estimated_missing_bars: int = 0
    cached_trading_days: int = 0
    missing_trading_days: int = 0
    total_trading_days: int = 0
    fully_available: bool
    message: str
    coverage: list[NseImportCoverageItem]


class InstrumentResponse(BaseModel):
    symbol: str
    company_name: str
    industry: str | None
    series: str | None
    isin: str | None


class CatalogueRefreshResponse(BaseModel):
    instruments: int
    source: str


class NseImportStatusResponse(BaseModel):
    job_id: str
    status: str
    message: str
    downloaded_days: int | None = None
    skipped_days: int | None = None
    stored_bars: int | None = None
    already_available_days: int | None = None
    reused_archive_days: int | None = None
    archive_rows: int | None = None
    stage: str | None = None
    completed_days: int | None = None
    total_days: int | None = None


class FiiDiiImportRequest(BaseModel):
    start: date
    end: date
    scope: str = Field(default="combined", pattern="^(combined|nse_only)$")


class FiiDiiImportJobResponse(BaseModel):
    job_id: str
    status: str
    scope: str
    source_start: date
    source_end: date


class FiiDiiImportStatusResponse(BaseModel):
    job_id: str
    status: str
    message: str
    scope: str | None = None
    stored_rows: int | None = None
    available_start: date | None = None
    available_end: date | None = None
    stage: str | None = None


class FiiDiiRowResponse(BaseModel):
    date: date
    participant: str
    scope: str
    segment: str
    buy_value: float
    sell_value: float
    net_value: float
    source: str


class FiiDiiSummaryResponse(BaseModel):
    period: str
    label: str
    start: date
    end: date
    fii_net: float
    dii_net: float


class FiiDiiChartPoint(BaseModel):
    date: date
    label: str
    fii_net: float | None = None
    dii_net: float | None = None


class FiiDiiIndexPoint(BaseModel):
    date: date
    close: float


class FiiDiiResponse(BaseModel):
    scope: str
    segment: str
    start: date
    end: date
    rows: list[FiiDiiRowResponse]
    summaries: list[FiiDiiSummaryResponse]
    chart: list[FiiDiiChartPoint]
    nifty50: list[FiiDiiIndexPoint]
    coverage_start: date | None
    coverage_end: date | None
    coverage_days: int
    coverage_note: str | None = None
    source_url: str
    provisional: bool = True


class ScreenerFormulaParameterResponse(BaseModel):
    name: str
    type: str
    default: int | float | bool | str
    minimum: int | float | None = None
    maximum: int | float | None = None


class ScreenerFormulaResponse(BaseModel):
    formula_id: str
    name: str
    category: str
    description: str
    required_fields: list[str]
    parameters: list[ScreenerFormulaParameterResponse]
    timeframe: str
    status: str


class ScreenerCatalogResponse(BaseModel):
    schema_version: int
    as_of: date
    source: str
    data_boundary: str
    formulas: list[ScreenerFormulaResponse]


class ScreenerUniverseResponse(BaseModel):
    universe_id: str
    name: str
    exchange: str
    as_of: date
    source: str
    expected_members: int
    configured_members: int
    available_members: int
    membership_kind: str
    membership_status: str
    symbols: list[str]


class InsightStockResponse(BaseModel):
    symbol: str
    company_name: str
    sector: str
    close: float
    previous_close: float
    return_pct: float
    data_as_of: date
    bars_used: int


class InsightSectorResponse(BaseModel):
    sector: str
    stock_count: int
    available_count: int
    average_return_pct: float | None
    median_return_pct: float | None
    advancing: int
    declining: int
    unchanged: int


class InsightsResponse(BaseModel):
    universe: str
    period: str
    period_days: int
    source: str
    result_status: str
    message: str
    data_as_of: date | None
    freshness_status: str
    coverage_status: str
    requested_members: int
    available_members: int
    available_symbols: list[str]
    missing_symbols: list[str]
    advancing: int
    declining: int
    unchanged: int
    average_return_pct: float | None
    median_return_pct: float | None
    stocks: list[InsightStockResponse]
    sectors: list[InsightSectorResponse]


class ScreenerRunRequest(BaseModel):
    universe: str = Field(default="nifty50", pattern="^[a-z][a-z0-9_]*$")
    formula_id: str = Field(..., min_length=1, pattern="^[a-z][a-z0-9_]*$")
    parameters: dict[str, int | float | bool | str] = Field(default_factory=dict)
    timeframe: str = Field(default="1day", pattern="^1day$")
    as_of: date | None = None
    end: datetime | None = None


class ScreenerRunResponse(BaseModel):
    universe: str
    formula_id: str
    timeframe: str
    result_status: str
    message: str
    data_as_of: date | None
    coverage_status: str
    requested_members: int
    available_members: int
    available_symbols: list[str]
    missing_symbols: list[str]
    matches: list[dict[str, object]]


class YouTubeStrategyRequest(BaseModel):
    url: str = Field(..., min_length=12, max_length=500)
    transcript: str | None = Field(default=None, max_length=100_000)


class MarketDataResponse(BaseModel):
    symbol: str
    timeframe: str
    bars: list[OHLCVBar]
    quality: DataQualityReport


class ScenarioSimulatorRequest(BaseModel):
    """Bounded inputs for a local daily-bar scenario sample."""

    symbol: str = Field(..., min_length=1, max_length=50)
    entry_price: float | None = Field(default=None, ge=0.01, le=1_000_000_000.0, allow_inf_nan=False)
    risk_pct: float = Field(default=1.0, ge=0.01, le=25.0, allow_inf_nan=False)
    target_r: float = Field(default=2.0, ge=0.01, le=10.0, allow_inf_nan=False)
    max_hold_sessions: int = Field(default=10, ge=1, le=20)
    lookback_sessions: int = Field(default=60, ge=20, le=252)
    seed: int = Field(default=19, ge=0, le=2_147_483_647)


class ScenarioSummaryResponse(BaseModel):
    samples: int
    stop_loss: int
    target: int
    time_exit: int
    average_r: float
    median_r: float
    p05_exit_price: float
    median_exit_price: float
    p95_exit_price: float


class ScenarioSimulatorResponse(BaseModel):
    symbol: str
    as_of_date: date
    entry_price: float
    stop_price: float
    target_price: float
    risk_per_share: float
    risk_pct: float
    target_r: float
    max_hold_sessions: int
    lookback_sessions: int
    simulations: int
    seed: int
    source_sessions: int
    data_start: date
    data_end: date
    monte_carlo: ScenarioSummaryResponse
    historical_outcomes: ScenarioSummaryResponse


class SmaBacktestRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=50, examples=["AAPL"])
    start: datetime
    end: datetime
    timeframe: str = Field(default="1day", examples=["1day"])
    fast_window: int = Field(default=20, ge=2, le=500)
    slow_window: int = Field(default=50, ge=3, le=1_000)
    initial_capital: float = Field(default=100_000.0, gt=0.0)
    commission: float = Field(default=0.0, ge=0.0, le=0.1)
    slippage: float = Field(default=0.0, ge=0.0, le=0.1)


class CustomBacktestRequest(BaseModel):
    symbol: str = Field(default="NIFTY 50", min_length=1, max_length=50)
    strategy_id: str = Field(default="rsi_ema", min_length=2, max_length=50)
    start: datetime
    end: datetime
    timeframe: str = Field(default="1day")
    rsi_period: int = Field(default=14, ge=2, le=100)
    rsi_oversold: float = Field(default=30.0, ge=5.0, le=50.0)
    rsi_overbought: float = Field(default=70.0, ge=50.0, le=95.0)
    fast_ema: int = Field(default=20, ge=2, le=200)
    slow_ema: int = Field(default=50, ge=5, le=500)
    initial_capital: float = Field(default=100_000.0, gt=0.0)
    commission_pct: float = Field(default=0.001, ge=0.0, le=0.05)
    slippage_pct: float = Field(default=0.0005, ge=0.0, le=0.05)
    stop_loss_pct: float = Field(default=0.0, ge=0.0, le=0.99)
    take_profit_pct: float = Field(default=0.0, ge=0.0, le=10.0)
    position_size_pct: float = Field(default=100.0, gt=0.0, le=100.0)
    position_size_amount: float | None = Field(default=None, gt=0.0, le=10_000_000_000.0)
    max_positions: int = Field(default=1, ge=1, le=1)


class RobustnessAnalysisRequest(BaseModel):
    symbol: str = Field(default="NIFTY 50", min_length=1, max_length=50)
    start: datetime
    end: datetime
    timeframe: str = Field(default="1day")
    lookback_range: list[int] = Field(default=[10, 14, 20, 30, 40, 50])
    threshold_range: list[float] = Field(default=[20.0, 25.0, 30.0, 35.0, 40.0])


class MlExperimentRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=50)
    start: datetime
    end: datetime
    timeframe: str = Field(default="1day")
    horizon_days: int = Field(default=5, ge=1, le=60)
    train_ratio: float = Field(default=0.6, gt=0.0, lt=1.0)
    validation_ratio: float = Field(default=0.2, gt=0.0, lt=1.0)
    test_ratio: float = Field(default=0.2, gt=0.0, lt=1.0)
    models: list[str] = Field(default=["ridge", "random_forest", "hist_gradient_boosting"], min_length=1, max_length=3)
    commission_pct: float = Field(default=0.001, ge=0.0, le=0.05)
    slippage_pct: float = Field(default=0.0005, ge=0.0, le=0.05)

    @model_validator(mode="after")
    def validate_split(self) -> "MlExperimentRequest":
        if abs(self.train_ratio + self.validation_ratio + self.test_ratio - 1.0) > 1e-9:
            raise ValueError("train_ratio, validation_ratio, and test_ratio must sum to 1.")
        allowed = {"ridge", "random_forest", "hist_gradient_boosting"}
        if any(model not in allowed for model in self.models):
            raise ValueError("models must contain only ridge, random_forest, or hist_gradient_boosting.")
        return self


class ReplaySessionRequest(BaseModel):
    """Historical-only replay request; this application never submits broker orders."""

    symbol: str = Field(default="NIFTY 50", min_length=1, max_length=50)
    start: datetime
    end: datetime
    timeframe: str = Field(default="1day")
    mode: str = Field(default="manual", pattern="^(manual|automated)$")
    initial_capital: float = Field(default=100_000.0, gt=0.0)


class ReplayStepRequest(BaseModel):
    steps: int = Field(default=1, ge=1, le=1_000)


class ReplayOrderRequest(BaseModel):
    side: str = Field(..., pattern="^(buy|sell)$")
    quantity: float = Field(..., gt=0.0)
    order_type: str = Field(default="market", pattern="^(market|limit|stop)$")
    price: float | None = Field(default=None, gt=0.0)
    stop_loss: float | None = Field(default=None, gt=0.0)
    take_profit: float | None = Field(default=None, gt=0.0)


class HypothesisRequest(BaseModel):
    hypothesis: str = Field(..., min_length=10, max_length=2_000)
    symbol: str = Field(..., min_length=1, max_length=50, examples=["AAPL"])
    timeframe: str = Field(default="1day", examples=["1day"])
    strategy_id: str = Field(default="sma_crossover", min_length=1, max_length=80)


class PatternStrategyRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=50)
    target_gain_pct: float = Field(default=20.0, ge=1.0, le=100.0)
    rvol_threshold: float = Field(default=2.0, ge=0.5, le=10.0)
    dist_52w_pct: float = Field(default=5.0, ge=0.0, le=50.0)
    hold_days: int = Field(default=15, ge=2, le=60)


class MarketScannerRequest(BaseModel):
    universe: str = Field(default="nifty500", pattern="^(nifty50|nifty500|all)$")
    strategy_type: str = Field(default="sma_crossover", pattern="^[a-z][a-z0-9_]*$")
    start: datetime | None = None
    end: datetime | None = None


class BreakoutScannerRequest(BaseModel):
    min_conviction: float = Field(default=50.0, ge=0.0, le=100.0)
    limit: int = Field(default=50, ge=1, le=200)
    start: datetime | None = None
    end: datetime | None = None


class StructureZoneScanRequest(BaseModel):
    universe: str = Field(default="nifty50", min_length=1, max_length=80)


class StructureZoneResponse(BaseModel):
    symbol: str
    company_name: str
    sector: str
    direction: Literal["bullish", "bearish"]
    zone_low: float
    zone_high: float
    source_candle_date: date
    confirmed_date: date
    data_as_of: date
    break_level: float
    impulse_atr: float
    close: float
    distance_pct: float
    touch_sessions: int
    bars_since_confirmation: int
    state: Literal["untested", "retested", "testing"]


class StructureZoneScanResponse(BaseModel):
    universe: str
    data_as_of: date | None
    requested_symbols: int
    available_symbols: int
    scanned_symbols: int
    missing_symbols: list[str]
    insufficient_history_symbols: list[str]
    coverage_status: Literal["complete", "partial", "unavailable"]
    total_zones: int
    zones: list[StructureZoneResponse]


class WatchlistAddRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=50)
    company_name: str = Field(default="")
    setup_type: str = Field(default="Breakout Candidate")
    entry_price: float = Field(..., gt=0.0)
    target_price: float | None = Field(default=None, gt=0.0)
    stop_loss_price: float | None = Field(default=None, gt=0.0)
