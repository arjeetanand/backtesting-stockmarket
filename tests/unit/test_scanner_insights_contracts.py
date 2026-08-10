from datetime import UTC, datetime, timedelta
from pathlib import Path

from quant_research.api.routes.api import create_api_router
from quant_research.api.schemas import ScreenerRunRequest
from quant_research.config import load_scanner_catalog, load_universe_catalog
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.repositories.market_cache import Instrument, SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService
from quant_research.services.research import ResearchService


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def _router(cache: SqliteMarketCache, screener_runner: object | None = None):
    return create_api_router(
        ResearchService(None, InMemoryBacktestRepository()),
        HypothesisService(StubLlm()),
        market_cache=cache,
        screener_runner=screener_runner,
    )


def _endpoint(router, suffix: str):
    return next(route.endpoint for route in router.routes if route.path.endswith(suffix))


def _put_bars(cache: SqliteMarketCache, symbol: str, count: int = 70) -> None:
    bars = []
    for index in range(count):
        close = 100.0 + index
        bars.append(
            OHLCVBar(
                timestamp=datetime(2025, 1, 1, tzinfo=UTC) + timedelta(days=index),
                symbol=symbol,
                open=close - 1,
                high=close + 2,
                low=close - 2,
                close=close,
                volume=10_000 + index,
            )
        )
    cache.put(bars, "1day", "nse_common_bhavcopy")


def test_checked_in_catalogs_validate_and_use_ohlcv_only() -> None:
    catalog = load_scanner_catalog()
    universes = load_universe_catalog()

    assert catalog.data_boundary == "official_nse_daily_ohlcv"
    assert len({formula.formula_id for formula in catalog.formulas}) == len(catalog.formulas)
    assert all(set(formula.required_fields) <= {"open", "high", "low", "close", "volume"} for formula in catalog.formulas)
    assert {universe.universe_id for universe in universes.universes} == {"nifty50", "sensex", "banknifty", "nifty500"}
    assert all(universe.as_of for universe in universes.universes)


def test_catalog_and_universe_endpoints_expose_appendable_contract(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    _put_bars(cache, "RELIANCE")
    router = _router(cache)

    catalog = _endpoint(router, "/screeners/catalog")()
    universes = _endpoint(router, "/screeners/universes")()

    assert catalog.formulas
    assert catalog.formulas[0].required_fields
    assert {item.universe_id for item in universes} == {"nifty50", "sensex", "banknifty", "nifty500"}
    nifty500 = next(item for item in universes if item.universe_id == "nifty500")
    assert nifty500.membership_status == "unavailable"
    assert nifty500.available_members == 0


def test_insights_uses_local_daily_bars_and_reports_missing_members(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.replace_instruments(
        [Instrument("RELIANCE", "Reliance Industries Ltd.", "Oil & Gas", "EQ", "INE002A01018")],
        universe="nse_equities",
        source="official-nse",
    )
    _put_bars(cache, "RELIANCE")
    response = _endpoint(_router(cache), "/insights/{universe}")("nifty50", "1w")

    assert response.result_status == "partial"
    assert response.coverage_status == "partial"
    assert response.available_symbols == ["RELIANCE"]
    assert "TCS" in response.missing_symbols
    assert response.stocks[0].sector == "Oil & Gas"
    assert response.stocks[0].return_pct > 0
    assert response.sectors[0].sector == "Oil & Gas"
    assert response.data_as_of == datetime(2025, 1, 1, tzinfo=UTC).date() + timedelta(days=69)


class FakeScreenerRunner:
    def run(self, *, request: ScreenerRunRequest, symbols: list[str], cache: SqliteMarketCache) -> dict[str, object]:
        assert request.formula_id == "price_above_sma"
        assert "RELIANCE" in symbols
        return {"result_status": "complete", "message": "test run", "matches": [{"symbol": "RELIANCE"}]}


def test_screener_run_delegates_evaluation_through_clean_boundary(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    _put_bars(cache, "RELIANCE")
    response = _endpoint(_router(cache, FakeScreenerRunner()), "/screeners/run")(
        ScreenerRunRequest(universe="nifty50", formula_id="price_above_sma")
    )

    assert response.result_status == "complete"
    assert response.matches[0]["symbol"] == "RELIANCE"
    assert response.coverage_status == "partial"


def test_screener_run_uses_local_engine_when_no_runner_is_injected(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    _put_bars(cache, "RELIANCE")

    response = _endpoint(_router(cache), "/screeners/run")(
        ScreenerRunRequest(universe="nifty50", formula_id="price_above_sma")
    )

    assert response.result_status in {"complete", "empty"}
    assert response.available_members == 1
    assert "RELIANCE" not in response.missing_symbols
