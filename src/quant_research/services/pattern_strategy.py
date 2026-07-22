"""Service for running pattern & breakout strategy analysis over historical market data."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


@dataclass(frozen=True, slots=True)
class PatternTrade:
    entry_date: str
    entry_price: float
    rvol: float
    dist_52w_high: float
    rsi_14: float
    max_high_15d: float
    max_return_pct: float
    final_return_pct: float
    is_true_positive: bool
    failure_reason: str | None


def analyze_symbol_pattern(
    db_path: Path,
    symbol: str,
    target_gain_pct: float = 20.0,
    rvol_threshold: float = 2.0,
    dist_52w_pct: float = 5.0,
    hold_days: int = 15,
) -> dict[str, Any]:
    """Extract historical setup triggers and analyze true vs false positive trades."""
    if not db_path.exists():
        raise FileNotFoundError(f"Database file not found at {db_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        "SELECT trading_day, payload FROM nse_bhavcopy_rows WHERE symbol = ? ORDER BY trading_day ASC",
        (symbol.upper(),),
    )
    rows = cursor.fetchall()
    conn.close()

    if not rows or len(rows) < 260:
        return {
            "symbol": symbol.upper(),
            "total_bars": len(rows),
            "error": "Insufficient historical data (minimum 1 year required).",
            "trades": [],
            "metrics": {},
        }

    records = []
    for day, p_str in rows:
        try:
            p = json.loads(p_str)
            c = float(p.get("CLOSE", 0))
            h = float(p.get("HIGH", 0))
            l = float(p.get("LOW", 0))
            v = float(p.get("TOTTRDQTY", 0))
            if c > 0 and v > 0:
                records.append({"date": day, "close": c, "high": h, "low": l, "volume": v})
        except (ValueError, TypeError, json.JSONDecodeError):
            continue

    df = pd.DataFrame(records)
    if df.empty or len(df) < 260:
        return {
            "symbol": symbol.upper(),
            "total_bars": len(df),
            "error": "Valid trading bars count insufficient.",
            "trades": [],
            "metrics": {},
        }

    df = df.sort_values("date").reset_index(drop=True)

    # Calculate indicators
    df["vol_sma_20"] = df["volume"].rolling(20).mean()
    df["rvol"] = df["volume"] / (df["vol_sma_20"] + 1e-6)
    df["high_52w"] = df["high"].rolling(252).max()
    df["dist_52w_pct"] = ((df["high_52w"] - df["close"]) / df["high_52w"]) * 100.0

    # RSI 14
    delta = df["close"].diff()
    gain = (delta.where(delta > 0, 0)).rolling(14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
    rs = gain / (loss + 1e-6)
    df["rsi_14"] = 100.0 - (100.0 / (1.0 + rs))

    target_decimal = target_gain_pct / 100.0
    dist_threshold = dist_52w_pct

    trades: list[dict[str, Any]] = []

    n = len(df)
    for i in range(252, n - hold_days):
        row = df.iloc[i]
        rvol = float(row["rvol"])
        dist_52w = float(row["dist_52w_pct"])
        c = float(row["close"])
        rsi = float(row["rsi_14"])

        # Strategy Trigger condition
        if rvol >= rvol_threshold and dist_52w <= dist_threshold:
            fwd_highs = df["high"].iloc[i + 1 : i + 1 + hold_days]
            fwd_closes = df["close"].iloc[i + 1 : i + 1 + hold_days]

            max_high = float(fwd_highs.max())
            final_close = float(fwd_closes.iloc[-1])

            max_return = (max_high - c) / c
            final_return = (final_close - c) / c

            is_true_pos = max_return >= target_decimal

            failure_reason = None
            if not is_true_pos:
                min_low = float(df["low"].iloc[i + 1 : i + 1 + hold_days].min())
                max_drop = (min_low - c) / c
                if max_drop < -0.08:
                    failure_reason = f"Severe Drawdown ({max_drop * 100:.1f}%)"
                elif max_return < 0.05:
                    failure_reason = f"No Momentum (Peak Gain only {max_return * 100:.1f}%)"
                else:
                    failure_reason = f"Stalled below target (Peak Gain {max_return * 100:.1f}%)"

            trades.append(
                {
                    "entry_date": str(row["date"]),
                    "entry_price": round(c, 2),
                    "rvol": round(rvol, 2),
                    "dist_52w_pct": round(dist_52w, 2),
                    "rsi_14": round(rsi, 1) if not np.isnan(rsi) else 50.0,
                    "max_high_15d": round(max_high, 2),
                    "max_return_pct": round(max_return * 100.0, 2),
                    "final_return_pct": round(final_return * 100.0, 2),
                    "is_true_positive": is_true_pos,
                    "failure_reason": failure_reason,
                }
            )

    total_triggers = len(trades)
    true_positives = sum(1 for t in trades if t["is_true_positive"])
    false_positives = total_triggers - true_positives
    hit_rate = (true_positives / total_triggers * 100.0) if total_triggers > 0 else 0.0

    avg_win_gain = (
        float(np.mean([t["max_return_pct"] for t in trades if t["is_true_positive"]]))
        if true_positives > 0
        else 0.0
    )
    avg_loss_return = (
        float(np.mean([t["final_return_pct"] for t in trades if not t["is_true_positive"]]))
        if false_positives > 0
        else 0.0
    )

    return {
        "symbol": symbol.upper(),
        "total_bars": len(df),
        "target_gain_pct": target_gain_pct,
        "rvol_threshold": rvol_threshold,
        "dist_52w_pct": dist_52w_pct,
        "hold_days": hold_days,
        "metrics": {
            "total_triggers": total_triggers,
            "true_positives": true_positives,
            "false_positives": false_positives,
            "hit_rate_pct": round(hit_rate, 2),
            "avg_win_gain_pct": round(avg_win_gain, 2),
            "avg_loss_return_pct": round(avg_loss_return, 2),
        },
        "trades": trades,
    }
