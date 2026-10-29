"""Historical next-session outcomes grouped by prior-only relative volume."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from statistics import mean, median
from typing import Literal

from quant_research.domain.data.models import OHLCVBar

VolumeBand = Literal["<1.0x", "1.0–1.5x", "1.5–2.0x", "2.0–3.0x", "≥3.0x"]
MomentumDirection = Literal["down", "flat", "up"]
RELATIVE_VOLUME_BANDS: tuple[VolumeBand, ...] = ("<1.0x", "1.0–1.5x", "1.5–2.0x", "2.0–3.0x", "≥3.0x")
MOMENTUM_DIRECTIONS: tuple[MomentumDirection, ...] = ("down", "flat", "up")
LOOKBACK_SESSIONS = 20
DIRECTION_CUTOFF = 0.005


def _direction(return_value: float) -> MomentumDirection:
    if return_value < -DIRECTION_CUTOFF:
        return "down"
    if return_value > DIRECTION_CUTOFF:
        return "up"
    return "flat"


def _volume_band(relative_volume: float) -> VolumeBand:
    if relative_volume < 1.0:
        return "<1.0x"
    if relative_volume < 1.5:
        return "1.0–1.5x"
    if relative_volume < 2.0:
        return "1.5–2.0x"
    if relative_volume < 3.0:
        return "2.0–3.0x"
    return "≥3.0x"


def _stats(returns: list[float]) -> dict[str, float | int | None]:
    count = len(returns)
    if not count:
        return {
            "observations": 0,
            "next_up_count": 0,
            "next_down_count": 0,
            "next_flat_count": 0,
            "next_up_rate": None,
            "next_down_rate": None,
            "average_next_return": None,
            "median_next_return": None,
        }
    up = sum(value > DIRECTION_CUTOFF for value in returns)
    down = sum(value < -DIRECTION_CUTOFF for value in returns)
    flat = count - up - down
    return {
        "observations": count,
        "next_up_count": up,
        "next_down_count": down,
        "next_flat_count": flat,
        "next_up_rate": up / count,
        "next_down_rate": down / count,
        "average_next_return": mean(returns),
        "median_next_return": median(returns),
    }


def analyze_volume_momentum(
    bars: list[OHLCVBar],
    *,
    symbol: str,
    start: date,
    end: date,
) -> dict[str, object]:
    """Summarize next-session returns for volume and same-day momentum groups.

    Relative volume for session ``t`` uses only the preceding 20 daily bars.
    A signal is included only when its next available NSE session is also on
    or before ``end``. Returns are close-to-close and are not corporate-action
    adjusted.
    """
    ordered_bars = sorted(bars, key=lambda bar: bar.timestamp)
    grouped: dict[tuple[VolumeBand, MomentumDirection], list[float]] = defaultdict(list)
    all_returns: list[float] = []
    excluded_insufficient_history = 0
    excluded_no_next_session = 0
    excluded_next_session_after_end = 0
    excluded_zero_volume_baseline = 0

    for index, signal_bar in enumerate(ordered_bars):
        signal_day = signal_bar.timestamp.date()
        if signal_day < start or signal_day > end:
            continue
        if index < LOOKBACK_SESSIONS:
            excluded_insufficient_history += 1
            continue
        if index + 1 >= len(ordered_bars):
            excluded_no_next_session += 1
            continue

        outcome_bar = ordered_bars[index + 1]
        outcome_day = outcome_bar.timestamp.date()
        if outcome_day > end:
            excluded_next_session_after_end += 1
            continue

        prior_close = ordered_bars[index - 1].close
        baseline_volume = mean(bar.volume for bar in ordered_bars[index - LOOKBACK_SESSIONS : index])
        if prior_close <= 0 or baseline_volume <= 0:
            excluded_zero_volume_baseline += 1
            continue

        same_day_return = signal_bar.close / prior_close - 1.0
        next_return = outcome_bar.close / signal_bar.close - 1.0
        band = _volume_band(signal_bar.volume / baseline_volume)
        direction = _direction(same_day_return)
        grouped[(band, direction)].append(next_return)
        all_returns.append(next_return)

    groups = [
        {
            "volume_band": band,
            "momentum_direction": direction,
            **_stats(grouped[(band, direction)]),
        }
        for band in RELATIVE_VOLUME_BANDS
        for direction in MOMENTUM_DIRECTIONS
    ]
    return {
        "symbol": symbol,
        "start": start,
        "end": end,
        "lookback_sessions": LOOKBACK_SESSIONS,
        "momentum_cutoff_pct": 0.5,
        "next_day_direction_cutoff_pct": 0.5,
        "overall": _stats(all_returns),
        "groups": groups,
        "excluded_insufficient_history": excluded_insufficient_history,
        "excluded_no_next_session": excluded_no_next_session,
        "excluded_next_session_after_end": excluded_next_session_after_end,
        "excluded_zero_volume_baseline": excluded_zero_volume_baseline,
        "notes": [
            "Descriptive historical behavior, not a forecast or a buy/sell signal.",
            "Relative volume compares the signal day with its preceding 20 sessions; the signal day is excluded from that average.",
            "Next-session returns use the next available daily NSE close and are not adjusted for corporate actions.",
            "OHLCV volume measures shares traded; it does not identify buyers versus sellers or institutional order flow.",
        ],
    }
