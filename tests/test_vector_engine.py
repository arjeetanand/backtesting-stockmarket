"""Tests for Vectorized Backtest Engine, Analytics, and Validity Auditor."""

from __future__ import annotations

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

    # Metrics validation
    m = result.metrics
    assert isinstance(m.sharpe_ratio, float)
    assert isinstance(m.max_drawdown, float)
    assert m.win_rate >= 0.0 and m.win_rate <= 1.0


@pytest.mark.parametrize("strategy_id", ["sma_crossover", "ema_crossover", "rsi_mean_reversion", "bollinger_mean_reversion", "macd_crossover", "donchian_breakout", "momentum"])
def test_strategy_library_variants_execute(mock_ohlcv_data: pd.DataFrame, strategy_id: str) -> None:
    result = run_rule_backtest(df=mock_ohlcv_data, symbol="RELIANCE", strategy_id=strategy_id)

    assert result.final_equity > 0.0
    assert len(result.equity_curve) == len(mock_ohlcv_data)


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
