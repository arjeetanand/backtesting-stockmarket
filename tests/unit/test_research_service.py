from datetime import UTC, datetime, timedelta

import pytest

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.services.research import (
    MarketDataUnavailableError,
    ResearchService,
    SmaBacktestCommand,
)


class FakeMarketDataProvider:
    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        prices = [10, 9, 8, 9, 10, 12, 14, 13, 11, 9, 8, 9, 11, 13]
        return [
            OHLCVBar(
                timestamp=start + timedelta(days=index),
                symbol=symbol,
                open=price,
                high=price + 1,
                low=price - 1,
                close=price,
                volume=1_000,
            )
            for index, price in enumerate(prices)
        ]


def test_research_service_fetches_validates_runs_and_stores_backtest() -> None:
    start = datetime(2024, 1, 1, tzinfo=UTC)
    service = ResearchService(FakeMarketDataProvider(), InMemoryBacktestRepository())

    market_data = service.get_market_data("test", "1day", start, start + timedelta(days=20))
    result = service.run_sma_backtest(
        SmaBacktestCommand(
            symbol="test",
            start=start,
            end=start + timedelta(days=20),
            timeframe="1day",
            fast_window=2,
            slow_window=3,
            initial_capital=1_000.0,
            commission=0.0,
            slippage=0.0,
        )
    )

    assert market_data.quality.is_valid
    assert market_data.symbol == "TEST"
    assert service.get_backtest(result.run_id) == result
    assert service.list_backtests() == [result]


def test_research_service_requires_configured_provider() -> None:
    service = ResearchService(None, InMemoryBacktestRepository())
    start = datetime(2024, 1, 1, tzinfo=UTC)

    with pytest.raises(MarketDataUnavailableError):
        service.get_market_data("AAPL", "1day", start, start + timedelta(days=1))
