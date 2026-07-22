from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

# ==========================================
# Expression AST Nodes
# ==========================================


class LiteralValue(BaseModel):
    type: Literal["literal"] = "literal"
    value: bool | int | float | str


class PriceReference(BaseModel):
    type: Literal["price"] = "price"
    field: Literal["open", "high", "low", "close", "volume"]


class IndicatorReference(BaseModel):
    type: Literal["indicator"] = "indicator"
    alias: str  # references an indicator alias in indicators spec


class ComparisonExpression(BaseModel):
    type: Literal["comparison"] = "comparison"
    left: "ExpressionNode"
    op: Literal["<", "<=", ">", ">=", "==", "!="]
    right: "ExpressionNode"


class CrossExpression(BaseModel):
    type: Literal["cross"] = "cross"
    left: "ExpressionNode"
    op: Literal["cross_above", "cross_below"]
    right: "ExpressionNode"


class LogicalExpression(BaseModel):
    type: Literal["logical"] = "logical"
    op: Literal["and", "or", "not"]
    conditions: list["ExpressionNode"]


# Discriminated Union for AST Nodes
ExpressionNode = Annotated[
    LiteralValue | PriceReference | IndicatorReference | ComparisonExpression | CrossExpression | LogicalExpression,
    Field(discriminator="type"),
]

# Rebuild models for recursive references in Pydantic v2
ComparisonExpression.model_rebuild()
CrossExpression.model_rebuild()
LogicalExpression.model_rebuild()

# ==========================================
# Strategy Spec Models
# ==========================================


class StrategyMetadata(BaseModel):
    name: str
    description: str | None = None
    author: str | None = None
    version: str = "1.0.0"


class DateRange(BaseModel):
    start: datetime
    end: datetime


class IndicatorSpec(BaseModel):
    type: str  # e.g., "SMA", "EMA", "RSI", "MACD", "ATR"
    parameters: dict[str, Any]


class PositionSizingSpec(BaseModel):
    type: Literal["fixed", "percent", "risk_based"]
    value: float  # Absolute currency for fixed, fraction (0-1) for percent, risk weight


class RiskRulesSpec(BaseModel):
    max_drawdown_limit: float | None = None
    leverage_limit: float | None = None


class StopLossSpec(BaseModel):
    type: Literal["fixed_price", "percent", "atr"]
    value: float


class TakeProfitSpec(BaseModel):
    type: Literal["fixed_price", "percent", "atr"]
    value: float


class TrailingStopSpec(BaseModel):
    type: Literal["percent", "atr"]
    value: float


class StrategySpec(BaseModel):
    metadata: StrategyMetadata
    universe: str
    symbols: list[str]
    exchange: str
    timeframe: str
    date_range: DateRange
    initial_capital: float
    trade_direction: Literal["long", "short", "both"]
    indicators: dict[str, IndicatorSpec] = Field(default_factory=dict)
    entry_conditions: list[ExpressionNode] = Field(default_factory=list)
    exit_conditions: list[ExpressionNode] = Field(default_factory=list)
    position_sizing: PositionSizingSpec
    risk_rules: RiskRulesSpec = Field(default_factory=RiskRulesSpec)
    stop_loss: StopLossSpec | None = None
    take_profit: TakeProfitSpec | None = None
    trailing_stop: TrailingStopSpec | None = None
    commission: float = 0.0  # as a fraction, e.g. 0.001
    slippage: float = 0.0  # as a fraction, e.g. 0.0005
    maximum_positions: int = 1
