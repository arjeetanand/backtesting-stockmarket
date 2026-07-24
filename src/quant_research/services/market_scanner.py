"""Market scanner service for multi-stock universe strategy evaluation & sector heatmap generation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import numpy as np
import pandas as pd

from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.nse_import import SENSEX_NSE_STARTER

UniverseType = Literal["nifty50", "nifty500", "all"]
StrategyType = Literal["sma_crossover", "rsi_reversion", "breakout"]

NIFTY50_SYMBOLS: set[str] = {
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "BHARTIARTL", "ITC", "SBIN", "LTIM", "LARSEN",
    "KOTAKBANK", "AXISBANK", "HCLTECH", "ADANIENT", "SUNPHARMA", "TATAMOTORS", "NTPC", "TATASTEEL",
    "POWERGRID", "ULTRACEMCO", "TITAN", "BAJFINANCE", "M&M", "MARUTI", "ASIANPAINT", "ONGC",
    "JSWSTEEL", "ADANIPORTS", "COALINDIA", "BAJAJFINSV", "BPCL", "EICHERMOT", "GRASIM", "HEROMOTOCO",
    "HINDALCO", "HINDUNILVR", "INDUSINDBK", "CIPLA", "DRREDDY", "APOLLOHOSP", "DIVISLAB", "SBI LIFE",
    "HDFCLIFE", "WIPRO", "TECHM", "NESTLEIND", "TATACONSUM", "BRITANNIA", "BEL"
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
            if not bars or len(bars) < 30:
                continue

            close = np.array([b.close for b in bars], dtype=float)
            open_prices = np.array([b.open for b in bars], dtype=float)
            high_prices = np.array([b.high for b in bars], dtype=float)
            n_bars = len(close)

            # Strategy Signal Calculation
            if strategy_type == "sma_crossover":
                fast_sma = pd.Series(close).rolling(20, min_periods=20).mean().values
                slow_sma = pd.Series(close).rolling(50, min_periods=50).mean().values
                signals = np.where(fast_sma > slow_sma, 1, 0)
            elif strategy_type == "rsi_reversion":
                delta = pd.Series(close).diff()
                gain = delta.clip(lower=0.0).rolling(14, min_periods=14).mean()
                loss = (-delta.clip(upper=0.0)).rolling(14, min_periods=14).mean()
                rs = gain / loss.replace(0.0, np.nan)
                rsi = 100.0 - (100.0 / (1.0 + rs))
                signals = np.where(rsi < 35, 1, np.where(rsi > 70, 0, np.nan))
                # Forward fill positions
                s_series = pd.Series(signals).ffill().fillna(0)
                signals = s_series.values
            else:  # breakout
                sma_20 = pd.Series(close).rolling(20, min_periods=20).mean().values
                high_52w = pd.Series(high_prices).rolling(250, min_periods=50).max().values
                signals = np.where((close >= high_52w * 0.98) & (close > sma_20), 1, 0)

            # Vectorized Return Simulation
            trades: list[float] = []
            position = 0
            entry_p = 0.0

            for i in range(1, n_bars - 1):
                sig = signals[i]
                if position == 0 and sig == 1:
                    position = 1
                    entry_p = open_prices[i + 1]
                elif position == 1 and sig == 0:
                    position = 0
                    exit_p = open_prices[i + 1]
                    ret = (exit_p / entry_p) - 1.0 if entry_p > 0 else 0.0
                    trades.append(ret)

            buy_hold_ret = (close[-1] / close[0]) - 1.0 if close[0] > 0 else 0.0
            strat_ret = sum(trades) if trades else 0.0
            win_rate = float(np.mean([1 if t > 0 else 0 for t in trades])) if trades else 0.0

            # Drawdown calculation
            cumulative = np.cumprod(1.0 + np.array(trades)) if trades else np.array([1.0])
            peak = np.maximum.accumulate(cumulative)
            drawdowns = (cumulative - peak) / peak
            max_dd = float(abs(np.min(drawdowns))) if len(drawdowns) > 0 else 0.0

            # Sharpe Ratio
            if trades and len(trades) > 1:
                std_dev = float(np.std(trades))
                sharpe = float(np.mean(trades) / std_dev * np.sqrt(252)) if std_dev > 0 else 0.0
            else:
                sharpe = 0.0

            inst_info = all_instruments.get(sym)
            c_name = inst_info.company_name if inst_info else sym
            sector = SECTOR_MAP.get(sym, inst_info.industry if inst_info and inst_info.industry else "Other / Diversified")

            results.append(
                StockScanResult(
                    symbol=sym,
                    company_name=c_name,
                    sector=sector,
                    bars=n_bars,
                    strategy_return=float(strat_ret),
                    buy_hold_return=float(buy_hold_ret),
                    win_rate=float(win_rate),
                    max_drawdown=float(max_dd),
                    sharpe_ratio=float(sharpe),
                    trade_count=len(trades),
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
