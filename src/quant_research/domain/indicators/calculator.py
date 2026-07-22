"""Vectorized Technical Indicators Calculator."""

from __future__ import annotations

import pandas as pd


def compute_sma(series: pd.Series[float], window: int) -> pd.Series[float]:
    """Compute Simple Moving Average."""
    return series.rolling(window=window, min_periods=window).mean()


def compute_ema(series: pd.Series[float], window: int) -> pd.Series[float]:
    """Compute Exponential Moving Average."""
    return series.ewm(span=window, adjust=False).mean()


def compute_rsi(series: pd.Series[float], window: int = 14) -> pd.Series[float]:
    """Compute Relative Strength Index (RSI)."""
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -1.0 * delta.clip(upper=0.0)

    avg_gain = gain.ewm(alpha=1.0 / window, min_periods=window, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / window, min_periods=window, adjust=False).mean()

    rs = avg_gain / (avg_loss + 1e-10)
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return rsi.fillna(50.0)


def compute_macd(
    series: pd.Series[float],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[pd.Series[float], pd.Series[float], pd.Series[float]]:
    """Compute MACD line, signal line, and histogram."""
    fast_ema = compute_ema(series, fast)
    slow_ema = compute_ema(series, slow)
    macd_line = fast_ema - slow_ema
    signal_line = compute_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def compute_bollinger_bands(
    series: pd.Series[float], window: int = 20, num_std: float = 2.0
) -> tuple[pd.Series[float], pd.Series[float], pd.Series[float]]:
    """Compute Bollinger Bands (middle, upper, lower)."""
    middle = compute_sma(series, window)
    std = series.rolling(window=window, min_periods=window).std()
    upper = middle + (std * num_std)
    lower = middle - (std * num_std)
    return middle, upper, lower


def compute_atr(
    high: pd.Series[float],
    low: pd.Series[float],
    close: pd.Series[float],
    window: int = 14,
) -> pd.Series[float]:
    """Compute Average True Range (ATR)."""
    prev_close = close.shift(1)
    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()

    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1.0 / window, min_periods=window, adjust=False).mean()
    return atr
