from __future__ import annotations

import json
import sys
from types import ModuleType, SimpleNamespace
from typing import Any

import pytest

from quant_research.services import trading_agents


@pytest.fixture
def analysis() -> dict[str, Any]:
    return {
        "run_status": "completed", "symbol": "RELIANCE", "data_as_of": "2026-10-28",
        "history_start": "2020-01-01", "bar_count": 1500, "history_years": 6.8,
        "data_age_days": 20, "technical": {"close": 100.0, "rsi14": 60.0},
        "setup": {
            "status": "stale_data", "direction": "long_only", "entry_trigger": 101.0,
            "stop_loss": 95.0, "target_1r": 107.0, "target_2r": 113.0,
            "risk_per_share": 6.0, "reasons": ["Refresh the stale candle before using these levels."],
            "exit_rules": ["Exit at the stop first if both daily extremes touch."],
            "level_note": "Illustrative levels; a next-open gap changes actual risk.",
        },
        "validation_gate": {"status": "failed", "reasons": ["Only 12 out-of-sample trades; at least 30 required."]},
        "out_of_sample_metrics": {"trades": 12, "win_rate_pct": 50.0},
    }


def test_debate_calls_real_factory_contract_and_filters_payload(
    monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any],
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-private-key")
    monkeypatch.setenv("TRADINGAGENTS_MODEL", "gpt-6-luna")
    analysis.update({"chart": ["private-chart"], "trades": ["private-trade"], "account": "private-account"})
    analysis["technical"]["private"] = "private-value"
    analysis["out_of_sample_metrics"]["account"] = "private-metric"
    analysis["setup"]["account"] = "private-setup"
    analysis["validation_gate"]["account"] = "private-gate"
    agents = ModuleType("tradingagents.agents")
    clients = ModuleType("tradingagents.llm_clients")
    calls: list[str] = []
    llm = object()

    def client(provider: str, **kwargs: Any) -> Any:
        assert provider == "openai"
        assert kwargs == {
            "model": "gpt-6-luna", "api_key": "test-private-key", "timeout": 30,
            "max_retries": 0, "max_tokens": 1500, "reasoning_effort": "low",
        }
        return SimpleNamespace(get_llm=lambda: llm)

    def factory(role: str) -> Any:
        def create(model: Any) -> Any:
            assert model is llm

            def run(state: dict[str, Any]) -> dict[str, Any]:
                calls.append(role)
                report = state["market_report"]
                assert "private-" not in report
                evidence = json.loads(report)
                assert evidence["data_as_of"] == "2026-10-28"
                assert evidence["data_age_days"] == 20
                assert evidence["setup_status"] == "stale_data"
                assert evidence["validation_status"] == "failed"
                assert evidence["validation_reasons"] == ["Only 12 out-of-sample trades; at least 30 required."]
                assert evidence["setup"]["entry_trigger"] == 101.0
                assert evidence["setup"]["stop_loss"] == 95.0
                assert evidence["setup"]["target_2r"] == 113.0
                assert evidence["setup"]["reasons"] == analysis["setup"]["reasons"]
                assert evidence["setup"]["exit_rules"] == analysis["setup"]["exit_rules"]
                assert evidence["setup"]["level_note"] == analysis["setup"]["level_note"]
                assert "stale data" in state["instrument_context"]
                assert state["news_report"] == state["sentiment_report"] == state["fundamentals_report"] == ""
                debate = dict(state["investment_debate_state"])
                if role == "manager":
                    assert debate["count"] == 2
                    assert debate["bull_history"] == "Bull evidence"
                    assert debate["bear_history"] == "Bear evidence"
                    return {"investment_plan": "Review limitations", "investment_debate_state": debate}
                debate[f"{role}_history"] = f"{role.capitalize()} evidence"
                debate["count"] += 1
                return {"investment_debate_state": debate}

            return run
        return create

    agents.create_bull_researcher = factory("bull")  # type: ignore[attr-defined]
    agents.create_bear_researcher = factory("bear")  # type: ignore[attr-defined]
    agents.create_research_manager = factory("manager")  # type: ignore[attr-defined]
    clients.create_llm_client = client  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "tradingagents", ModuleType("tradingagents"))
    monkeypatch.setitem(sys.modules, "tradingagents.agents", agents)
    monkeypatch.setitem(sys.modules, "tradingagents.llm_clients", clients)
    result = trading_agents.review_stock_analysis(analysis)
    assert calls == ["bull", "bear", "manager"]
    assert result == {
        "symbol": "RELIANCE", "data_as_of": "2026-10-28", "model": "gpt-6-luna",
        "bull_case": "Bull evidence", "bear_case": "Bear evidence", "review": "Review limitations",
    }


@pytest.mark.parametrize("change", [
    {"run_status": "failed"}, {"technical": None}, {"technical": {}},
    {"data_as_of": None}, {"data_as_of": "invalid"},
])
def test_incomplete_analysis_is_rejected(analysis: dict[str, Any], change: dict[str, Any]) -> None:
    analysis.update(change)
    with pytest.raises(ValueError):
        trading_agents.review_stock_analysis(analysis)


def test_missing_key_is_actionable(monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any]) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(trading_agents.TradingAgentsUnavailableError, match="OPENAI_API_KEY"):
        trading_agents.review_stock_analysis(analysis)


def test_missing_optional_package_is_actionable(monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any]) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    def missing_package(name: str) -> Any:
        raise ImportError("not installed")

    monkeypatch.setattr(trading_agents, "import_module", missing_package)
    with pytest.raises(trading_agents.TradingAgentsUnavailableError, match="uv sync"):
        trading_agents.review_stock_analysis(analysis)


def test_provider_error_does_not_expose_credentials(monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any]) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "private-secret")

    def fail(*args: Any) -> Any:
        raise RuntimeError("request Authorization: private-secret")

    monkeypatch.setattr(trading_agents, "_run_debate", fail)
    with pytest.raises(trading_agents.TradingAgentsReviewError) as exc:
        trading_agents.review_stock_analysis(analysis)
    assert "private-secret" not in str(exc.value)
    assert "usage limits" in str(exc.value)


def test_incomplete_provider_response_is_rejected(monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any]) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setattr(trading_agents, "_run_debate", lambda *args: {"bull_case": "", "bear_case": "x", "review": "x"})
    with pytest.raises(trading_agents.TradingAgentsReviewError):
        trading_agents.review_stock_analysis(analysis)


def test_installed_upstream_agents_with_fake_transport(
    monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any],
) -> None:
    pytest.importorskip("tradingagents.agents")
    clients = pytest.importorskip("tradingagents.llm_clients")
    monkeypatch.setenv("OPENAI_API_KEY", "test-offline-key")
    prompts: list[str] = []

    class FakeLLM:
        def invoke(self, prompt: str) -> Any:
            prompts.append(prompt)
            return SimpleNamespace(content="Price evidence is limited to the saved NSE date.")

        def with_structured_output(self, schema: Any) -> Any:
            def invoke(prompt: str) -> Any:
                prompts.append(prompt)
                return schema(
                    recommendation="Hold",
                    rationale="The saved data is stale and the validation gate failed.",
                    strategic_actions="Refresh local data and review the evidence before any decision.",
                )
            return SimpleNamespace(invoke=invoke)

    monkeypatch.setattr(clients, "create_llm_client", lambda *args, **kwargs: SimpleNamespace(get_llm=FakeLLM))
    result = trading_agents.review_stock_analysis(analysis)
    assert len(prompts) == 3
    assert "Bull Analyst" in result["bull_case"]
    assert "Bear Analyst" in result["bear_case"]
    assert "**Recommendation**: Hold" in result["review"]
    assert "stale" in result["review"]
    assert all("RELIANCE" in prompt for prompt in prompts)
    assert "2026-10-28" in prompts[0]


def test_setup_evidence_is_finite_bounded_and_allowlisted(
    monkeypatch: pytest.MonkeyPatch, analysis: dict[str, Any],
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    analysis["setup"].update({
        "entry_trigger": float("inf"), "stop_loss": float("nan"), "signal_close": True,
        "reasons": ["x" * 1000] * 20, "exit_rules": ["y" * 1000] * 20,
        "level_note": "z" * 1000, "account": "private-setup",
    })
    analysis["validation_gate"]["reasons"] = ["g" * 1000] * 20

    def review(evidence: dict[str, Any], *_args: Any) -> dict[str, str]:
        setup = evidence["setup"]
        assert not {"entry_trigger", "stop_loss", "signal_close", "account"} & setup.keys()
        assert setup["target_1r"] == 107.0
        for texts in (setup["reasons"], setup["exit_rules"], evidence["validation_reasons"]):
            assert len(texts) == 8
            assert all(len(text) == 400 for text in texts)
        assert len(setup["level_note"]) == 400
        assert "private-" not in json.dumps(evidence, allow_nan=False)
        return {"bull_case": "Bull", "bear_case": "Bear", "review": "Review"}

    monkeypatch.setattr(trading_agents, "_run_debate", review)
    trading_agents.review_stock_analysis(analysis)


def test_installed_openai_client_accepts_bounded_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    clients = pytest.importorskip("tradingagents.llm_clients")
    monkeypatch.setenv("OPENAI_API_KEY", "test-offline-key")
    monkeypatch.delenv("TRADINGAGENTS_MODEL", raising=False)
    llm = clients.create_llm_client(
        "openai", model=trading_agents.model_name(), api_key="test-offline-key",
        timeout=30, max_retries=0, max_tokens=1500, reasoning_effort="low",
    ).get_llm()
    assert llm.model_name == "gpt-6-luna"
    assert llm.request_timeout == 30
    assert llm.max_retries == 0
    assert llm.max_tokens == 1500
    assert llm.use_responses_api is True
