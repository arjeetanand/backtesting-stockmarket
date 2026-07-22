from typing import Any

from pydantic import BaseModel, Field

from quant_research.domain.backtesting.models import DrawdownPeriod


class QuantSummary(BaseModel):
    run_id: str
    metrics: dict[str, float] = Field(
        default_factory=dict,
        description="Key metrics like cagr, sharpe, max_drawdown, trade_count, etc.",
    )
    drawdown_summary: list[DrawdownPeriod] = Field(
        default_factory=list,
        description="Summary of historical drawdown periods",
    )
    trade_distribution: dict[str, Any] = Field(
        default_factory=dict,
        description="Aggregated trade metrics (win/loss counts, payoff ratio, distribution statistics)",
    )
    regime_summary: dict[str, Any] = Field(
        default_factory=dict,
        description="Backtest metrics segmented by market regimes",
    )
    warnings: list[str] = Field(
        default_factory=list,
        description="Data warnings, execution anomalies, or potential bias detections",
    )
