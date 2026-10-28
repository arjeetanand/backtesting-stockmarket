"""Daily OHLCV pressure estimates and candidate price-structure zones."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Literal

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.market_scanner import SECTOR_MAP
from quant_research.services.structure_zone_scanner import (
    MAX_ZONE_AGE_BARS,
    MIN_HISTORY_BARS,
    StructureZone,
    detect_latest_active_zones,
)

PRESSURE_SESSIONS = 20
RECENT_BARS = MAX_ZONE_AGE_BARS + MIN_HISTORY_BARS
MAX_SIDE_RESULTS = 20


@dataclass(frozen=True, slots=True)
class MarketFlowCandidate:
    symbol: str
    company_name: str
    sector: str
    close: float
    data_as_of: str
    average_daily_turnover_inr: float
    directional_pressure_inr: float
    pressure_score_pct: float
    bars_used: int


def _candidate(symbol: str, bars: list[OHLCVBar], company_name: str, sector: str) -> MarketFlowCandidate | None:
    if len(bars) < PRESSURE_SESSIONS:
        return None

    signed_turnover = 0.0
    total_turnover = 0.0
    latest = bars[-PRESSURE_SESSIONS:]
    for bar in latest:
        candle_range = bar.high - bar.low
        turnover = bar.close * bar.volume
        if candle_range <= 0 or turnover <= 0 or not math.isfinite(turnover):
            return None
        close_location = max(-1.0, min(1.0, (2 * bar.close - bar.high - bar.low) / candle_range))
        signed_turnover += close_location * turnover
        total_turnover += turnover

    if total_turnover <= 0:
        return None
    return MarketFlowCandidate(
        symbol=symbol,
        company_name=company_name,
        sector=sector,
        close=round(latest[-1].close, 6),
        data_as_of=latest[-1].timestamp.date().isoformat(),
        average_daily_turnover_inr=round(total_turnover / PRESSURE_SESSIONS, 2),
        directional_pressure_inr=round(signed_turnover, 2),
        pressure_score_pct=round(signed_turnover / total_turnover * 100, 2),
        bars_used=PRESSURE_SESSIONS,
    )


class MarketFlowScannerService:
    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def scan(self, symbols: list[str], selected_symbol: str | None = None) -> dict[str, object]:
        requested = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        bars_by_symbol = self._cache.get_recent_bars(requested, "1day", RECENT_BARS)
        instruments = {item.symbol: item for item in self._cache.search_instruments(limit=max(2_000, len(requested)))}
        candidates: list[MarketFlowCandidate] = []
        insufficient = 0
        for symbol, bars in bars_by_symbol.items():
            instrument = instruments.get(symbol)
            candidate = _candidate(
                symbol,
                bars,
                instrument.company_name if instrument else symbol,
                instrument.industry if instrument and instrument.industry else SECTOR_MAP.get(symbol, "Unclassified"),
            )
            if candidate is None:
                insufficient += 1
            else:
                candidates.append(candidate)

        buyers = sorted((item for item in candidates if item.directional_pressure_inr > 0), key=lambda item: (-item.directional_pressure_inr, item.symbol))[:MAX_SIDE_RESULTS]
        sellers = sorted((item for item in candidates if item.directional_pressure_inr < 0), key=lambda item: (item.directional_pressure_inr, item.symbol))[:MAX_SIDE_RESULTS]
        selected = selected_symbol.strip().upper().removesuffix(".NS") if selected_symbol else None
        if selected is None:
            selected = buyers[0].symbol if buyers else sellers[0].symbol if sellers else None
        available = len(bars_by_symbol)
        missing = len(requested) - available
        ranked = len(candidates)
        if ranked == 0:
            coverage_status: Literal["complete", "partial", "unavailable"] = "unavailable"
        elif missing or insufficient:
            coverage_status = "partial"
        else:
            coverage_status = "complete"

        return {
            "data_source": "official_nse_daily_ohlcv_local_cache",
            "data_as_of": max((item.data_as_of for item in candidates), default=None),
            "lookback_sessions": PRESSURE_SESSIONS,
            "requested_symbols": len(requested),
            "available_symbols": available,
            "ranked_symbols": ranked,
            "missing_symbols": missing,
            "insufficient_history_symbols": insufficient,
            "coverage_status": coverage_status,
            "buyers": [asdict(item) for item in buyers],
            "sellers": [asdict(item) for item in sellers],
            "selected": self.inspect_symbol(selected) if selected else None,
        }

    def inspect_symbol(self, symbol: str) -> dict[str, object]:
        clean_symbol = symbol.strip().upper().removesuffix(".NS")
        bars = self._cache.get_recent_bars([clean_symbol], "1day", RECENT_BARS).get(clean_symbol, [])
        instruments = self._cache.search_instruments(query=clean_symbol, limit=100)
        instrument = next((item for item in instruments if item.symbol == clean_symbol), None)
        company_name = instrument.company_name if instrument else clean_symbol
        sector = instrument.industry if instrument and instrument.industry else SECTOR_MAP.get(clean_symbol, "Unclassified")
        if not bars:
            return {
                "symbol": clean_symbol,
                "company_name": company_name,
                "sector": sector,
                "status": "missing",
                "close": None,
                "data_as_of": None,
                "zones": [],
            }
        zones: list[StructureZone] = detect_latest_active_zones(
            bars,
            symbol=clean_symbol,
            company_name=company_name,
            sector=sector,
        )
        return {
            "symbol": clean_symbol,
            "company_name": company_name,
            "sector": sector,
            "status": "ready" if len(bars) >= MIN_HISTORY_BARS else "insufficient_history",
            "close": bars[-1].close,
            "data_as_of": bars[-1].timestamp.date().isoformat(),
            "zones": [asdict(zone) for zone in zones],
        }
