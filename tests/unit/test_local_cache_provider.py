from datetime import UTC, datetime
from pathlib import Path

import pytest

from quant_research.data_providers.base import MarketDataProviderError
from quant_research.data_providers.local_cache import LocalNseCacheProvider
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache


def test_local_nse_cache_provider_never_uses_an_upstream_source(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.put(
        [OHLCVBar(timestamp=datetime(2025, 1, 2, tzinfo=UTC), symbol="RELIANCE", open=100, high=105, low=99, close=102, volume=1_000)],
        "1day",
        "nse_common_bhavcopy",
    )
    provider = LocalNseCacheProvider(cache)

    bars = provider.get_ohlcv("RELIANCE.NS", "1day", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 3, tzinfo=UTC))

    assert provider.provider_name == "local_nse_cache"
    assert bars[0].symbol == "RELIANCE"
    with pytest.raises(MarketDataProviderError, match="Open Data & Providers"):
        provider.get_ohlcv("INFY", "1day", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 3, tzinfo=UTC))
    with pytest.raises(MarketDataProviderError, match="Only daily candles"):
        provider.get_ohlcv("RELIANCE", "1h", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 3, tzinfo=UTC))
