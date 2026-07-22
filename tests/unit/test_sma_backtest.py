from datetime import UTC, datetime, timedelta

import pandas as pd

from quant_research.services.sma_backtest import run_sma_crossover_backtest


def test_sma_backtest_executes_on_bar_after_crossover() -> None:
    prices = [10, 9, 8, 9, 10, 12, 14, 13, 11, 9, 8, 9, 11, 13]
    start = datetime(2024, 1, 1, tzinfo=UTC)
    data = pd.DataFrame(
        [
            {
                "timestamp": start + timedelta(days=index),
                "symbol": "TEST",
                "open": price,
                "high": price + 1,
                "low": price - 1,
                "close": price,
                "volume": 1_000,
            }
            for index, price in enumerate(prices)
        ]
    )

    result = run_sma_crossover_backtest(
        data, symbol="TEST", fast_window=2, slow_window=3, initial_capital=1_000.0
    )

    assert result.trades
    assert result.trades[0].entry_timestamp == start + timedelta(days=5)
    assert result.trades[0].slippage == 0.0
    assert result.metrics["trade_count"] == float(len(result.trades))
    assert result.config["execution_model"] == "signal_at_close_execute_next_open"
    assert any("look-ahead" in warning for warning in result.warnings)
