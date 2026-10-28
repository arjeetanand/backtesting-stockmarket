"""Market scanner service for multi-stock universe strategy evaluation & sector heatmap generation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import numpy as np
import pandas as pd

from quant_research.domain.backtesting.vector_engine import SUPPORTED_STRATEGY_IDS, run_rule_backtest
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.nse_import import SENSEX_NSE_STARTER

UniverseType = Literal["nifty50", "nifty500", "all"]
StrategyType = str

NIFTY50_AS_OF = "2026-10-28"
NIFTY50_SYMBOLS: set[str] = {
    "ADANIENT", "ADANIPORTS", "APOLLOHOSP", "ASIANPAINT", "AXISBANK", "BAJAJ-AUTO", "BAJAJFINSV", "BAJFINANCE",
    "BEL", "BHARTIARTL", "BSE", "CIPLA", "COALINDIA", "DRREDDY", "EICHERMOT", "ETERNAL", "GRASIM", "HCLTECH",
    "HDFCBANK", "HDFCLIFE", "HINDALCO", "HINDUNILVR", "ICICIBANK", "INDIGO", "INFY", "ITC", "JIOFIN", "JSWSTEEL",
    "KOTAKBANK", "LT", "M&M", "MARUTI", "MAXHEALTH", "NESTLEIND", "NTPC", "ONGC", "POWERGRID", "RELIANCE", "SBILIFE",
    "SBIN", "SHRIRAMFIN", "SUNPHARMA", "TATACONSUM", "TATASTEEL", "TCS", "TECHM", "TITAN", "TMPV", "TRENT", "ULTRACEMCO",
}

SECTOR_MAP: dict[str, str] = {
    "RELIANCE": "Energy & Oil", "BPCL": "Energy & Oil", "ONGC": "Energy & Oil", "IOC": "Energy & Oil", "COALINDIA": "Energy & Oil", "NTPC": "Power & Energy", "POWERGRID": "Power & Energy",
    "TCS": "IT & Software", "INFY": "IT & Software", "HCLTECH": "IT & Software", "WIPRO": "IT & Software", "TECHM": "IT & Software", "LTIM": "IT & Software", "PERSISTENT": "IT & Software", "COFORGE": "IT & Software",
    "HDFCBANK": "Banking & Financials", "ICICIBANK": "Banking & Financials", "SBIN": "Banking & Financials", "KOTAKBANK": "Banking & Financials", "AXISBANK": "Banking & Financials", "INDUSINDBK": "Banking & Financials", "BAJFINANCE": "Banking & Financials", "BAJAJFINSV": "Banking & Financials", "HDFCLIFE": "Banking & Financials", "SBILIFE": "Banking & Financials",
    "TATAMOTORS": "Automobile", "M&M": "Automobile", "MARUTI": "Automobile", "EICHERMOT": "Automobile", "HEROMOTOCO": "Automobile", "BAJAJ-AUTO": "Automobile", "TVSMOTOR": "Automobile",
    "SUNPHARMA": "Pharmaceuticals", "CIPLA": "Pharmaceuticals", "DRREDDY": "Pharmaceuticals", "DIVISLAB": "Pharmaceuticals", "APOLLOHOSP": "Pharmaceuticals", "LUPIN": "Pharmaceuticals", "MANKIND": "Pharmaceuticals",
    "ITC": "FMCG & Retail", "HINDUNILVR": "FMCG & Retail", "NESTLEIND": "FMCG & Retail", "BRITANNIA": "FMCG & Retail", "TATACONSUM": "FMCG & Retail", "ASIANPAINT": "FMCG & Retail", "TITAN": "FMCG & Retail", "TRENT": "FMCG & Retail",
    "TATASTEEL": "Metals & Mining", "JSWSTEEL": "Metals & Mining", "HINDALCO": "Metals & Mining", "JINDALSTEL": "Metals & Mining", "VEDL": "Metals & Mining",
    "LARSEN": "Capital Goods & Infra", "LT": "Capital Goods & Infra", "ULTRACEMCO": "Capital Goods & Infra", "ADANIENT": "Capital Goods & Infra", "ADANIPORTS": "Capital Goods & Infra", "BEL": "Capital Goods & Infra", "HAL": "Capital Goods & Infra",
    "BSE": "Financial Services", "INDIGO": "Services", "MAXHEALTH": "Healthcare", "TMPV": "Automobile",
    "BHARTIARTL": "Telecom & Media", "IDEA": "Telecom & Media"
}


@dataclass(frozen=True, slots=True)
class StockScanResult:
    symbol: str
    company_name: str
    sector: str
    bars: int
    strategy_return: float
    buy_hold_return: float
    win_rate: float
    max_drawdown: float
    sharpe_ratio: float
    trade_count: int


@dataclass(frozen=True, slots=True)
class SectorHeatmapItem:
    sector: str
    stock_count: int
    avg_strategy_return: float
    avg_buy_hold_return: float
    avg_win_rate: float
    avg_max_drawdown: float
    outperforming_count: int


class MarketScannerService:
    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def run_scan(
        self,
        universe: UniverseType = "nifty500",
        strategy_type: StrategyType = "sma_crossover",
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> dict[str, Any]:
        if strategy_type not in SUPPORTED_STRATEGY_IDS:
            raise ValueError(f"Unsupported strategy '{strategy_type}'. Choose one of: {', '.join(SUPPORTED_STRATEGY_IDS)}.")
        summary = self._cache.summary()
        all_instruments = {inst.symbol: inst for inst in self._cache.search_instruments(limit=2000)}
        cached_symbols = set(self._cache.get_available_symbols())

        if end is None:
            end = summary.latest or datetime.now(tz=UTC)
        if start is None:
            start = end - timedelta(days=500)

        # Determine target symbol set
        if universe == "nifty50":
            target_symbols = set(NIFTY50_SYMBOLS)
        elif universe == "nifty500":
            target_symbols = set(NIFTY50_SYMBOLS).union(SENSEX_NSE_STARTER)
            if len(target_symbols) < 150 and all_instruments:
                target_symbols.update(list(all_instruments.keys())[:150])
        else:
            target_symbols = set(NIFTY50_SYMBOLS).union(SENSEX_NSE_STARTER)

        if cached_symbols:
            scan_symbols = sorted(target_symbols.intersection(cached_symbols))
            if not scan_symbols:
                scan_symbols = sorted(cached_symbols)[:100]
        else:
            scan_symbols = sorted(target_symbols)[:100]

        results: list[StockScanResult] = []

        for sym in scan_symbols:
            bars = self._cache.get(sym, "1day", start, end)
            if not bars or len(bars) < 60:
                continue

            frame = pd.DataFrame([
                {
                    "date": bar.timestamp,
                    "open": bar.open,
                    "high": bar.high,
                    "low": bar.low,
                    "close": bar.close,
                    "volume": bar.volume,
                }
                for bar in bars
            ])
            try:
                engine_result = run_rule_backtest(
                    frame,
                    symbol=sym,
                    timeframe="1day",
                    strategy_id=strategy_type,
                    initial_capital=100_000.0,
                    commission_pct=0.001,
                    slippage_pct=0.0005,
                    position_size_pct=100.0,
                )
            except ValueError:
                continue

            first_close = float(frame["close"].iloc[0])
            last_close = float(frame["close"].iloc[-1])
            buy_hold_ret = (last_close / first_close) - 1.0 if first_close > 0 else 0.0

            inst_info = all_instruments.get(sym)
            c_name = inst_info.company_name if inst_info else sym
            sector = SECTOR_MAP.get(sym, inst_info.industry if inst_info and inst_info.industry else "Other / Diversified")

            results.append(
                StockScanResult(
                    symbol=sym,
                    company_name=c_name,
                    sector=sector,
                    bars=len(bars),
                    strategy_return=float(engine_result.metrics.total_return),
                    buy_hold_return=float(buy_hold_ret),
                    win_rate=float(engine_result.metrics.win_rate),
                    max_drawdown=float(abs(engine_result.metrics.max_drawdown)),
                    sharpe_ratio=float(engine_result.metrics.sharpe_ratio),
                    trade_count=int(engine_result.metrics.total_trades),
                )
            )

        # Sector Aggregation for Heatmap
        sector_groups: dict[str, list[StockScanResult]] = {}
        for res in results:
            sector_groups.setdefault(res.sector, []).append(res)

        heatmap_items: list[SectorHeatmapItem] = []
        for sec, items in sector_groups.items():
            avg_strat = float(np.mean([x.strategy_return for x in items]))
            avg_bh = float(np.mean([x.buy_hold_return for x in items]))
            avg_win = float(np.mean([x.win_rate for x in items]))
            avg_dd = float(np.mean([x.max_drawdown for x in items]))
            outperform = sum(1 for x in items if x.strategy_return >= x.buy_hold_return)

            heatmap_items.append(
                SectorHeatmapItem(
                    sector=sec,
                    stock_count=len(items),
                    avg_strategy_return=avg_strat,
                    avg_buy_hold_return=avg_bh,
                    avg_win_rate=avg_win,
                    avg_max_drawdown=avg_dd,
                    outperforming_count=outperform,
                )
            )

        heatmap_items.sort(key=lambda x: x.avg_strategy_return, reverse=True)

        return {
            "universe": universe,
            "strategy_type": strategy_type,
            "total_scanned": len(results),
            "sectors_count": len(heatmap_items),
            "sector_heatmap": [
                {
                    "sector": item.sector,
                    "stock_count": item.stock_count,
                    "avg_strategy_return": item.avg_strategy_return,
                    "avg_buy_hold_return": item.avg_buy_hold_return,
                    "avg_win_rate": item.avg_win_rate,
                    "avg_max_drawdown": item.avg_max_drawdown,
                    "outperforming_count": item.outperforming_count,
                }
                for item in heatmap_items
            ],
            "leaderboard": [
                {
                    "symbol": res.symbol,
                    "company_name": res.company_name,
                    "sector": res.sector,
                    "bars": res.bars,
                    "strategy_return": res.strategy_return,
                    "buy_hold_return": res.buy_hold_return,
                    "win_rate": res.win_rate,
                    "max_drawdown": res.max_drawdown,
                    "sharpe_ratio": res.sharpe_ratio,
                    "trade_count": res.trade_count,
                }
                for res in sorted(results, key=lambda x: x.strategy_return, reverse=True)
            ],
        }
