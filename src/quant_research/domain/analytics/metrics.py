from datetime import datetime

import numpy as np
import pandas as pd

from quant_research.domain.backtesting.models import DrawdownPeriod, EquityPoint, Trade


def calculate_drawdown_periods(equity_series: pd.Series) -> list[DrawdownPeriod]:
    """Extracts all drawdown periods (both recovered and active) from an equity curve.

    Args:
        equity_series: A pandas Series of equity values indexed by timestamp.

    Returns:
        A list of DrawdownPeriod models.
    """
    if equity_series.empty:
        return []

    # Sort index to ensure temporal order
    equity_series = equity_series.sort_index()

    cum_max = equity_series.cummax()
    periods: list[DrawdownPeriod] = []

    in_drawdown = False
    peak_time: datetime | None = None
    peak_val: float | None = None
    trough_time: datetime | None = None
    trough_val: float | None = None

    for ts, val in equity_series.items():
        assert isinstance(ts, datetime)
        is_peak = val >= cum_max.loc[ts]

        if not in_drawdown:
            if not is_peak:
                in_drawdown = True
                # The peak is the index of the maximum value up to the current timestamp
                idx_max = equity_series.loc[:ts].idxmax()
                assert isinstance(idx_max, datetime)
                peak_time = idx_max
                peak_val = float(equity_series.loc[peak_time])
                trough_time = ts
                trough_val = val
        else:
            if is_peak:
                # Recovered from drawdown
                assert peak_time is not None
                assert trough_time is not None
                assert peak_val is not None
                assert trough_val is not None
                dd_pct = (trough_val - peak_val) / peak_val if peak_val != 0.0 else 0.0
                duration = (ts - peak_time).total_seconds()
                periods.append(
                    DrawdownPeriod(
                        peak_timestamp=peak_time,
                        trough_timestamp=trough_time,
                        recovery_timestamp=ts,
                        drawdown_pct=dd_pct,
                        duration_seconds=duration,
                    )
                )
                in_drawdown = False
                peak_time = None
                peak_val = None
                trough_time = None
                trough_val = None
            else:
                # Still in drawdown; update trough if we find a lower equity value
                if trough_val is None or val < trough_val:
                    trough_val = val
                    trough_time = ts

    # Handle unresolved drawdown at the end of the time series
    if in_drawdown and peak_time is not None:
        assert trough_time is not None
        assert peak_val is not None
        assert trough_val is not None
        dd_pct = (trough_val - peak_val) / peak_val if peak_val != 0.0 else 0.0
        duration = (equity_series.index[-1] - peak_time).total_seconds()
        periods.append(
            DrawdownPeriod(
                peak_timestamp=peak_time,
                trough_timestamp=trough_time,
                recovery_timestamp=None,
                drawdown_pct=dd_pct,
                duration_seconds=duration,
            )
        )

    return periods


def calculate_exposure(trades: list[Trade], start_time: datetime, end_time: datetime) -> float:
    """Calculates market exposure (fraction of total time spent in a trade)."""
    if not trades or start_time >= end_time:
        return 0.0

    # Merge overlapping active trade intervals
    intervals = [(t.entry_timestamp, t.exit_timestamp) for t in trades]
    intervals.sort(key=lambda x: x[0])

    merged: list[list[datetime]] = []
    for start, end in intervals:
        if not merged or merged[-1][1] < start:
            merged.append([start, end])
        else:
            merged[-1][1] = max(merged[-1][1], end)

    active_seconds = sum((end - start).total_seconds() for start, end in merged)
    total_seconds = (end_time - start_time).total_seconds()

    if total_seconds <= 0:
        return 0.0

    return min(active_seconds / total_seconds, 1.0)


def calculate_portfolio_metrics(
    trades: list[Trade],
    equity_curve: list[EquityPoint],
    initial_capital: float,
    risk_free_rate: float = 0.0,
) -> dict[str, float]:
    """Calculates deterministic portfolio performance and risk metrics.

    Args:
        trades: A list of executed Trades.
        equity_curve: A list of portfolio EquityPoints.
        initial_capital: The starting portfolio capital.
        risk_free_rate: Risk-free rate for Sharpe/Sortino ratios (annualized).

    Returns:
        A dictionary containing all calculated metrics.
    """
    metrics: dict[str, float] = {}

    # Initialize basic count
    metrics["trade_count"] = float(len(trades))

    # 1. Equity-based Metrics
    if not equity_curve:
        return metrics

    equity_series = pd.Series([p.equity for p in equity_curve], index=[p.timestamp for p in equity_curve]).sort_index()

    first_ts = equity_series.index[0]
    last_ts = equity_series.index[-1]

    final_equity = equity_series.iloc[-1]
    total_ret = (final_equity - initial_capital) / initial_capital if initial_capital > 0 else 0.0
    metrics["total_return"] = total_ret

    # CAGR
    duration_days = (last_ts - first_ts).days
    years = max(duration_days, 1) / 365.25
    cagr = (final_equity / initial_capital) ** (1 / years) - 1 if initial_capital > 0 and final_equity > 0 else 0.0
    metrics["cagr"] = cagr

    # Daily Returns & Volatility
    assert isinstance(equity_series.index, pd.DatetimeIndex)
    daily_equity = equity_series.groupby(equity_series.index.date).last()
    daily_equity = pd.Series(daily_equity.values, index=pd.to_datetime(daily_equity.index))
    daily_returns = daily_equity.pct_change().dropna()

    ann_vol = 0.0
    if len(daily_returns) > 1:
        ann_vol = float(daily_returns.std(ddof=1) * np.sqrt(252))
    metrics["annualized_volatility"] = ann_vol

    # Sharpe Ratio
    metrics["sharpe_ratio"] = (cagr - risk_free_rate) / ann_vol if ann_vol > 0.0 else 0.0

    # Sortino Ratio
    downside_returns = daily_returns[daily_returns < 0]
    downside_vol = 0.0
    if len(downside_returns) > 1:
        downside_vol = float(downside_returns.std(ddof=1) * np.sqrt(252))
    metrics["sortino_ratio"] = (cagr - risk_free_rate) / downside_vol if downside_vol > 0.0 else 0.0

    # Drawdown Metrics
    dd_periods = calculate_drawdown_periods(equity_series)
    max_dd = 0.0
    max_dd_duration = 0.0
    if dd_periods:
        max_dd = float(min(p.drawdown_pct for p in dd_periods))
        max_dd_duration = float(max(p.duration_seconds for p in dd_periods))
    metrics["maximum_drawdown"] = max_dd
    metrics["drawdown_duration"] = max_dd_duration

    # Calmar Ratio
    metrics["calmar_ratio"] = cagr / abs(max_dd) if max_dd != 0.0 else 0.0

    # Exposure
    metrics["exposure"] = calculate_exposure(trades, first_ts, last_ts)

    # 2. Trade-based Metrics
    if not trades:
        metrics.update(
            {
                "win_rate": 0.0,
                "profit_factor": 0.0,
                "expectancy": 0.0,
                "average_winner": 0.0,
                "average_loser": 0.0,
                "payoff_ratio": 0.0,
                "average_holding_period": 0.0,
                "turnover": 0.0,
            }
        )
        return metrics

    winning_trades = [t for t in trades if t.pnl > 0]
    losing_trades = [t for t in trades if t.pnl < 0]

    win_rate = len(winning_trades) / len(trades)
    metrics["win_rate"] = win_rate

    sum_gains = sum(t.pnl for t in winning_trades)
    sum_losses = sum(t.pnl for t in losing_trades)

    if sum_losses == 0.0:
        metrics["profit_factor"] = float("inf") if sum_gains > 0.0 else 1.0
    else:
        metrics["profit_factor"] = float(sum_gains / abs(sum_losses))

    # Expectancy (mean pnl per trade)
    metrics["expectancy"] = float(sum(t.pnl for t in trades) / len(trades))

    avg_win = float(np.mean([t.pnl for t in winning_trades])) if winning_trades else 0.0
    avg_loss = float(np.mean([t.pnl for t in losing_trades])) if losing_trades else 0.0
    metrics["average_winner"] = avg_win
    metrics["average_loser"] = avg_loss

    metrics["payoff_ratio"] = avg_win / abs(avg_loss) if avg_loss != 0.0 else 0.0

    # Average Holding Period
    metrics["average_holding_period"] = float(np.mean([t.holding_period_seconds for t in trades]))

    # Turnover (Total Volume / Average Equity)
    avg_equity = float(equity_series.mean()) if not equity_series.empty else initial_capital
    total_traded_volume = sum(t.size * t.entry_price for t in trades)
    metrics["turnover"] = total_traded_volume / avg_equity if avg_equity > 0 else 0.0

    return metrics
