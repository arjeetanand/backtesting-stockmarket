"""Independent daily-bar price-structure zone scan over the local NSE cache."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.market_scanner import SECTOR_MAP

ZoneDirection = Literal["bullish", "bearish"]
ZoneState = Literal["untested", "retested", "testing"]

SWING_WINDOW = 20
ATR_WINDOW = 14
IMPULSE_ATR_MULTIPLE = 1.25
OPPOSING_CANDLE_LOOKBACK = 3
MAX_ZONE_AGE_BARS = 60
MIN_HISTORY_BARS = max(SWING_WINDOW + 2, ATR_WINDOW + 1)


@dataclass(frozen=True, slots=True)
class StructureZone:
    symbol: str
    company_name: str
    sector: str
    direction: ZoneDirection
    zone_low: float
    zone_high: float
    source_candle_date: str
    confirmed_date: str
    data_as_of: str
    break_level: float
    impulse_atr: float
    close: float
    distance_pct: float
    touch_sessions: int
    bars_since_confirmation: int
    state: ZoneState


@dataclass(frozen=True, slots=True)
class _ZoneEvent:
    direction: ZoneDirection
    source_index: int
    confirmation_index: int
    zone_low: float
    zone_high: float
    break_level: float
    impulse_atr: float


def _true_ranges(bars: list[OHLCVBar]) -> list[float]:
    result: list[float] = []
    for index, bar in enumerate(bars):
        candle_range = bar.high - bar.low
        if index == 0:
            result.append(candle_range)
        else:
            previous_close = bars[index - 1].close
            result.append(max(candle_range, abs(bar.high - previous_close), abs(bar.low - previous_close)))
    return result


def _opposing_candle(bars: list[OHLCVBar], confirmation_index: int, direction: ZoneDirection) -> int | None:
    first_index = max(0, confirmation_index - OPPOSING_CANDLE_LOOKBACK)
    for index in range(confirmation_index - 1, first_index - 1, -1):
        bar = bars[index]
        if direction == "bullish" and bar.close < bar.open:
            return index
        if direction == "bearish" and bar.close > bar.open:
            return index
    return None


def _zone_events(bars: list[OHLCVBar]) -> list[_ZoneEvent]:
    ranges = _true_ranges(bars)
    events: list[_ZoneEvent] = []

    for index in range(max(SWING_WINDOW + 1, ATR_WINDOW), len(bars)):
        current = bars[index]
        previous = bars[index - 1]
        prior_high = max(bar.high for bar in bars[index - SWING_WINDOW : index])
        prior_low = min(bar.low for bar in bars[index - SWING_WINDOW : index])
        prior_range_high = max(bar.high for bar in bars[index - SWING_WINDOW - 1 : index - 1])
        prior_range_low = min(bar.low for bar in bars[index - SWING_WINDOW - 1 : index - 1])
        atr = sum(ranges[index - ATR_WINDOW : index]) / ATR_WINDOW
        candle_range = current.high - current.low
        if atr <= 0 or candle_range <= 0:
            continue

        body = abs(current.close - current.open)
        impulse_atr = body / atr
        close_location = (current.close - current.low) / candle_range
        direction: ZoneDirection | None = None
        break_level = 0.0

        if (
            current.close > current.open
            and current.close > prior_high
            and previous.close <= prior_range_high
            and close_location >= 0.75
        ):
            direction = "bullish"
            break_level = prior_high
        elif (
            current.close < current.open
            and current.close < prior_low
            and previous.close >= prior_range_low
            and close_location <= 0.25
        ):
            direction = "bearish"
            break_level = prior_low

        if direction is None or impulse_atr < IMPULSE_ATR_MULTIPLE:
            continue

        source_index = _opposing_candle(bars, index, direction)
        if source_index is None:
            continue
        source = bars[source_index]
        events.append(
            _ZoneEvent(
                direction=direction,
                source_index=source_index,
                confirmation_index=index,
                zone_low=source.low,
                zone_high=source.high,
                break_level=break_level,
                impulse_atr=impulse_atr,
            )
        )

    return events


def detect_latest_active_zones(
    bars: list[OHLCVBar], *, symbol: str, company_name: str | None = None, sector: str | None = None
) -> list[StructureZone]:
    """Return the latest still-valid daily zone per direction, if one is recent."""
    ordered = sorted(bars, key=lambda bar: bar.timestamp)
    if len(ordered) < MIN_HISTORY_BARS:
        return []

    latest = ordered[-1]
    if latest.close <= 0:
        return []

    events = [
        event
        for event in _zone_events(ordered)
        if len(ordered) - 1 - event.confirmation_index <= MAX_ZONE_AGE_BARS
    ]
    found: list[StructureZone] = []
    for direction in ("bullish", "bearish"):
        for event in reversed(events):
            if event.direction != direction:
                continue

            after_confirmation = ordered[event.confirmation_index + 1 :]
            if direction == "bullish":
                invalidated = any(bar.close < event.zone_low for bar in after_confirmation)
            else:
                invalidated = any(bar.close > event.zone_high for bar in after_confirmation)
            if invalidated:
                continue

            touch_bars = [bar for bar in after_confirmation if bar.low <= event.zone_high and bar.high >= event.zone_low]
            is_testing = (
                len(ordered) - 1 > event.confirmation_index
                and latest.low <= event.zone_high
                and latest.high >= event.zone_low
            )
            if is_testing:
                state: ZoneState = "testing"
            elif touch_bars:
                state = "retested"
            else:
                state = "untested"

            if latest.close < event.zone_low:
                distance_pct = (event.zone_low - latest.close) / latest.close * 100.0
            elif latest.close > event.zone_high:
                distance_pct = (latest.close - event.zone_high) / latest.close * 100.0
            else:
                distance_pct = 0.0

            found.append(
                StructureZone(
                    symbol=symbol,
                    company_name=company_name or symbol,
                    sector=sector or "Unclassified",
                    direction=direction,
                    zone_low=round(event.zone_low, 6),
                    zone_high=round(event.zone_high, 6),
                    source_candle_date=ordered[event.source_index].timestamp.date().isoformat(),
                    confirmed_date=ordered[event.confirmation_index].timestamp.date().isoformat(),
                    data_as_of=latest.timestamp.date().isoformat(),
                    break_level=round(event.break_level, 6),
                    impulse_atr=round(event.impulse_atr, 3),
                    close=round(latest.close, 6),
                    distance_pct=round(distance_pct, 3),
                    touch_sessions=len(touch_bars),
                    bars_since_confirmation=len(ordered) - 1 - event.confirmation_index,
                    state=state,
                )
            )
            break

    return found


class StructureZoneScannerService:
    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def scan(self, symbols: list[str]) -> dict[str, object]:
        summary = self._cache.summary()
        anchor = summary.latest or datetime.now(tz=UTC)
        start = anchor - timedelta(days=365)
        end = anchor + timedelta(days=1)
        instruments = {item.symbol: item for item in self._cache.search_instruments(limit=2_000)}
        cached_symbols = set(self._cache.get_available_symbols())
        requested_symbols = sorted(set(symbols))
        available_symbols = [symbol for symbol in requested_symbols if symbol in cached_symbols]
        missing_symbols = [symbol for symbol in requested_symbols if symbol not in cached_symbols]
        insufficient_history_symbols: list[str] = []
        zones: list[StructureZone] = []
        scanned_symbols = 0

        for symbol in available_symbols:
            bars = self._cache.get(symbol, "1day", start, end)
            if len(bars) < MIN_HISTORY_BARS:
                insufficient_history_symbols.append(symbol)
                continue
            scanned_symbols += 1
            instrument = instruments.get(symbol)
            zones.extend(
                detect_latest_active_zones(
                    bars,
                    symbol=symbol,
                    company_name=instrument.company_name if instrument else symbol,
                    sector=(instrument.industry if instrument and instrument.industry else SECTOR_MAP.get(symbol, "Unclassified")),
                )
            )

        zones.sort(key=lambda zone: (zone.confirmed_date, -zone.distance_pct, zone.symbol, zone.direction), reverse=True)
        if not available_symbols:
            coverage_status = "unavailable"
        elif missing_symbols or insufficient_history_symbols:
            coverage_status = "partial"
        else:
            coverage_status = "complete"

        return {
            "data_as_of": summary.latest.date().isoformat() if summary.latest else None,
            "requested_symbols": len(requested_symbols),
            "available_symbols": len(available_symbols),
            "scanned_symbols": scanned_symbols,
            "missing_symbols": missing_symbols,
            "insufficient_history_symbols": insufficient_history_symbols,
            "coverage_status": coverage_status,
            "total_zones": len(zones),
            "zones": [asdict(zone) for zone in zones],
        }
