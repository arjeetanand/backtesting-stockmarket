from datetime import datetime

from quant_research.domain.dsl.models import (
    ComparisonExpression,
    DateRange,
    IndicatorReference,
    IndicatorSpec,
    LiteralValue,
    LogicalExpression,
    PositionSizingSpec,
    StrategyMetadata,
    StrategySpec,
)


def test_strategy_spec_parsing() -> None:
    # Build strategy spec using direct Pydantic instantiation
    metadata = StrategyMetadata(name="Test Strategy", author="Quant Researcher")
    date_range = DateRange(start=datetime(2023, 1, 1), end=datetime(2023, 12, 31))
    pos_sizing = PositionSizingSpec(type="percent", value=0.1)

    # Condition: RSI(14) < 30
    rsi_ref = IndicatorReference(alias="rsi_14")
    lit_30 = LiteralValue(value=30.0)
    cond = ComparisonExpression(left=rsi_ref, op="<", right=lit_30)

    spec = StrategySpec(
        metadata=metadata,
        universe="stocks",
        symbols=["AAPL"],
        exchange="NASDAQ",
        timeframe="1d",
        date_range=date_range,
        initial_capital=100000.0,
        trade_direction="long",
        indicators={"rsi_14": IndicatorSpec(type="RSI", parameters={"period": 14})},
        entry_conditions=[cond],
        exit_conditions=[],
        position_sizing=pos_sizing,
    )

    assert spec.metadata.name == "Test Strategy"
    assert len(spec.indicators) == 1
    assert spec.entry_conditions[0].type == "comparison"
    assert spec.entry_conditions[0].op == "<"


def test_ast_json_serialization() -> None:
    # Confirm AST serializes and parses cleanly to check Pydantic Discriminated Unions
    rsi_ref = IndicatorReference(alias="rsi_14")
    lit_30 = LiteralValue(value=30)
    comp = ComparisonExpression(left=rsi_ref, op="<", right=lit_30)

    logical = LogicalExpression(op="and", conditions=[comp])

    json_data = logical.model_dump_json()
    parsed = LogicalExpression.model_validate_json(json_data)

    assert parsed.type == "logical"
    assert parsed.op == "and"
    assert len(parsed.conditions) == 1
    assert parsed.conditions[0].type == "comparison"
    assert parsed.conditions[0].left.type == "indicator"
    assert parsed.conditions[0].left.alias == "rsi_14"
