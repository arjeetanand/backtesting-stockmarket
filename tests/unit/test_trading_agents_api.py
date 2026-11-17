from pathlib import Path

import pytest
from fastapi import HTTPException

from quant_research.api.routes import trading_agents as routes
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.services.stock_research import ARTIFACT_KIND
from quant_research.services.trading_agents import TradingAgentsReviewError, TradingAgentsUnavailableError


def test_review_uses_saved_artifact_and_reuses_result(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    store = SqliteArtifactStore(tmp_path / "test.sqlite3")
    analysis = {"run_status": "completed", "symbol": "RELIANCE"}
    store.save(ARTIFACT_KIND, "run-1", analysis)
    calls = []

    def review(payload: dict[str, object]) -> dict[str, str]:
        calls.append(payload)
        return {"symbol": "RELIANCE", "data_as_of": "2026-11-16", "model": "test",
                "bull_case": "Bull", "bear_case": "Bear", "review": "Review"}

    monkeypatch.setattr(routes, "review_stock_analysis", review)
    endpoint = routes.create_trading_agents_router(store).routes[0].endpoint
    request = routes.TradingAgentsRequest(run_id="run-1")
    assert endpoint(request).review == "Review"
    assert endpoint(request).review == "Review"
    assert calls == [analysis]
    monkeypatch.setenv("TRADINGAGENTS_MODEL", "another-model")
    endpoint(request)
    assert len(calls) == 2


@pytest.mark.parametrize("error,code", [(TradingAgentsUnavailableError("Configure provider"), 503),
                                       (TradingAgentsReviewError("Provider failed"), 502)])
def test_provider_errors_are_explicit_and_not_cached(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, error: Exception, code: int,
) -> None:
    store = SqliteArtifactStore(tmp_path / "test.sqlite3")
    store.save(ARTIFACT_KIND, "run-1", {"run_status": "completed"})

    def fail(payload: dict[str, object]) -> None:
        raise error

    monkeypatch.setattr(routes, "review_stock_analysis", fail)
    endpoint = routes.create_trading_agents_router(store).routes[0].endpoint
    for _ in range(2):
        with pytest.raises(HTTPException) as caught:
            endpoint(routes.TradingAgentsRequest(run_id="run-1"))
        assert caught.value.status_code == code
    assert store.list("trading_agents_review") == []


def test_missing_or_failed_analysis_cannot_start_review(tmp_path: Path) -> None:
    store = SqliteArtifactStore(tmp_path / "test.sqlite3")
    endpoint = routes.create_trading_agents_router(store).routes[0].endpoint
    with pytest.raises(HTTPException) as caught:
        endpoint(routes.TradingAgentsRequest(run_id="missing"))
    assert caught.value.status_code == 404
    store.save(ARTIFACT_KIND, "failed", {"run_status": "failed"})
    with pytest.raises(HTTPException) as caught:
        endpoint(routes.TradingAgentsRequest(run_id="failed"))
    assert caught.value.status_code == 422
