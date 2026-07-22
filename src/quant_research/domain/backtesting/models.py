from datetime import datetime
from typing import Any, Literal, Protocol

import pandas as pd
from pydantic import BaseModel, Field

from quant_research.domain.dsl.compiler import CompiledStrategy


class Trade(BaseModel):
    id: str
    symbol: str
    entry_timestamp: datetime
    exit_timestamp: datetime
    entry_price: float = Field(..., gt=0.0)
    exit_price: float = Field(..., gt=0.0)
    size: float = Field(..., gt=0.0)
    direction: Literal["long", "short"]
    pnl: float
    return_pct: float
    commission: float = Field(default=0.0, ge=0.0)
    slippage: float = Field(default=0.0, ge=0.0)
    holding_period_seconds: float = Field(..., ge=0.0)


class EquityPoint(BaseModel):
    timestamp: datetime
    equity: float


class DrawdownPeriod(BaseModel):
    peak_timestamp: datetime
    trough_timestamp: datetime
    recovery_timestamp: datetime | None = None
    drawdown_pct: float = Field(..., le=0.0)  # negative value, e.g. -0.12 for -12%
    duration_seconds: float = Field(..., ge=0.0)


class BacktestResult(BaseModel):
    run_id: str
    strategy_hash: str
    data_hash: str
    engine_version: str
    execution_timestamp: datetime
    config: dict[str, Any]
    random_seed: int | None = None
    trades: list[Trade] = Field(default_factory=list)
    equity_curve: list[EquityPoint] = Field(default_factory=list)
    metrics: dict[str, float] = Field(default_factory=dict)
    drawdown_summary: list[DrawdownPeriod] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class BacktestEngine(Protocol):
    def run(self, strategy: CompiledStrategy, df: pd.DataFrame) -> BacktestResult:
        """Execute backtest of compiled strategy on given DataFrame."""
        ...
