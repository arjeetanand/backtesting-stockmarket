from datetime import UTC, datetime, timedelta

import pytest

from quant_research.domain.analytics.metrics import (
    calculate_drawdown_periods,
    calculate_exposure,
    calculate_portfolio_metrics,
)
from quant_research.domain.backtesting.models import EquityPoint, Trade


def test_drawdown_calculation() -> None:
    # Set up synthetic equity curve with a known drawdown
    # Peak at 100, drops to 80 (20% drawdown), recovers to 110, drops to 99 (10% drawdown)
    times = [datetime(2023, 1, 1, tzinfo=UTC) + timedelta(days=i) for i in range(5)]
    points = [
        EquityPoint(timestamp=times[0], equity=100.0),
        EquityPoint(timestamp=times[1], equity=80.0),
        EquityPoint(timestamp=times[2], equity=110.0),
        EquityPoint(timestamp=times[3], equity=99.0),
        EquityPoint(timestamp=times[4], equity=105.0),
    ]

    # Convert points to pd.Series for calculate_drawdown_periods
    import pandas as pd

    equity_series = pd.Series([p.equity for p in points], index=[p.timestamp for p in points])

    periods = calculate_drawdown_periods(equity_series)

    assert len(periods) == 2

    # First period: peak=100, trough=80, recovery=110
    assert periods[0].drawdown_pct == -0.20
    assert periods[0].peak_timestamp == times[0]
    assert periods[0].trough_timestamp == times[1]
    assert periods[0].recovery_timestamp == times[2]
    assert periods[0].duration_seconds == timedelta(days=2).total_seconds()

    # Second period: peak=110, trough=99, recovery=None (at end)
    assert periods[1].drawdown_pct == -0.10
    assert periods[1].peak_timestamp == times[2]
    assert periods[1].trough_timestamp == times[3]
    assert periods[1].recovery_timestamp is None
    assert periods[1].duration_seconds == timedelta(days=2).total_seconds()


def test_exposure_calculation() -> None:
    # 2 overlapping/consecutive trades
    start = datetime(2023, 1, 1, tzinfo=UTC)
    t1 = Trade(
        id="1",
        symbol="AAPL",
        entry_timestamp=start,
        exit_timestamp=start + timedelta(hours=5),
        entry_price=100.0,
        exit_price=105.0,
        size=10.0,
        direction="long",
        pnl=50.0,
        return_pct=0.05,
        holding_period_seconds=18000.0,
    )
    t2 = Trade(
        id="2",
        symbol="AAPL",
        entry_timestamp=start + timedelta(hours=3),  # overlapping
        exit_timestamp=start + timedelta(hours=8),
        entry_price=105.0,
        exit_price=110.0,
        size=10.0,
        direction="long",
        pnl=50.0,
        return_pct=0.05,
        holding_period_seconds=18000.0,
    )

    # Merged interval: start to start + 8 hours (28800 seconds)
    # Total backtest period: start to start + 10 hours (36000 seconds)
    end = start + timedelta(hours=10)
    exposure = calculate_exposure([t1, t2], start, end)
    assert exposure == 0.8  # 8 hours out of 10 hours


def test_portfolio_metrics_synthetic() -> None:
    # Define a clean 4-day equity curve starting at 1000
    times = [datetime(2023, 1, 1, tzinfo=UTC) + timedelta(days=i) for i in range(4)]
    equity = [
        EquityPoint(timestamp=times[0], equity=1000.0),
        EquityPoint(timestamp=times[1], equity=1010.0),  # +1%
        EquityPoint(timestamp=times[2], equity=999.9),  # ~ -1%
        EquityPoint(timestamp=times[3], equity=1020.1),  # +2%
    ]

    # Total return = (1020.1 - 1000) / 1000 = 2.01% (0.0201)
    # 3 days elapsed. CAGR = (1020.1/1000)**(365.25/3) - 1
    # Simple trades list
    trades = [
        Trade(
            id="1",
            symbol="AAPL",
            entry_timestamp=times[0],
            exit_timestamp=times[1],
            entry_price=100.0,
            exit_price=101.0,
            size=10.0,
            direction="long",
            pnl=10.0,
            return_pct=0.01,
            holding_period_seconds=86400.0,
        ),
        Trade(
            id="2",
            symbol="AAPL",
            entry_timestamp=times[2],
            exit_timestamp=times[3],
            entry_price=100.0,
            exit_price=98.0,
            size=5.0,
            direction="long",
            pnl=-10.0,
            return_pct=-0.02,
            holding_period_seconds=86400.0,
        ),
    ]

    metrics = calculate_portfolio_metrics(trades, equity, initial_capital=1000.0)

    assert metrics["trade_count"] == 2.0
    assert pytest.approx(metrics["total_return"], abs=1e-5) == 0.0201
    assert metrics["win_rate"] == 0.5
    assert metrics["profit_factor"] == 1.0  # 10.0 / 10.0
    assert metrics["expectancy"] == 0.0  # (10.0 - 10.0) / 2
    assert metrics["average_winner"] == 10.0
    assert metrics["average_loser"] == -10.0
    assert metrics["payoff_ratio"] == 1.0
    assert metrics["average_holding_period"] == 86400.0
    assert pytest.approx(metrics["turnover"], abs=1e-5) == 1500.0 / 1007.5
