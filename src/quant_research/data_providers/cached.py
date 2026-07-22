"""Cache-first provider that prevents repeated requests for the same history."""

from __future__ import annotations

from datetime import datetime

from quant_research.data_providers.base import MarketDataProvider
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache


class CachedMarketDataProvider:
    def __init__(self, upstream: MarketDataProvider, cache: SqliteMarketCache) -> None:
        self._upstream = upstream
        self._cache = cache

    @property
    def provider_name(self) -> str:
        return f"local_cache + {getattr(self._upstream, 'provider_name', 'upstream')}"

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        cached = self._cache.get(symbol, timeframe, start, end)
        if cached:
            return cached
        bars = self._upstream.get_ohlcv(symbol, timeframe, start, end)
        self._cache.put(bars, timeframe, source=getattr(self._upstream, "provider_name", "upstream"))
        return bars
