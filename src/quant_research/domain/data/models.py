from datetime import datetime
from typing import Any, Protocol

from pydantic import BaseModel, Field


class OHLCVBar(BaseModel):
    timestamp: datetime
    symbol: str
    open: float = Field(..., gt=0.0, description="Open price must be positive")
    high: float = Field(..., gt=0.0, description="High price must be positive")
    low: float = Field(..., gt=0.0, description="Low price must be positive")
    close: float = Field(..., gt=0.0, description="Close price must be positive")
    volume: float = Field(..., ge=0.0, description="Volume must be non-negative")


class MarketDataProvider(Protocol):
    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        """Fetch historical OHLCV data for a given symbol and timeframe."""
        ...

    def get_symbols(self) -> list[str]:
        """Fetch list of all supported symbols."""
        ...

    def get_trading_calendar(self) -> list[datetime]:
        """Fetch trading days or timestamps calendar."""
        ...


class ValidationErrorDetail(BaseModel):
    row_index: int
    column: str
    error_type: str
    message: str


class ValidationWarningDetail(BaseModel):
    row_index: int
    column: str
    warning_type: str
    message: str


class DataQualityReport(BaseModel):
    is_valid: bool
    errors: list[ValidationErrorDetail] = Field(default_factory=list)
    warnings: list[ValidationWarningDetail] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
    data_hash: str
