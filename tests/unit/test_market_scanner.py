from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import pytest

from quant_research.domain.backtesting.vector_engine import SUPPORTED_STRATEGY_IDS
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.market_scanner import MarketScannerService


def make_sample_bars(symbol: str, count: int = 150) -> list[OHLCVBar]:
    bars = []
    base_price = 500.0 if symbol == "RELIANCE" else 1200.0
    for i in range(count):
        close = base_price + i * 0.5 + np.sin(i / 5.0) * 10.0
        bars.append(
            OHLCVBar(
                timestamp=datetime(2023, 1, 1, tzinfo=UTC) + timedelta(days=i),
                symbol=symbol,
                open=close - 1.0,
                high=close + 3.0,
                low=close - 3.0,
                close=close,
                volume=500_000 + i * 1000,
            )
        )
    return bars


def test_market_scanner_service_run_scan(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "cache.sqlite3")
    bars1 = make_sample_bars("RELIANCE")
    bars2 = make_sample_bars("TCS")

    cache.put(bars1, "1day", "test")
    cache.put(bars2, "1day", "test")

    service = MarketScannerService(cache)
    result = service.run_scan(universe="nifty50", strategy_type="sma_crossover")

    assert result["universe"] == "nifty50"
    assert result["total_scanned"] == 2
    assert "sector_heatmap" in result
    assert "leaderboard" in result
    assert len(result["leaderboard"]) == 2


@pytest.mark.parametrize("strategy_id", SUPPORTED_STRATEGY_IDS)
def test_market_scanner_accepts_every_unified_strategy(tmp_path: Path, strategy_id: str) -> None:
    cache = SqliteMarketCache(tmp_path / f"{strategy_id}.sqlite3")
    cache.put(make_sample_bars("RELIANCE", count=180), "1day", "test")

    result = MarketScannerService(cache).run_scan(universe="nifty50", strategy_type=strategy_id)

    assert result["strategy_type"] == strategy_id
    assert result["total_scanned"] == 1
    assert result["leaderboard"][0]["symbol"] == "RELIANCE"
    assert "strategy_return" in result["leaderboard"][0]
