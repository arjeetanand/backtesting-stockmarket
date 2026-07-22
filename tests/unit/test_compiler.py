from datetime import datetime

import pytest

from quant_research.domain.dsl.compiler import StrategyCompiler
from quant_research.domain.dsl.models import (
    ComparisonExpression,
    DateRange,
    IndicatorReference,
    IndicatorSpec,
    LiteralValue,
    PositionSizingSpec,
    StrategyMetadata,
    StrategySpec,
)


def create_base_spec(indicators: dict, entry_conditions: list) -> StrategySpec:
    return StrategySpec(
        metadata=StrategyMetadata(name="Test Strategy"),
        universe="stocks",
        symbols=["AAPL"],
        exchange="NASDAQ",
        timeframe="1d",
        date_range=DateRange(start=datetime(2023, 1, 1), end=datetime(2023, 12, 31)),
        initial_capital=100000.0,
        trade_direction="long",
        indicators=indicators,
        entry_conditions=entry_conditions,
        exit_conditions=[],
        position_sizing=PositionSizingSpec(type="fixed", value=1000.0),
    )


def test_compiler_success() -> None:
    # SMA depending on close (implicit), and RSI depending on close
    indicators = {
        "sma_20": IndicatorSpec(type="SMA", parameters={"period": 20}),
        "rsi_14": IndicatorSpec(type="RSI", parameters={"period": 14}),
    }
    # condition: rsi_14 < 30
    cond = ComparisonExpression(left=IndicatorReference(alias="rsi_14"), op="<", right=LiteralValue(value=30.0))
    spec = create_base_spec(indicators, [cond])
    compiled = StrategyCompiler.compile(spec)

    assert compiled.strategy_hash is not None
    # No dependencies between indicators, order is alphabetical
    assert compiled.indicator_dependencies == ["rsi_14", "sma_20"]


def test_compiler_dependency_resolution() -> None:
    # A depends on B, B depends on C
    indicators = {
        "ind_A": IndicatorSpec(type="SMA", parameters={"period": 10, "input": "ind_B"}),
        "ind_B": IndicatorSpec(type="EMA", parameters={"period": 20, "input": "ind_C"}),
        "ind_C": IndicatorSpec(type="RSI", parameters={"period": 14}),
    }
    spec = create_base_spec(indicators, [])
    compiled = StrategyCompiler.compile(spec)

    # Must be resolved in order: C, then B, then A
    assert compiled.indicator_dependencies == ["ind_C", "ind_B", "ind_A"]


def test_compiler_circular_dependency() -> None:
    # A depends on B, B depends on A
    indicators = {
        "ind_A": IndicatorSpec(type="SMA", parameters={"period": 10, "input": "ind_B"}),
        "ind_B": IndicatorSpec(type="EMA", parameters={"period": 20, "input": "ind_A"}),
    }
    spec = create_base_spec(indicators, [])
    with pytest.raises(ValueError, match="Circular dependency detected"):
        StrategyCompiler.compile(spec)


def test_compiler_missing_indicator_in_conditions() -> None:
    # Condition references 'rsi_14', but it's not defined in indicators
    cond = ComparisonExpression(left=IndicatorReference(alias="rsi_14"), op="<", right=LiteralValue(value=30.0))
    spec = create_base_spec({}, [cond])
    with pytest.raises(ValueError, match="Condition references indicator alias 'rsi_14'"):
        StrategyCompiler.compile(spec)


def test_compiler_invalid_indicator_parameters() -> None:
    # SMA period must be gt 0, setting -5 should fail validation
    indicators = {"sma_bad": IndicatorSpec(type="SMA", parameters={"period": -5})}
    spec = create_base_spec(indicators, [])
    with pytest.raises(ValueError, match="Invalid parameters for indicator 'SMA'"):
        StrategyCompiler.compile(spec)
