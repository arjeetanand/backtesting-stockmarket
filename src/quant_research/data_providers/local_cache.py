"""Cache-only historical provider for free, repeatable NSE research."""

from __future__ import annotations

from datetime import datetime

from quant_research.data_providers.base import MarketDataProviderError
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache


class LocalNseCacheProvider:
    """Serves only locally imported official NSE daily data; it never calls Yahoo or a broker."""

    provider_name = "local_nse_cache"

    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        if timeframe != "1day":
            raise MarketDataProviderError("Only daily candles are available locally. Import official NSE daily data first.")
        bars = self._cache.get(symbol.strip().upper().removesuffix(".NS"), timeframe, start, end)
        if not bars:
            raise MarketDataProviderError(
                f"No local NSE data for {symbol.upper()} in the requested period. Open Data & Providers to import the missing range."
            )
        return bars
