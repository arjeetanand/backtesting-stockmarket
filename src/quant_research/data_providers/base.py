"""Provider contracts shared by all concrete market-data integrations."""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from quant_research.domain.data.models import OHLCVBar


class MarketDataProviderError(RuntimeError):
    """Raised when a market-data integration cannot fulfil a request."""


class MarketDataProvider(Protocol):
    """Contract implemented by a source of historical OHLCV bars."""

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]: ...
