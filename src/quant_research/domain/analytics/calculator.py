"""Quantitative Performance Analytics Engine."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd


@dataclass
class QuantitativeMetrics:
    """Complete quantitative performance metrics summary."""

    total_return: float
    cagr: float
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float
    max_drawdown: float
    max_drawdown_duration_days: int
    win_rate: float
    profit_factor: float
    payoff_ratio: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_winner: float
    avg_loser: float
    expectancy: float
    var_95: float
    monthly_returns: dict[str, float] = field(default_factory=dict)


def compute_metrics(
    equity_curve: pd.Series[float],
    trades_pnl: list[float],
    holding_days: list[int] | None = None,
    risk_free_rate: float = 0.02,
    periods_per_year: int = 252,
) -> QuantitativeMetrics:
    """Compute rigorous performance metrics from equity curve and trade logs."""
    if equity_curve.empty or len(equity_curve) < 2:
        return QuantitativeMetrics(
            total_return=0.0,
            cagr=0.0,
            sharpe_ratio=0.0,
            sortino_ratio=0.0,
            calmar_ratio=0.0,
            max_drawdown=0.0,
            max_drawdown_duration_days=0,
            win_rate=0.0,
            profit_factor=0.0,
            payoff_ratio=0.0,
            total_trades=0,
            winning_trades=0,
            losing_trades=0,
            avg_winner=0.0,
            avg_loser=0.0,
            expectancy=0.0,
            var_95=0.0,
        )

    initial_equity = equity_curve.iloc[0]
    final_equity = equity_curve.iloc[-1]
    total_return = float((final_equity - initial_equity) / initial_equity) if initial_equity > 0 else 0.0

    # Total trading days / years calculation
    n_days = max(1, len(equity_curve))
    years = n_days / periods_per_year
    cagr = float((final_equity / initial_equity) ** (1.0 / years) - 1.0) if years > 0 and final_equity > 0 else 0.0

    # Daily returns
    daily_returns = equity_curve.pct_change().dropna()
    mean_ret = float(daily_returns.mean()) if not daily_returns.empty else 0.0
    std_ret = float(daily_returns.std()) if not daily_returns.empty else 0.0

    # Sharpe ratio
    rf_daily = risk_free_rate / periods_per_year
    excess_mean = mean_ret - rf_daily
    sharpe_ratio = float((excess_mean / std_ret) * np.sqrt(periods_per_year)) if std_ret > 1e-10 else 0.0

    # Sortino ratio
    downside_returns = daily_returns[daily_returns < 0]
    downside_std = float(downside_returns.std()) if not downside_returns.empty else 0.0
    sortino_ratio = float((excess_mean / downside_std) * np.sqrt(periods_per_year)) if downside_std > 1e-10 else 0.0

    # Max Drawdown and Duration
    cummax = equity_curve.cummax()
    drawdown = (equity_curve - cummax) / cummax
    max_drawdown = float(drawdown.min())

    # Drawdown duration calculation
    in_dd = drawdown < 0
    dd_durations = []
    current_dur = 0
    for flag in in_dd:
        if flag:
            current_dur += 1
        else:
            if current_dur > 0:
                dd_durations.append(current_dur)
            current_dur = 0
    if current_dur > 0:
        dd_durations.append(current_dur)
    max_dd_duration = max(dd_durations) if dd_durations else 0

    # Calmar ratio
    calmar_ratio = float(cagr / abs(max_drawdown)) if abs(max_drawdown) > 1e-10 else 0.0

    # Value at Risk (95% historical VaR)
    var_95 = float(np.percentile(daily_returns, 5)) if not daily_returns.empty else 0.0

    # Trade level statistics
    total_trades = len(trades_pnl)
    winners = [p for p in trades_pnl if p > 0]
    losers = [p for p in trades_pnl if p < 0]

    winning_trades = len(winners)
    losing_trades = len(losers)

    win_rate = float(winning_trades / total_trades) if total_trades > 0 else 0.0

    avg_winner = float(np.mean(winners)) if winners else 0.0
    avg_loser = float(np.mean(losers)) if losers else 0.0

    total_gain = float(np.sum(winners)) if winners else 0.0
    total_loss = float(abs(np.sum(losers))) if losers else 0.0

    profit_factor = float(total_gain / total_loss) if total_loss > 1e-10 else (10.0 if total_gain > 0 else 0.0)
    payoff_ratio = float(avg_winner / abs(avg_loser)) if abs(avg_loser) > 1e-10 else 0.0

    expectancy = (win_rate * avg_winner) - ((1.0 - win_rate) * abs(avg_loser))

    return QuantitativeMetrics(
        total_return=round(total_return, 4),
        cagr=round(cagr, 4),
        sharpe_ratio=round(sharpe_ratio, 2),
        sortino_ratio=round(sortino_ratio, 2),
        calmar_ratio=round(calmar_ratio, 2),
        max_drawdown=round(max_drawdown, 4),
        max_drawdown_duration_days=max_dd_duration,
        win_rate=round(win_rate, 4),
        profit_factor=round(profit_factor, 2),
        payoff_ratio=round(payoff_ratio, 2),
        total_trades=total_trades,
        winning_trades=winning_trades,
        losing_trades=losing_trades,
        avg_winner=round(avg_winner, 2),
        avg_loser=round(avg_loser, 2),
        expectancy=round(expectancy, 2),
        var_95=round(var_95, 4),
    )
