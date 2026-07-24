"""Vectorized Backtesting Engine."""

from __future__ import annotations

import uuid
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
    entry_amount: float = 0.0
    max_unrealized_pnl: float = 0.0
    min_unrealized_pnl: float = 0.0


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
    trade_path: list[dict[str, float | str]] = field(default_factory=list)


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

    prior_high = df["high"].shift(1).rolling(slow_ema, min_periods=slow_ema).max()
    prior_low = df["low"].shift(1).rolling(slow_ema, min_periods=slow_ema).min()
    structure_high = df["high"].shift(1).rolling(fast_ema, min_periods=fast_ema).max()
    structure_low = df["low"].shift(1).rolling(fast_ema, min_periods=fast_ema).min()

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
    elif strategy_id == "support_resistance_breakout":
        entry_signal = close > prior_high
        exit_signal = close < prior_low
    elif strategy_id == "market_structure_break":
        entry_signal = (close > structure_high) & (ema_fast > ema_slow)
        exit_signal = (close < structure_low) | (ema_fast < ema_slow)
    elif strategy_id == "fibonacci_retracement":
        price_range = prior_high - prior_low
        fib_50 = prior_high - (price_range * 0.50)
        fib_618 = prior_high - (price_range * 0.618)
        fib_786 = prior_high - (price_range * 0.786)
        entry_signal = (ema_fast > ema_slow) & (df["low"] <= fib_618) & (close > fib_50)
        exit_signal = (close < fib_786) | (close > prior_high)
    elif strategy_id == "price_action_reversal":
        previous_bearish = df["close"].shift(1) < df["open"].shift(1)
        previous_open = df["open"].shift(1)
        previous_close = df["close"].shift(1)
        bullish_engulfing = (
            (close > df["open"])
            & previous_bearish
            & (close >= previous_open)
            & (df["open"] <= previous_close)
        )
        body = (close - df["open"]).abs()
        lower_wick = pd.concat([close, df["open"]], axis=1).min(axis=1) - df["low"]
        upper_wick = df["high"] - pd.concat([close, df["open"]], axis=1).max(axis=1)
        bullish_hammer = (close > df["open"]) & (lower_wick >= body * 2) & (upper_wick <= body)
        entry_signal = (bullish_engulfing | bullish_hammer) & (close > ema_slow)
        bearish_engulfing = (
            (close < df["open"])
            & (df["close"].shift(1) > df["open"].shift(1))
            & (close <= df["open"].shift(1))
            & (df["open"] >= df["close"].shift(1))
        )
        exit_signal = bearish_engulfing | (close < prior_low)
    elif strategy_id == "supply_demand_zones":
        demand_floor = df["low"].shift(2).rolling(slow_ema, min_periods=slow_ema).min()
        demand_candle = (df["low"].shift(1) <= demand_floor * 1.01) & (df["close"].shift(1) > df["open"].shift(1))
        entry_signal = demand_candle & (close > df["high"].shift(1))
        exit_signal = (close < demand_floor) | (close < ema_fast)
    elif strategy_id == "ict_liquidity_fvg":
        swept_liquidity = (df["low"] < structure_low) & (close > structure_low)
        bullish_fvg = df["low"] > df["high"].shift(2)
        entry_signal = swept_liquidity & bullish_fvg & (close > ema_slow)
        exit_signal = (close < structure_low) | (close < ema_fast)
    elif strategy_id == "multi_timeframe_trend":
        higher_frequency = "W-FRI" if timeframe == "1day" else "ME" if timeframe == "1week" else "QE"
        higher_close = close.resample(higher_frequency).last().reindex(close.index, method="ffill")
        higher_fast = compute_ema(higher_close, fast_ema)
        higher_slow = compute_ema(higher_close, slow_ema)
        entry_signal = (ema_fast > ema_slow) & (higher_fast > higher_slow) & (close > ema_fast)
        exit_signal = (ema_fast < ema_slow) | (higher_fast < higher_slow)
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
    elif strategy_id == "support_resistance_breakout":
        indicator_series = {f"Resistance {slow_ema}": prior_high, f"Support {slow_ema}": prior_low}
    elif strategy_id == "market_structure_break":
        indicator_series = {f"Structure high {fast_ema}": structure_high, f"Structure low {fast_ema}": structure_low, f"EMA {slow_ema}": ema_slow}
    elif strategy_id == "fibonacci_retracement":
        price_range = prior_high - prior_low
        indicator_series = {
            f"Fib 50 {slow_ema}": prior_high - (price_range * 0.50),
            f"Fib 61.8 {slow_ema}": prior_high - (price_range * 0.618),
            f"Fib 78.6 {slow_ema}": prior_high - (price_range * 0.786),
        }
    elif strategy_id == "price_action_reversal":
        indicator_series = {f"EMA {slow_ema}": ema_slow, f"Support {slow_ema}": prior_low}
    elif strategy_id == "supply_demand_zones":
        indicator_series = {f"Demand floor {slow_ema}": df["low"].shift(2).rolling(slow_ema, min_periods=slow_ema).min(), f"EMA {fast_ema}": ema_fast}
    elif strategy_id == "ict_liquidity_fvg":
        indicator_series = {f"Liquidity low {fast_ema}": structure_low, f"EMA {slow_ema}": ema_slow}
    elif strategy_id == "multi_timeframe_trend":
        higher_frequency = "W-FRI" if timeframe == "1day" else "ME" if timeframe == "1week" else "QE"
        higher_close = close.resample(higher_frequency).last().reindex(close.index, method="ffill")
        indicator_series = {f"EMA {fast_ema}": ema_fast, f"EMA {slow_ema}": ema_slow, f"Higher EMA {slow_ema}": compute_ema(higher_close, slow_ema)}

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
    trade_path: list[dict[str, float | str]] = []
    trade_counter = 1
    current_entry_amount = 0.0
    current_max_unrealized = 0.0
    current_min_unrealized = 0.0

    dates = df.index
    peak_equity = initial_capital

    for i in range(len(df)):
        dt_str = str(dates[i].strftime("%Y-%m-%d") if hasattr(dates[i], "strftime") else dates[i])
        curr_open = float(open_p.iloc[i])
        curr_close = float(close.iloc[i])

        if position > 0:
            marked_pnl = (curr_close - entry_price) * position
            current_max_unrealized = max(current_max_unrealized, marked_pnl)
            current_min_unrealized = min(current_min_unrealized, marked_pnl)
            trade_path.append({"trade_id": trade_counter, "date": dt_str, "entry_amount": current_entry_amount, "market_value": position * curr_close, "unrealized_pnl": marked_pnl, "realized_pnl": 0.0})

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
                    entry_amount=round(current_entry_amount, 2),
                    max_unrealized_pnl=round(current_max_unrealized, 2),
                    min_unrealized_pnl=round(current_min_unrealized, 2),
                )
            )
            if trade_path:
                trade_path[-1]["realized_pnl"] = round(net_pnl, 2)
            trades_pnl.append(net_pnl)
            trade_counter += 1

            position = 0.0
            entry_price = 0.0
            current_entry_amount = 0.0
            current_max_unrealized = 0.0
            current_min_unrealized = 0.0

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
            current_entry_amount = capital_to_invest
            current_max_unrealized = 0.0
            current_min_unrealized = 0.0

        # Calculate Portfolio Equity at Close of Bar i
        curr_equity = cash + (position * curr_close if position > 0 else 0.0)
        peak_equity = max(peak_equity, curr_equity)
        dd_pct = (curr_equity - peak_equity) / peak_equity if peak_equity > 0 else 0.0

        equity_points.append({"date": dt_str, "equity": round(curr_equity, 2)})
        drawdown_points.append({"date": dt_str, "drawdown": round(dd_pct * 100.0, 2)})

    # Convert equity curve to series for metric calculations
    equity_series = pd.Series([p["equity"] for p in equity_points], dtype=float)
    metrics = compute_metrics(equity_series, trades_pnl)

    run_id = f"bt_{uuid.uuid4().hex[:8]}"

    chart_candles: list[dict[str, float | str]] = [
        {"date": str(index.strftime("%Y-%m-%d") if hasattr(index, "strftime") else index), "open": float(open_p.iloc[i]), "high": float(df["high"].iloc[i]), "low": float(df["low"].iloc[i]), "close": float(close.iloc[i])}
        for i, index in enumerate(dates)
    ]
    chart_indicators: dict[str, list[dict[str, float | str | None]]] = {
        label: [{"date": chart_candles[i]["date"], "value": None if pd.isna(value) else float(value)} for i, value in enumerate(series)]
        for label, series in indicator_series.items()
    }
    chart_signals: list[dict[str, float | str]] = []
    for trade in trades:
        chart_signals.append({"date": trade.entry_date, "type": "entry", "price": trade.entry_price})
        chart_signals.append({"date": trade.exit_date, "type": "exit", "price": trade.exit_price})

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
        trade_path=trade_path,
    )
