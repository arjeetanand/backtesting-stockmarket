"""Optional TradingAgents debate over a completed, local NSE analysis."""

from __future__ import annotations

import json
import math
import os
from datetime import date
from importlib import import_module
from typing import Any


class TradingAgentsUnavailableError(RuntimeError):
    """The optional provider has not been configured."""


class TradingAgentsReviewError(RuntimeError):
    """The provider could not finish a review."""


def model_name() -> str:
    return os.getenv("TRADINGAGENTS_MODEL", "gpt-6-luna").strip() or "gpt-6-luna"


_TECHNICAL_FIELDS = (
    "close", "sma20", "sma50", "sma200", "rsi14", "macd", "macd_signal",
    "macd_histogram", "atr14", "atr14_pct", "prior20_high", "prior20_low",
    "high_52w", "low_52w", "volume_ratio_20", "return_1m_pct", "return_3m_pct",
    "return_1y_pct", "return_3y_pct",
)
_METRIC_FIELDS = (
    "trades", "wins", "losses", "win_rate_pct", "profit_factor", "expectancy_pct",
    "total_return_pct", "max_drawdown_pct", "bars", "signal_occurrences",
)


def _numbers(source: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {
        key: value for key in fields
        if (value := source.get(key)) is None
        or (type(value) in (int, float) and math.isfinite(value))
    }


def _run_debate(evidence: dict[str, Any], model: str, api_key: str) -> dict[str, str]:
    try:
        agents = import_module("tradingagents.agents")
        create_llm_client = import_module("tradingagents.llm_clients").create_llm_client
    except ImportError:
        raise TradingAgentsUnavailableError(
            "TradingAgents is not installed. Run uv sync --extra dev --extra tradingagents."
        ) from None

    kwargs: dict[str, Any] = {
        "api_key": api_key, "timeout": 30, "max_retries": 0, "max_tokens": 1500,
    }
    if model.startswith(("gpt-5", "gpt-6", "o1", "o3", "o4")):
        kwargs["reasoning_effort"] = "low"
    llm = create_llm_client("openai", model=model, **kwargs).get_llm()
    state: dict[str, Any] = {
        "company_of_interest": evidence["symbol"],
        "trade_date": evidence["data_as_of"],
        "asset_type": "stock",
        "instrument_context": (
            f"NSE instrument {evidence['symbol']}; currency INR. "
            f"All evidence ends on {evidence['data_as_of']}, not necessarily today. "
            "Use only the supplied local NSE daily archive evidence. Do not search, "
            "call external tools, invent facts, or treat stale data as current. "
            "News, sentiment and fundamentals are unavailable. Historical returns "
            "are simulations and do not establish future returns. This is a research "
            "review requiring human judgment; it cannot place orders or approve trades."
        ),
        "market_report": json.dumps(evidence, allow_nan=False),
        "sentiment_report": "",
        "news_report": "",
        "fundamentals_report": "",
        "investment_debate_state": {
            "history": "", "bull_history": "", "bear_history": "",
            "current_response": "", "count": 0,
        },
    }
    for factory in (agents.create_bull_researcher, agents.create_bear_researcher, agents.create_research_manager):
        state.update(factory(llm)(state))
    return {
        "bull_case": state["investment_debate_state"]["bull_history"].strip(),
        "bear_case": state["investment_debate_state"]["bear_history"].strip(),
        "review": state["investment_plan"].strip(),
    }


def review_stock_analysis(analysis: dict[str, Any]) -> dict[str, Any]:
    """Review public market summaries only; never send the full saved artifact."""
    if (
        analysis.get("run_status") != "completed"
        or not analysis.get("symbol")
        or not analysis.get("data_as_of")
        or not isinstance(analysis.get("technical"), dict)
        or not analysis["technical"]
    ):
        raise ValueError("Complete a stock analysis with local NSE data before requesting an AI review.")
    date.fromisoformat(analysis["data_as_of"])
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise TradingAgentsUnavailableError("Set OPENAI_API_KEY on the backend to enable AI review.")
    model = model_name()
    evidence: dict[str, Any] = {
        "symbol": analysis["symbol"],
        "data_as_of": analysis["data_as_of"],
        "data_source": "Local NSE daily archive cache",
        "technical": _numbers(analysis["technical"], _TECHNICAL_FIELDS),
    }
    for field in ("history_start", "history_years", "bar_count", "data_age_days"):
        evidence[field] = analysis.get(field)
    for field in ("training_metrics", "out_of_sample_metrics"):
        metrics = analysis.get(field) or {}
        evidence[field] = _numbers(metrics, _METRIC_FIELDS)
        for period in ("period_start", "period_end"):
            evidence[field][period] = metrics.get(period)
    gate = analysis.get("validation_gate") or {}
    evidence["validation_status"] = gate.get("status", "not_evaluable")
    evidence["setup_status"] = (analysis.get("setup") or {}).get("status")
    try:
        result = _run_debate(evidence, model, api_key)
        if any(not isinstance(result.get(key), str) or not result[key].strip()
               for key in ("bull_case", "bear_case", "review")):
            raise TradingAgentsReviewError("TradingAgents returned an incomplete review. Try again.")
    except TradingAgentsUnavailableError:
        raise
    except Exception:
        raise TradingAgentsReviewError(
            "TradingAgents could not complete the review. Check the backend API key, "
            "model access, network and usage limits, then try again."
        ) from None
    return {"symbol": evidence["symbol"], "data_as_of": evidence["data_as_of"], "model": model, **result}
