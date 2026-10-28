"""Deterministic scenario sampling over locally cached daily OHLCV bars."""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date
from math import isfinite

from quant_research.domain.data.models import OHLCVBar

SIMULATION_COUNT = 10_000


@dataclass(frozen=True, slots=True)
class ScenarioSummary:
    samples: int
    stop_loss: int
    target: int
    time_exit: int
    average_r: float
    median_r: float
    p05_exit_price: float
    median_exit_price: float
    p95_exit_price: float


@dataclass(frozen=True, slots=True)
class TimeMachineResult:
    symbol: str
    as_of_date: date
    entry_price: float
    stop_price: float
    target_price: float
    risk_per_share: float
    risk_pct: float
    target_r: float
    max_hold_sessions: int
    lookback_sessions: int
    simulations: int
    seed: int
    source_sessions: int
    data_start: date
    data_end: date
    monte_carlo: ScenarioSummary
    historical_outcomes: ScenarioSummary


def _percentile(values: list[float], fraction: float) -> float:
    position = (len(values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(values) - 1)
    weight = position - lower
    return values[lower] * (1 - weight) + values[upper] * weight


def _summary(exits: list[tuple[str, float, float]]) -> ScenarioSummary:
    prices = sorted(item[1] for item in exits)
    returns = sorted(item[2] for item in exits)
    count = len(exits)
    return ScenarioSummary(
        samples=count,
        stop_loss=sum(reason == "stop_loss" for reason, _, _ in exits),
        target=sum(reason == "target" for reason, _, _ in exits),
        time_exit=sum(reason == "time_exit" for reason, _, _ in exits),
        average_r=sum(returns) / count,
        median_r=_percentile(returns, 0.5),
        p05_exit_price=_percentile(prices, 0.05),
        median_exit_price=_percentile(prices, 0.5),
        p95_exit_price=_percentile(prices, 0.95),
    )


def _exit_for_path(
    entry_price: float,
    risk_per_share: float,
    target_r: float,
    bars: list[OHLCVBar],
) -> tuple[str, float]:
    stop_price = entry_price - risk_per_share
    target_price = entry_price + risk_per_share * target_r
    for bar in bars:
        if bar.open <= stop_price:
            return "stop_loss", bar.open
        if bar.open >= target_price:
            return "target", target_price
        stop_touched = bar.low <= stop_price
        target_touched = bar.high >= target_price
        if stop_touched and target_touched:
            return "stop_loss", stop_price
        if stop_touched:
            return "stop_loss", stop_price
        if target_touched:
            return "target", target_price
    return "time_exit", bars[-1].close


def _sample_bar(
    current_price: float,
    previous_close: float,
    bar: OHLCVBar,
) -> OHLCVBar:
    scale = current_price / previous_close
    return OHLCVBar(
        timestamp=bar.timestamp,
        symbol=bar.symbol,
        open=bar.open * scale,
        high=bar.high * scale,
        low=bar.low * scale,
        close=bar.close * scale,
        volume=bar.volume,
    )


def run_time_machine(
    *,
    bars: list[OHLCVBar],
    risk_pct: float = 1.0,
    target_r: float = 2.0,
    max_hold_sessions: int = 10,
    lookback_sessions: int = 60,
    seed: int = 19,
    entry_price: float | None = None,
) -> TimeMachineResult:
    """Sample past daily bar shapes and compare with a rolling fixed-rule history.

    The final bar is the as-of candle. It is used only as the default entry
    reference; sampled bars and historical outcomes use no later data.
    """
    required = lookback_sessions + max_hold_sessions + 1
    if len(bars) < required:
        raise ValueError(
            f"Local NSE daily history has {len(bars)} sessions; this run needs at least {required}. "
            "Import more history or reduce the lookback or holding period."
        )

    ordered = sorted(bars, key=lambda bar: bar.timestamp)
    if any(not all(isfinite(price) for price in (bar.open, bar.high, bar.low, bar.close)) for bar in ordered):
        raise ValueError("Local NSE daily history contains non-finite prices; repair or re-import the affected data.")
    reference_bar = ordered[-1]
    reference_price = entry_price if entry_price is not None else reference_bar.close
    risk_per_share = reference_price * risk_pct / 100
    stop_price = reference_price - risk_per_share
    target_price = reference_price + risk_per_share * target_r
    if (
        risk_per_share <= 0
        or stop_price <= 0
        or not all(isfinite(price) for price in (reference_price, risk_per_share, stop_price, target_price))
    ):
        raise ValueError("The entry and risk settings do not produce valid finite price levels.")

    pool_start = len(ordered) - lookback_sessions - 1
    sampled_bars = [
        (ordered[index - 1].close, ordered[index])
        for index in range(pool_start, len(ordered) - 1)
    ]

    rng = random.Random(seed)
    simulated_exits: list[tuple[str, float, float]] = []
    for _ in range(SIMULATION_COUNT):
        current_price = reference_price
        path: list[OHLCVBar] = []
        for _ in range(max_hold_sessions):
            previous_close, source_bar = rng.choice(sampled_bars)
            sampled = _sample_bar(current_price, previous_close, source_bar)
            path.append(sampled)
            current_price = sampled.close
        reason, exit_price = _exit_for_path(reference_price, risk_per_share, target_r, path)
        simulated_exits.append((reason, exit_price, (exit_price - reference_price) / risk_per_share))

    first_historical_entry = len(ordered) - lookback_sessions - max_hold_sessions
    historical_exits: list[tuple[str, float, float]] = []
    for index in range(first_historical_entry, len(ordered) - max_hold_sessions):
        historical_entry = ordered[index].close
        historical_risk = historical_entry * risk_pct / 100
        if historical_risk <= 0 or not isfinite(historical_risk):
            raise ValueError("Local NSE history cannot support the selected risk distance; check the cached prices.")
        future_bars = ordered[index + 1 : index + max_hold_sessions + 1]
        reason, exit_price = _exit_for_path(historical_entry, historical_risk, target_r, future_bars)
        historical_exits.append((reason, exit_price, (exit_price - historical_entry) / historical_risk))

    return TimeMachineResult(
        symbol=reference_bar.symbol,
        as_of_date=reference_bar.timestamp.date(),
        entry_price=reference_price,
        stop_price=stop_price,
        target_price=target_price,
        risk_per_share=risk_per_share,
        risk_pct=risk_pct,
        target_r=target_r,
        max_hold_sessions=max_hold_sessions,
        lookback_sessions=lookback_sessions,
        simulations=SIMULATION_COUNT,
        seed=seed,
        source_sessions=len(sampled_bars),
        data_start=sampled_bars[0][1].timestamp.date(),
        data_end=sampled_bars[-1][1].timestamp.date(),
        monte_carlo=_summary(simulated_exits),
        historical_outcomes=_summary(historical_exits),
    )
