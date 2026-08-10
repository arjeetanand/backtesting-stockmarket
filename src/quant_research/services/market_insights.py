"""Local daily-market Insights and current screener orchestration."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Any, Literal

from quant_research.config.loader import load_scanner_catalog, load_universe_catalog, resolve_universe_symbols
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.market_scanner import SECTOR_MAP
from quant_research.services.screener_engine import (
    FormulaEvaluationStatus,
    InvalidFormulaParameterError,
    ScreenerEngineService,
    UnknownFormulaError,
)

InsightPeriod = Literal["1D", "1W", "1M", "3M"]


def _period_days(period: InsightPeriod) -> int:
    return {"1D": 1, "1W": 7, "1M": 30, "3M": 90}[period]


def _as_date(value: datetime | date | None) -> date | None:
    return value.date() if isinstance(value, datetime) else value


def _instrument_map(cache: SqliteMarketCache) -> dict[str, Any]:
    return {item.symbol: item for item in cache.search_instruments(limit=10_000)}


def _resolve_symbols(cache: SqliteMarketCache, universe_id: str) -> tuple[list[str], Any]:
    catalog = load_universe_catalog()
    definition = next((item for item in catalog.universes if item.universe_id == universe_id), None)
    if definition is None:
        raise ValueError(f"Unknown market universe '{universe_id}'. Choose one of: {', '.join(item.universe_id for item in catalog.universes)}.")
    symbols, _ = resolve_universe_symbols(definition, cache)
    return symbols, definition


def _sector(symbol: str, instruments: dict[str, Any]) -> str:
    item = instruments.get(symbol)
    return item.industry if item and item.industry else SECTOR_MAP.get(symbol, "Unclassified")


def build_insights(cache: SqliteMarketCache, universe_id: str, period: InsightPeriod) -> dict[str, Any]:
    symbols, definition = _resolve_symbols(cache, universe_id)
    instruments = _instrument_map(cache)
    summary = cache.summary()
    end = summary.latest or datetime.now(tz=UTC)
    cutoff = end - timedelta(days=_period_days(period))
    members: list[dict[str, Any]] = []
    missing = 0

    for symbol in symbols:
        bars = sorted(cache.get(symbol, "1day", end=end), key=lambda bar: bar.timestamp)
        latest = bars[-1] if bars else None
        reference = next((bar for bar in reversed(bars[:-1]) if bar.timestamp <= cutoff), None)
        if latest is None or reference is None or reference.close <= 0:
            missing += 1
            continue
        instrument = instruments.get(symbol)
        members.append({
            "symbol": symbol,
            "company_name": instrument.company_name if instrument else symbol,
            "sector": _sector(symbol, instruments),
            "return_fraction": (latest.close / reference.close) - 1.0,
            "data_as_of": latest.timestamp.date().isoformat(),
            "available": True,
        })

    members.sort(key=lambda item: float(item["return_fraction"]), reverse=True)
    gainers = sum(1 for item in members if item["return_fraction"] > 0)
    losers = sum(1 for item in members if item["return_fraction"] < 0)
    sectors: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for member in members:
        sectors[member["sector"]].append(member)
    sector_rows = []
    for name, items in sectors.items():
        values = [item["return_fraction"] for item in items]
        sector_rows.append({
            "sector": name,
            "return_fraction": sum(values) / len(values),
            "stock_count": len(items),
            "gainers": sum(1 for value in values if value > 0),
            "losers": sum(1 for value in values if value < 0),
            "unchanged": sum(1 for value in values if value == 0),
        })
    sector_rows.sort(key=lambda item: item["return_fraction"], reverse=True)
    coverage_status = "empty" if not members else "partial" if missing else "ready"
    return {
        "universe": universe_id,
        "universe_name": definition.name,
        "period": period,
        "data_as_of": max((str(item["data_as_of"]) for item in members), default=None),
        "coverage_status": coverage_status,
        "available_symbols": len(members),
        "missing_symbols": missing,
        "total_symbols": len(symbols),
        "breadth": {"gainers": gainers, "losers": losers, "unchanged": len(members) - gainers - losers, "advances": gainers, "declines": losers},
        "members": members,
        "sectors": sector_rows,
        "top_movers": sorted(members, key=lambda item: abs(item["return_fraction"]), reverse=True)[:20],
        "message": "Import official NSE daily archives for missing members." if missing else None,
    }


def catalog_response() -> dict[str, Any]:
    catalog = load_scanner_catalog()
    return {"schema_version": catalog.schema_version, "as_of": catalog.as_of, "data_boundary": catalog.data_boundary, "formulas": [
        {
            "id": item.formula_id,
            "name": item.name,
            "category": item.category,
            "description": item.description,
            "required_fields": item.required_fields,
            "parameters": [{"id": parameter.name, "label": parameter.name.replace("_", " ").title(), "type": "number" if parameter.type == "integer" else parameter.type, "default": parameter.default, "min": parameter.minimum, "max": parameter.maximum} for parameter in item.parameters],
            "timeframe": item.timeframe,
            "status": item.status,
        }
        for item in catalog.formulas
    ]}


def universe_response(cache: SqliteMarketCache) -> dict[str, Any]:
    catalog = load_universe_catalog()
    items = []
    for definition in catalog.universes:
        symbols, resolved = resolve_universe_symbols(definition, cache)
        items.append({"id": definition.universe_id, "label": definition.name, "description": definition.source, "constituent_count": len(symbols) or definition.membership.expected_members, "available_count": len(set(symbols).intersection(cache.get_available_symbols())), "as_of": definition.as_of, "coverage_status": "unavailable" if resolved == "unavailable" else "ready"})
    return {"as_of": catalog.as_of, "universes": items}


def run_current_screener(cache: SqliteMarketCache, universe_id: str, formula_id: str, parameters: dict[str, Any] | None, end: datetime | None = None) -> dict[str, Any]:
    symbols, definition = _resolve_symbols(cache, universe_id)
    engine = ScreenerEngineService(cache)
    try:
        results = engine.evaluate_many(symbols, formula_id, parameters or {}, end=end)
    except (UnknownFormulaError, InvalidFormulaParameterError):
        raise
    instruments = _instrument_map(cache)
    matches = []
    unavailable = 0
    for result in results:
        if result.status is FormulaEvaluationStatus.UNAVAILABLE:
            unavailable += 1
        if result.status is not FormulaEvaluationStatus.MATCHED:
            continue
        instrument = instruments.get(result.symbol)
        matches.append({"symbol": result.symbol, "company_name": instrument.company_name if instrument else result.symbol, "sector": _sector(result.symbol, instruments), "score": 1.0, "reason": result.message, "close": result.metrics.get("close"), "data_as_of": result.as_of.date().isoformat() if result.as_of else None})
    matches.sort(key=lambda item: str(item["symbol"]))
    return {"universe": universe_id, "formula_id": formula_id, "result_status": "empty" if not matches else "complete", "data_as_of": max((str(item["data_as_of"]) for item in matches), default=None), "coverage_status": "unavailable" if unavailable == len(results) else "partial" if unavailable else "complete", "available_symbols": len(results) - unavailable, "missing_symbols": unavailable, "total_matches": len(matches), "matches": matches, "definition": definition.name}
