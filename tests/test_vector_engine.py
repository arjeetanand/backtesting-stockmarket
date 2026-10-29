"""Tests for Vectorized Backtest Engine, Analytics, and Validity Auditor."""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from quant_research.domain.backtesting.vector_engine import run_rule_backtest
from quant_research.domain.indicators.calculator import compute_ema, compute_rsi, compute_sma
from quant_research.domain.robustness.diagnostics import analyze_robustness
from quant_research.domain.validity.auditor import audit_validity


@pytest.fixture
def mock_ohlcv_data() -> pd.DataFrame:
    """Generate deterministic sample OHLCV dataset for testing."""
    dates = pd.date_range(start="2022-01-01", periods=300, freq="D")
    np.random.seed(42)
    daily_returns = np.random.normal(loc=0.0008, scale=0.012, size=300)
    close_prices = 100.0 * np.exp(np.cumsum(daily_returns))

    return pd.DataFrame(
        {
            "open": close_prices * 0.998,
            "high": close_prices * 1.005,
            "low": close_prices * 0.995,
            "close": close_prices,
            "volume": np.random.randint(1000, 100000, size=300),
        },
        index=dates,
    )


def test_indicator_calculations(mock_ohlcv_data: pd.DataFrame) -> None:
    """Verify RSI, SMA, and EMA indicators output valid values."""
    close = mock_ohlcv_data["close"]
    sma = compute_sma(close, window=20)
    ema = compute_ema(close, window=20)
    rsi = compute_rsi(close, window=14)

    assert len(sma) == len(close)
    assert len(ema) == len(close)
    assert len(rsi) == len(close)

    # RSI bounded between 0 and 100
    assert rsi.min() >= 0.0
    assert rsi.max() <= 100.0


def test_vector_backtest_execution(mock_ohlcv_data: pd.DataFrame) -> None:
    """Verify vectorized backtest executes trades and computes metrics cleanly."""
    result = run_rule_backtest(
        df=mock_ohlcv_data,
        symbol="NIFTY 50",
        rsi_period=14,
        rsi_oversold=40.0,
        rsi_overbought=60.0,
        fast_ema=10,
        slow_ema=30,
        initial_capital=100000.0,
        commission_pct=0.001,
        slippage_pct=0.0005,
    )

    assert result.run_id.startswith("bt_")
    assert result.symbol == "NIFTY 50"
    assert result.initial_capital == 100000.0
    assert result.final_equity > 0.0
    assert len(result.equity_curve) == len(mock_ohlcv_data)
    assert len(result.drawdown_curve) == len(mock_ohlcv_data)
    assert len(result.candles) == len(mock_ohlcv_data)
    assert "EMA 10" in result.indicators

    # Metrics validation
    m = result.metrics
    assert isinstance(m.sharpe_ratio, float)
    assert isinstance(m.max_drawdown, float)
    assert m.win_rate >= 0.0 and m.win_rate <= 1.0


def test_chart_candles_preserve_real_volume(mock_ohlcv_data: pd.DataFrame) -> None:
    result = run_rule_backtest(df=mock_ohlcv_data, symbol="RELIANCE", fast_ema=10, slow_ema=30)

    assert [candle["volume"] for candle in result.candles] == mock_ohlcv_data["volume"].astype(float).tolist()


def test_chart_candles_are_sorted_and_valid(mock_ohlcv_data: pd.DataFrame) -> None:
    result = run_rule_backtest(df=mock_ohlcv_data.iloc[::-1], symbol="RELIANCE", fast_ema=10, slow_ema=30)

    dates = [str(candle["date"]) for candle in result.candles]
    assert dates == sorted(dates)
    assert dates == [index.strftime("%Y-%m-%d") for index in mock_ohlcv_data.sort_index().index]

    for candle in result.candles:
        open_price = float(candle["open"])
        high_price = float(candle["high"])
        low_price = float(candle["low"])
        close_price = float(candle["close"])
        volume = float(candle["volume"])
        assert all(math.isfinite(value) for value in (open_price, high_price, low_price, close_price, volume))
        assert open_price > 0.0 and close_price > 0.0
        assert high_price >= max(open_price, close_price)
        assert low_price <= min(open_price, close_price)
        assert volume >= 0.0


@pytest.mark.parametrize("strategy_id", [
    "sma_crossover",
    "ema_crossover",
    "rsi_mean_reversion",
    "bollinger_mean_reversion",
    "macd_crossover",
    "donchian_breakout",
    "momentum",
    "support_resistance_breakout",
    "market_structure_break",
    "fibonacci_retracement",
    "price_action_reversal",
    "supply_demand_zones",
    "ict_liquidity_fvg",
    "multi_timeframe_trend",
])
def test_strategy_library_variants_execute(mock_ohlcv_data: pd.DataFrame, strategy_id: str) -> None:
    result = run_rule_backtest(df=mock_ohlcv_data, symbol="RELIANCE", strategy_id=strategy_id)

    assert result.final_equity > 0.0
    assert len(result.equity_curve) == len(mock_ohlcv_data)


def test_fixed_trade_amount_and_chart_signals(mock_ohlcv_data: pd.DataFrame) -> None:
    result = run_rule_backtest(
        df=mock_ohlcv_data,
        symbol="RELIANCE",
        strategy_id="sma_crossover",
        fast_ema=10,
        slow_ema=30,
        initial_capital=100000.0,
        position_size_amount=5000.0,
        stop_loss_pct=0.02,
        take_profit_pct=0.04,
    )

    assert len(result.candles) == len(mock_ohlcv_data)
    assert "SMA 10" in result.indicators
    assert "SMA 30" in result.indicators
    assert all(signal["type"] in {"entry", "exit"} for signal in result.signals)
    assert all(
        {"id", "date", "type", "price", "trade_id"}.issubset(signal)
        and signal["id"] == f"trade-{signal['trade_id']}-{signal['type']}"
        for signal in result.signals
    )
    assert all("unrealized_pnl" in point for point in result.trade_path)


def test_trade_profit_and_return_include_both_commissions(mock_ohlcv_data: pd.DataFrame) -> None:
    commission_pct = 0.001
    result = run_rule_backtest(
        df=mock_ohlcv_data,
        symbol="RELIANCE",
        strategy_id="sma_crossover",
        fast_ema=10,
        slow_ema=30,
        initial_capital=100000.0,
        commission_pct=commission_pct,
        slippage_pct=0.0,
        position_size_amount=5000.0,
    )

    assert result.trades
    for trade in result.trades:
        shares = trade.entry_amount / trade.entry_price
        gross_pnl = (trade.exit_price - trade.entry_price) * shares
        expected_net_pnl = gross_pnl - trade.entry_amount * commission_pct - trade.exit_price * shares * commission_pct
        # The API rounds fill prices and committed capital to cents, so a small
        # difference is expected when rebuilding P&L from the displayed fields.
        assert trade.pnl == pytest.approx(expected_net_pnl, abs=0.5)
        assert trade.return_pct == pytest.approx(expected_net_pnl / trade.entry_amount * 100.0, abs=0.1)


def test_open_position_at_period_end_is_reported_with_mark_to_market_pnl() -> None:
    closes = [100.0] * 10 + [101.0, 103.0, 105.0, 107.0, 109.0, 111.0, 113.0, 115.0, 117.0]
    dates = pd.date_range("2025-01-01", periods=len(closes), freq="D")
    frame = pd.DataFrame(
        {
            "open": closes,
            "high": [value + 1.0 for value in closes],
            "low": [value - 1.0 for value in closes],
            "close": closes,
            "volume": [1000.0] * len(closes),
        },
        index=dates,
    )

    result = run_rule_backtest(
        df=frame,
        symbol="RELIANCE",
        strategy_id="sma_crossover",
        fast_ema=2,
        slow_ema=5,
        initial_capital=50000.0,
        commission_pct=0.001,
        slippage_pct=0.0,
        position_size_amount=5000.0,
    )

    assert result.trades == []
    assert result.open_position is not None
    assert result.open_position.as_of_date == dates[-1].strftime("%Y-%m-%d")
    assert result.open_position.entry_date < result.open_position.as_of_date
    expected_mark_to_market = result.open_position.market_value - result.open_position.entry_amount - result.open_position.entry_amount * 0.001
    assert result.open_position.unrealized_pnl == pytest.approx(expected_mark_to_market, abs=0.05)


def test_robustness_diagnostics(mock_ohlcv_data: pd.DataFrame) -> None:
    """Verify parameter sensitivity grid, Monte Carlo, and stress test scenarios."""
    report = analyze_robustness(
        df=mock_ohlcv_data,
        symbol="NIFTY 50",
        lookback_range=[10, 14, 20],
        threshold_range=[30.0, 35.0],
    )

    assert report.aggregate_score >= 0 and report.aggregate_score <= 100
    assert len(report.sensitivity_grid) == 6  # 3 * 2 grid
    assert report.monte_carlo.num_simulations == 1000
    assert len(report.stress_tests) == 3


def test_validity_auditor(mock_ohlcv_data: pd.DataFrame) -> None:
    """Verify bias and validity auditor generates warnings and health scores."""
    bt_result = run_rule_backtest(df=mock_ohlcv_data, symbol="NIFTY 50")
    audit = audit_validity(bt_result)

    assert audit.health_score >= 0 and audit.health_score <= 100
    assert audit.overall_status in ["PASS", "WARNING", "CRITICAL"]
    assert audit.trade_sample_status in ["SUFFICIENT", "INSUFFICIENT"]
