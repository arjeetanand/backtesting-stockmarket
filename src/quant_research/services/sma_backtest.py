"""A deterministic, no-look-ahead moving-average crossover backtest."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast
from uuid import uuid4

import pandas as pd

from quant_research.domain.analytics.metrics import calculate_drawdown_periods, calculate_portfolio_metrics
from quant_research.domain.backtesting.models import BacktestResult, EquityPoint, Trade
from quant_research.domain.utils.hashing import calculate_value_hash


def run_sma_crossover_backtest(
    data: pd.DataFrame,
    *,
    symbol: str,
    fast_window: int,
    slow_window: int,
    initial_capital: float,
    commission: float = 0.0,
    slippage: float = 0.0,
) -> BacktestResult:
    """Run a long-only SMA crossover strategy using next-bar-open execution.

    Signals are calculated at close and executed at the following bar's open to
    avoid using a price that was unavailable when the signal was generated.
    """
    if fast_window >= slow_window:
        raise ValueError("fast_window must be smaller than slow_window.")
    if len(data) <= slow_window:
        raise ValueError(f"At least {slow_window + 1} bars are required for this strategy.")

    frame = data.copy().sort_values("timestamp").reset_index(drop=True)
    frame["fast_sma"] = frame["close"].rolling(fast_window).mean()
    frame["slow_sma"] = frame["close"].rolling(slow_window).mean()
    frame["spread"] = frame["fast_sma"] - frame["slow_sma"]

    cash = initial_capital
    units = 0.0
    entry_price = 0.0
    entry_timestamp: datetime | None = None
    entry_cost = 0.0
    entry_slippage_cost = 0.0
    trades: list[Trade] = []
    equity_curve: list[EquityPoint] = []

    for index in range(len(frame)):
        row = frame.iloc[index]
        timestamp = pd.Timestamp(row["timestamp"]).to_pydatetime()
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=UTC)

        # A crossover confirmed at the prior close is executed at this bar's open.
        if (
            index > 1
            and pd.notna(frame.at[index - 2, "spread"])
            and pd.notna(frame.at[index - 1, "spread"])
        ):
            two_bars_ago_spread = float(cast(Any, frame.at[index - 2, "spread"]))
            previous_spread = float(cast(Any, frame.at[index - 1, "spread"]))
            buy_signal = units == 0.0 and two_bars_ago_spread <= 0.0 < previous_spread
            sell_signal = units > 0.0 and two_bars_ago_spread >= 0.0 > previous_spread

            if buy_signal:
                market_price = float(row["open"])
                execution_price = market_price * (1.0 + slippage)
                units = cash / (execution_price * (1.0 + commission))
                entry_price = execution_price
                entry_timestamp = timestamp
                entry_cost = units * execution_price * (1.0 + commission)
                entry_slippage_cost = units * (execution_price - market_price)
                cash -= entry_cost
            elif sell_signal and entry_timestamp is not None:
                market_price = float(row["open"])
                execution_price = market_price * (1.0 - slippage)
                proceeds = units * execution_price * (1.0 - commission)
                pnl = proceeds - entry_cost
                trades.append(
                    Trade(
                        id=f"trade_{uuid4().hex[:12]}",
                        symbol=symbol,
                        entry_timestamp=entry_timestamp,
                        exit_timestamp=timestamp,
                        entry_price=entry_price,
                        exit_price=execution_price,
                        size=units,
                        direction="long",
                        pnl=pnl,
                        return_pct=pnl / entry_cost if entry_cost else 0.0,
                        commission=(entry_cost - units * entry_price) + (units * execution_price - proceeds),
                        slippage=entry_slippage_cost + units * (market_price - execution_price),
                        holding_period_seconds=(timestamp - entry_timestamp).total_seconds(),
                    )
                )
                cash += proceeds
                units = 0.0
                entry_timestamp = None

        equity_curve.append(EquityPoint(timestamp=timestamp, equity=cash + units * float(row["close"])))

    # Close an open position at the final close, which gives a complete result.
    if units > 0.0 and entry_timestamp is not None:
        final = frame.iloc[-1]
        exit_timestamp = pd.Timestamp(final["timestamp"]).to_pydatetime()
        if exit_timestamp.tzinfo is None:
            exit_timestamp = exit_timestamp.replace(tzinfo=UTC)
        market_price = float(final["close"])
        execution_price = market_price * (1.0 - slippage)
        proceeds = units * execution_price * (1.0 - commission)
        pnl = proceeds - entry_cost
        trades.append(
            Trade(
                id=f"trade_{uuid4().hex[:12]}",
                symbol=symbol,
                entry_timestamp=entry_timestamp,
                exit_timestamp=exit_timestamp,
                entry_price=entry_price,
                exit_price=execution_price,
                size=units,
                direction="long",
                pnl=pnl,
                return_pct=pnl / entry_cost if entry_cost else 0.0,
                commission=(entry_cost - units * entry_price) + (units * execution_price - proceeds),
                slippage=entry_slippage_cost + units * (market_price - execution_price),
                holding_period_seconds=(exit_timestamp - entry_timestamp).total_seconds(),
            )
        )
        cash += proceeds
        equity_curve[-1] = EquityPoint(timestamp=exit_timestamp, equity=cash)

    metrics = calculate_portfolio_metrics(trades, equity_curve, initial_capital)
    equity_series = pd.Series([point.equity for point in equity_curve], index=[point.timestamp for point in equity_curve])
    warnings = [
        "Signals use next-bar-open execution to avoid look-ahead bias.",
        "This result does not account for corporate actions, survivorship bias, or taxes.",
    ]
    return BacktestResult(
        run_id=f"bt_{uuid4().hex[:12]}",
        strategy_hash=calculate_value_hash(
            {"type": "sma_crossover", "fast_window": fast_window, "slow_window": slow_window, "symbol": symbol}
        ),
        data_hash=calculate_value_hash(frame[["timestamp", "symbol", "open", "high", "low", "close", "volume"]].to_dict("records")),
        engine_version="sma-crossover-1.0.0",
        execution_timestamp=datetime.now(UTC),
        config={
            "strategy": "sma_crossover",
            "fast_window": fast_window,
            "slow_window": slow_window,
            "initial_capital": initial_capital,
            "commission": commission,
            "slippage": slippage,
            "execution_model": "signal_at_close_execute_next_open",
        },
        trades=trades,
        equity_curve=equity_curve,
        metrics=metrics,
        drawdown_summary=calculate_drawdown_periods(equity_series),
        warnings=warnings,
    )
