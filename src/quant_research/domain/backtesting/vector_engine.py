"""Vectorized Backtesting Engine."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from quant_research.domain.analytics.calculator import QuantitativeMetrics, compute_metrics
from quant_research.domain.indicators.calculator import (
    compute_bollinger_bands,
    compute_ema,
    compute_macd,
    compute_rsi,
    compute_sma,
)


@dataclass
class TradeRecord:
    """Individual trade execution record."""

    trade_id: int
    symbol: str
    entry_date: str
    exit_date: str
    entry_price: float
    exit_price: float
    position: str  # "LONG" or "SHORT"
    pnl: float
    return_pct: float
    holding_days: int


@dataclass
class VectorBacktestResult:
    """Complete result container for a vectorized backtest run."""

    run_id: str
    symbol: str
    timeframe: str
    strategy_id: str
    initial_capital: float
    final_equity: float
    metrics: QuantitativeMetrics
    equity_curve: list[dict[str, float | str]]
    drawdown_curve: list[dict[str, float | str]]
    trades: list[TradeRecord]
    candles: list[dict[str, float | str]] = field(default_factory=list)
    indicators: dict[str, list[dict[str, float | str | None]]] = field(default_factory=dict)
    signals: list[dict[str, float | str]] = field(default_factory=list)


def run_rule_backtest(
    df: pd.DataFrame,
    symbol: str = "NIFTY 50",
    timeframe: str = "1day",
    strategy_id: str = "rsi_ema",
    rsi_period: int = 14,
    rsi_oversold: float = 30.0,
    rsi_overbought: float = 70.0,
    fast_ema: int = 20,
    slow_ema: int = 50,
    initial_capital: float = 100000.0,
    commission_pct: float = 0.001,  # 0.1% = 10 bps
    slippage_pct: float = 0.0005,  # 0.05% = 5 bps
    stop_loss_pct: float = 0.0,
    take_profit_pct: float = 0.0,
    position_size_pct: float = 100.0,
    position_size_amount: float | None = None,
) -> VectorBacktestResult:
    """Run a deterministic vectorized backtest on OHLCV market data.

    Enforces Strict No-Lookahead Execution:
    - Indicators and signals are calculated on Close of Bar T.
    - Orders are executed on Open of Bar T+1 with slippage and commission applied.
    """
    if df.empty or len(df) < max(slow_ema, rsi_period) + 5:
        raise ValueError("Insufficient historical market data bars to compute indicators.")

    df = df.copy()
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"])
        df.set_index("date", inplace=True)
    df.sort_index(inplace=True)

    close = df["close"]
    open_p = df["open"]

    # 1. Compute strategy indicators and signals on Bar T.
    rsi = compute_rsi(close, rsi_period)
    ema_fast = compute_ema(close, fast_ema)
    ema_slow = compute_ema(close, slow_ema)

    if strategy_id == "rsi_ema":
        entry_signal = (rsi < rsi_oversold) & (ema_fast > ema_slow)
        exit_signal = (rsi > rsi_overbought) | (ema_fast < ema_slow)
    elif strategy_id == "sma_crossover":
        sma_fast = compute_sma(close, fast_ema)
        sma_slow = compute_sma(close, slow_ema)
        entry_signal = (sma_fast > sma_slow) & (sma_fast.shift(1) <= sma_slow.shift(1))
        exit_signal = (sma_fast < sma_slow) & (sma_fast.shift(1) >= sma_slow.shift(1))
    elif strategy_id == "ema_crossover":
        entry_signal = (ema_fast > ema_slow) & (ema_fast.shift(1) <= ema_slow.shift(1))
        exit_signal = (ema_fast < ema_slow) & (ema_fast.shift(1) >= ema_slow.shift(1))
    elif strategy_id == "rsi_mean_reversion":
        entry_signal = rsi < rsi_oversold
        exit_signal = rsi > 50.0
    elif strategy_id == "bollinger_mean_reversion":
        middle, _, lower = compute_bollinger_bands(close, fast_ema)
        entry_signal = close < lower
        exit_signal = close > middle
    elif strategy_id == "macd_crossover":
        macd_line, signal_line, _ = compute_macd(close, fast=12, slow=slow_ema, signal=9)
        entry_signal = (macd_line > signal_line) & (macd_line.shift(1) <= signal_line.shift(1))
        exit_signal = (macd_line < signal_line) & (macd_line.shift(1) >= signal_line.shift(1))
    elif strategy_id == "donchian_breakout":
        upper = df["high"].shift(1).rolling(slow_ema, min_periods=slow_ema).max()
        lower = df["low"].shift(1).rolling(slow_ema, min_periods=slow_ema).min()
        entry_signal = close > upper
        exit_signal = close < lower
    elif strategy_id == "momentum":
        momentum = close.pct_change(fast_ema)
        entry_signal = momentum > 0.0
        exit_signal = momentum < 0.0
    else:
        raise ValueError(f"Unsupported strategy '{strategy_id}'.")

    indicator_series: dict[str, pd.Series[float]] = {}
    if strategy_id == "sma_crossover":
        indicator_series = {f"SMA {fast_ema}": compute_sma(close, fast_ema), f"SMA {slow_ema}": compute_sma(close, slow_ema)}
    elif strategy_id == "ema_crossover" or strategy_id == "rsi_ema":
        indicator_series = {f"EMA {fast_ema}": ema_fast, f"EMA {slow_ema}": ema_slow}
    elif strategy_id == "rsi_mean_reversion":
        indicator_series = {f"RSI {rsi_period}": rsi}
    elif strategy_id == "bollinger_mean_reversion":
        middle, upper, lower = compute_bollinger_bands(close, fast_ema)
        indicator_series = {f"BB middle {fast_ema}": middle, f"BB upper {fast_ema}": upper, f"BB lower {fast_ema}": lower}
    elif strategy_id == "macd_crossover":
        macd_line, signal_line, _ = compute_macd(close, fast=12, slow=slow_ema, signal=9)
        indicator_series = {"MACD": macd_line, "MACD signal": signal_line}
    elif strategy_id == "donchian_breakout":
        indicator_series = {f"Donchian high {slow_ema}": df["high"].shift(1).rolling(slow_ema, min_periods=slow_ema).max(), f"Donchian low {slow_ema}": df["low"].shift(1).rolling(slow_ema, min_periods=slow_ema).min()}
    elif strategy_id == "momentum":
        indicator_series = {f"Momentum {fast_ema}": close.pct_change(fast_ema)}

    # 3. Shift signals by 1 bar for execution on Open T+1 (Strict No-Lookahead)
    execute_entry = entry_signal.shift(1).fillna(False)
    execute_exit = exit_signal.shift(1).fillna(False)

    # 4. Simulate Trade Execution & Equity Curve
    cash = initial_capital
    position = 0.0
    entry_price = 0.0
    entry_idx = 0

    equity_points: list[dict[str, float | str]] = []
    drawdown_points: list[dict[str, float | str]] = []
    trades: list[TradeRecord] = []
    trades_pnl: list[float] = []
    trade_counter = 1

    dates = df.index
    peak_equity = initial_capital

    for i in range(len(df)):
        dt_str = str(dates[i].strftime("%Y-%m-%d") if hasattr(dates[i], "strftime") else dates[i])
        curr_open = float(open_p.iloc[i])
        curr_close = float(close.iloc[i])

        # Check Exit Execution
        stop_hit = stop_loss_pct > 0 and curr_open <= entry_price * (1.0 - stop_loss_pct)
        target_hit = take_profit_pct > 0 and curr_open >= entry_price * (1.0 + take_profit_pct)
        if position > 0 and (execute_exit.iloc[i] or stop_hit or target_hit):
            fill_exit_price = curr_open * (1.0 - slippage_pct)
            gross_pnl = (fill_exit_price - entry_price) * position
            exit_comm = fill_exit_price * position * commission_pct
            net_pnl = gross_pnl - exit_comm

            cash += (fill_exit_price * position) - exit_comm
            ret_pct = (fill_exit_price / entry_price) - 1.0

            trades.append(
                TradeRecord(
                    trade_id=trade_counter,
                    symbol=symbol,
                    entry_date=str(dates[entry_idx].strftime("%Y-%m-%d") if hasattr(dates[entry_idx], "strftime") else dates[entry_idx]),
                    exit_date=dt_str,
                    entry_price=round(entry_price, 2),
                    exit_price=round(fill_exit_price, 2),
                    position="LONG",
                    pnl=round(net_pnl, 2),
                    return_pct=round(ret_pct * 100.0, 2),
                    holding_days=i - entry_idx,
                )
            )
            trades_pnl.append(net_pnl)
            trade_counter += 1

            position = 0.0
            entry_price = 0.0

        # Check Entry Execution
        if position == 0 and execute_entry.iloc[i]:
            fill_entry_price = curr_open * (1.0 + slippage_pct)
            available_cash = max(cash, 0.0)
            requested_capital = position_size_amount if position_size_amount is not None else available_cash * (position_size_pct / 100.0)
            capital_to_invest = min(requested_capital, available_cash / (1.0 + commission_pct))
            entry_comm = capital_to_invest * commission_pct
            if capital_to_invest <= 0:
                continue
            position = capital_to_invest / fill_entry_price
            cash = cash - entry_comm - capital_to_invest
            entry_price = fill_entry_price
            entry_idx = i

        # Calculate Portfolio Equity at Close of Bar i
        curr_equity = cash + (position * curr_close if position > 0 else 0.0)
        peak_equity = max(peak_equity, curr_equity)
        dd_pct = (curr_equity - peak_equity) / peak_equity if peak_equity > 0 else 0.0

        equity_points.append({"date": dt_str, "equity": round(curr_equity, 2)})
        drawdown_points.append({"date": dt_str, "drawdown": round(dd_pct * 100.0, 2)})

    # Convert equity curve to series for metric calculations
    equity_series = pd.Series([p["equity"] for p in equity_points], dtype=float)
    metrics = compute_metrics(equity_series, trades_pnl)

    import uuid
    run_id = f"bt_{uuid.uuid4().hex[:8]}"

    chart_candles = [
        {"date": str(index.strftime("%Y-%m-%d") if hasattr(index, "strftime") else index), "open": float(open_p.iloc[i]), "high": float(df["high"].iloc[i]), "low": float(df["low"].iloc[i]), "close": float(close.iloc[i])}
        for i, index in enumerate(dates)
    ]
    chart_indicators = {
        label: [{"date": chart_candles[i]["date"], "value": None if pd.isna(value) else float(value)} for i, value in enumerate(series)]
        for label, series in indicator_series.items()
    }
    chart_signals = [
        {"date": trade.entry_date, "type": "entry", "price": trade.entry_price}
        for trade in trades
    ] + [
        {"date": trade.exit_date, "type": "exit", "price": trade.exit_price}
        for trade in trades
    ]

    return VectorBacktestResult(
        run_id=run_id,
        symbol=symbol,
        timeframe=timeframe,
        strategy_id=strategy_id,
        initial_capital=initial_capital,
        final_equity=round(float(equity_series.iloc[-1]), 2),
        metrics=metrics,
        equity_curve=equity_points,
        drawdown_curve=drawdown_points,
        trades=trades,
        candles=chart_candles,
        indicators=chart_indicators,
        signals=chart_signals,
    )
