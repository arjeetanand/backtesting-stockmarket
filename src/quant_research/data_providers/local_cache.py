"""Cache-only historical provider for free, repeatable NSE research."""

from __future__ import annotations

from datetime import datetime
from typing import cast

import pandas as pd

from quant_research.data_providers.base import MarketDataProviderError
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache


class LocalNseCacheProvider:
    """Serves only locally imported official NSE daily data; it never calls Yahoo or a broker."""

    provider_name = "local_nse_cache"

    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        clean_symbol = symbol.strip().upper().removesuffix(".NS")
        if timeframe not in {"1day", "1week", "1month"}:
            raise MarketDataProviderError("Only daily candles are stored in the official NSE archive; weekly and monthly views are derived locally. Choose a supported timeframe or connect an intraday provider.")
        bars = self._cache.get(clean_symbol, "1day", start, end)
        if not bars:
            raise MarketDataProviderError(
                f"No local NSE data for {symbol.upper()} in the requested period. Open Data & Providers to import the missing range."
            )
        if timeframe == "1day":
            return bars
        frame = pd.DataFrame([bar.model_dump() for bar in bars]).set_index("timestamp").sort_index()
        rule = "W-FRI" if timeframe == "1week" else "ME"
        grouped = frame.resample(rule, label="right", closed="right").agg({"symbol": "last", "open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}).dropna(subset=["open", "close"])
        return [OHLCVBar(timestamp=pd.Timestamp(cast(datetime, timestamp)).to_pydatetime(), symbol=clean_symbol, open=float(row.open), high=float(row.high), low=float(row.low), close=float(row.close), volume=float(row.volume)) for timestamp, row in grouped.iterrows()]
