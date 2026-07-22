"""Concrete integrations for external market-data services."""

from quant_research.data_providers.base import MarketDataProvider, MarketDataProviderError
from quant_research.data_providers.local_cache import LocalNseCacheProvider

__all__ = ["MarketDataProvider", "MarketDataProviderError", "LocalNseCacheProvider"]
