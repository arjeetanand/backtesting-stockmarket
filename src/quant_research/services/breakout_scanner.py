"""Automated Breakout Setup Scanner service for technical pattern recognition."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import pandas as pd
import ta
import ta.momentum
import ta.trend
import ta.volatility

from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.market_scanner import NIFTY50_SYMBOLS, SECTOR_MAP
from quant_research.services.nse_import import SENSEX_NSE_STARTER


@dataclass(frozen=True, slots=True)
class BreakoutSetupItem:
    symbol: str
    company_name: str
    sector: str
    setup_type: str
    close: float
    rvol: float
    dist_52w_high: float
    rsi_14: float
    range_20d: float
    conviction_score: float
    description: str


class BreakoutScannerService:
    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def scan_breakouts(
        self,
        min_conviction: float = 50.0,
        limit: int = 50,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        all_instruments = {inst.symbol: inst for inst in self._cache.search_instruments(limit=2000)}
        cached_symbols = set(self._cache.get_available_symbols())
        setups: list[BreakoutSetupItem] = []

        summary = self._cache.summary()
        if end is None:
            end = summary.latest or datetime.now(tz=UTC)
        if start is None:
            start = summary.earliest or (end - timedelta(days=380))

        # Prioritize liquid NIFTY & Sensex symbols
        priority_symbols = set(NIFTY50_SYMBOLS).union(SENSEX_NSE_STARTER).union(all_instruments.keys())
        if cached_symbols:
            scan_symbols = sorted(priority_symbols.intersection(cached_symbols))
            if not scan_symbols:
                scan_symbols = sorted(cached_symbols)[:250]
        else:
            scan_symbols = sorted(priority_symbols)[:250]

        for sym in scan_symbols:
            bars = self._cache.get(sym, "1day", start, end)
            if not bars or len(bars) < 60:
                continue

            frame = pd.DataFrame([bar.model_dump() for bar in bars]).sort_values("timestamp").reset_index(drop=True)
            close = frame["close"]
            high = frame["high"]
            low = frame["low"]
            volume = frame["volume"]

            last_close = float(close.iloc[-1])
            last_vol = float(volume.iloc[-1])
            vol_sma_20 = float(ta.trend.sma_indicator(volume, window=20, fillna=False).iloc[-1] or 1.0)
            rvol = float(last_vol / vol_sma_20) if vol_sma_20 > 0 else 1.0

            high_52w = float(high.rolling(min(252, len(high)), min_periods=30).max().iloc[-1])
            dist_52w = float((high_52w - last_close) / high_52w) if high_52w > 0 else 1.0

            rsi_series = ta.momentum.rsi(close, window=14, fillna=False)
            rsi_val = float(rsi_series.iloc[-1]) if not rsi_series.isna().iloc[-1] else 50.0

            range_20 = float((high.rolling(20).max().iloc[-1] - low.rolling(20).min().iloc[-1]) / last_close)

            sma_20 = float(ta.trend.sma_indicator(close, window=20, fillna=False).iloc[-1] or last_close)
            sma_50 = float(ta.trend.sma_indicator(close, window=50, fillna=False).iloc[-1] or last_close)

            inst_info = all_instruments.get(sym)
            c_name = inst_info.company_name if inst_info else sym
            sector = SECTOR_MAP.get(sym, inst_info.industry if inst_info and inst_info.industry else "Other / Diversified")

            # Setup 1: 52-Week High Breakout + Volume Surge
            if dist_52w <= 0.04 and rvol >= 1.8:
                score = min(100.0, 60.0 + (rvol * 12.0) + ((0.04 - dist_52w) * 500))
                setups.append(
                    BreakoutSetupItem(
                        symbol=sym,
                        company_name=c_name,
                        sector=sector,
                        setup_type="52W High Breakout",
                        close=last_close,
                        rvol=round(rvol, 2),
                        dist_52w_high=round(dist_52w * 100, 2),
                        rsi_14=round(rsi_val, 1),
                        range_20d=round(range_20 * 100, 2),
                        conviction_score=round(score, 1),
                        description=f"Close within {round(dist_52w*100, 1)}% of 52W high with heavy volume surge ({round(rvol, 1)}x RVOL).",
                    )
                )

            # Setup 2: Volatility Contraction Pattern (VCP)
            elif range_20 <= 0.11 and rsi_val >= 55.0 and last_close >= sma_20:
                score = min(100.0, 65.0 + ((0.11 - range_20) * 300) + (rvol * 8))
                setups.append(
                    BreakoutSetupItem(
                        symbol=sym,
                        company_name=c_name,
                        sector=sector,
                        setup_type="VCP Contraction",
                        close=last_close,
                        rvol=round(rvol, 2),
                        dist_52w_high=round(dist_52w * 100, 2),
                        rsi_14=round(rsi_val, 1),
                        range_20d=round(range_20 * 100, 2),
                        conviction_score=round(score, 1),
                        description=f"Tight 20-day price consolidation ({round(range_20*100, 1)}% range) above 20-day SMA.",
                    )
                )

            # Setup 3: SMA Golden Rebound
            elif (last_close >= sma_20 or last_close >= sma_50) and float(close.iloc[-2]) < sma_20 and rvol >= 1.4:
                score = min(100.0, 55.0 + (rvol * 15.0) + (rsi_val * 0.3))
                setups.append(
                    BreakoutSetupItem(
                        symbol=sym,
                        company_name=c_name,
                        sector=sector,
                        setup_type="SMA Rebound",
                        close=last_close,
                        rvol=round(rvol, 2),
                        dist_52w_high=round(dist_52w * 100, 2),
                        rsi_14=round(rsi_val, 1),
                        range_20d=round(range_20 * 100, 2),
                        conviction_score=round(score, 1),
                        description=f"Price crossed above 20D SMA (₹{round(sma_20, 1)}) / 50D SMA (₹{round(sma_50, 1)}) with volume confirmation.",
                    )
                )

            # Setup 4: RSI Momentum Surge
            elif rsi_val >= 62.0 and float(rsi_series.iloc[-2] or 50.0) < 55.0 and rvol >= 1.3:
                score = min(100.0, 50.0 + (rsi_val * 0.5) + (rvol * 10.0))
                setups.append(
                    BreakoutSetupItem(
                        symbol=sym,
                        company_name=c_name,
                        sector=sector,
                        setup_type="RSI Surge",
                        close=last_close,
                        rvol=round(rvol, 2),
                        dist_52w_high=round(dist_52w * 100, 2),
                        rsi_14=round(rsi_val, 1),
                        range_20d=round(range_20 * 100, 2),
                        conviction_score=round(score, 1),
                        description=f"Fast RSI momentum expansion to {round(rsi_val, 1)} with expanding volume.",
                    )
                )

        filtered = [x for x in setups if x.conviction_score >= min_conviction]
        filtered.sort(key=lambda x: x.conviction_score, reverse=True)

        return {
            "total_candidates": len(filtered),
            "setups": [
                {
                    "symbol": item.symbol,
                    "company_name": item.company_name,
                    "sector": item.sector,
                    "setup_type": item.setup_type,
                    "close": item.close,
                    "rvol": item.rvol,
                    "dist_52w_high": item.dist_52w_high,
                    "rsi_14": item.rsi_14,
                    "range_20d": item.range_20d,
                    "conviction_score": item.conviction_score,
                    "description": item.description,
                }
                for item in filtered[:limit]
            ],
        }
