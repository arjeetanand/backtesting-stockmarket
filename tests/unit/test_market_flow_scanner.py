from datetime import UTC, datetime, timedelta
from pathlib import Path

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import MarketFlowScanRequest
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import Instrument, SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.market_flow_scanner import _candidate
from quant_research.services.research import ResearchService


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def daily_bars(symbol: str, close: float, count: int = 20) -> list[OHLCVBar]:
    start = datetime(2025, 1, 1, tzinfo=UTC)
    return [
        OHLCVBar(
            timestamp=start + timedelta(days=index),
            symbol=symbol,
            open=100,
            high=102,
            low=98,
            close=close,
            volume=1_000,
        )
        for index in range(count)
    ]


def test_pressure_proxy_uses_close_location_weighted_by_daily_turnover() -> None:
    buyers = _candidate("BUY", daily_bars("BUY", 101.9), "Buyer Ltd", "Industrials")
    sellers = _candidate("SELL", daily_bars("SELL", 98.1), "Seller Ltd", "Industrials")

    assert buyers is not None and sellers is not None
    assert buyers.pressure_score_pct > 0
    assert sellers.pressure_score_pct < 0
    assert buyers.directional_pressure_inr > 0
    assert sellers.directional_pressure_inr < 0
    assert buyers.bars_used == 20


def test_market_flow_scan_ranks_all_catalogue_symbols_and_inspects_selected_symbol(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    buyers = [f"BUY{index:02}" for index in range(22)]
    bars = [bar for index, symbol in enumerate(buyers) for bar in daily_bars(symbol, 100.2 + index * 0.08)]
    bars.extend(daily_bars("SELL", 98.1))
    cache.put(bars, "1day", "official-nse-test")
    cache.replace_instruments(
        [Instrument(symbol, f"{symbol} Ltd", "Industrials", "EQ", None) for symbol in [*buyers, "SELL"]],
        universe="nse_equities",
        source="official-nse-test",
    )

    router = create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
    )
    endpoint = next(route.endpoint for route in router.routes if route.path.endswith("/market-flow/scan"))

    response = endpoint(MarketFlowScanRequest(universe="all", selected_symbol="BUY21.NS"))

    assert response.coverage_status == "complete"
    assert response.requested_symbols == response.ranked_symbols == 23
    assert len(response.buyers) == 20
    assert response.buyers[0].symbol == "BUY21"
    assert response.buyers[-1].symbol == "BUY02"
    assert response.sellers[0].symbol == "SELL"
    assert response.selected is not None
    assert response.selected.symbol == "BUY21"
    assert response.selected.status == "insufficient_history"
