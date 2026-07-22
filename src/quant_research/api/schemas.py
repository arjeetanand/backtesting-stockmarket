"""Request and response schemas exposed by the HTTP API."""

from datetime import date, datetime

from pydantic import BaseModel, Field

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


class NseImportRequest(BaseModel):
    start: date
    end: date
    preset: str = Field(default="sensex_banks_sector_etfs", pattern="^(sensex_banks_sector_etfs|nifty500|custom)$")
    symbols: list[str] = Field(default_factory=list, max_length=200)


class NseImportJobResponse(BaseModel):
    job_id: str
    status: str
    symbols: int


class NseImportCoverageItem(BaseModel):
    symbol: str
    bars: int
    earliest: datetime | None
    latest: datetime | None
    fully_available: bool


class NseImportPreviewResponse(BaseModel):
    requested_symbols: int
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


class YouTubeStrategyRequest(BaseModel):
    url: str = Field(..., min_length=12, max_length=500)
    transcript: str | None = Field(default=None, max_length=100_000)


class MarketDataResponse(BaseModel):
    symbol: str
    timeframe: str
    bars: list[OHLCVBar]
    quality: DataQualityReport


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


class RobustnessAnalysisRequest(BaseModel):
    symbol: str = Field(default="NIFTY 50", min_length=1, max_length=50)
    start: datetime
    end: datetime
    timeframe: str = Field(default="1day")
    lookback_range: list[int] = Field(default=[10, 14, 20, 30, 40, 50])
    threshold_range: list[float] = Field(default=[20.0, 25.0, 30.0, 35.0, 40.0])


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
