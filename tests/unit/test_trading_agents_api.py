from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi import HTTPException

from quant_research.api.routes import trading_agents as routes
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.stock_research import ARTIFACT_KIND, StockResearchService
from quant_research.services.trading_agents import (
    REVIEW_ATTEMPT_ARTIFACT_KIND,
    TradingAgentsReviewError,
    TradingAgentsUnavailableError,
)


def _saved_analysis(tmp_path: Path) -> tuple[SqliteMarketCache, SqliteArtifactStore, dict[str, object]]:
    path = tmp_path / "market.sqlite3"
    cache = SqliteMarketCache(path)
    artifacts = SqliteArtifactStore(path)
    start = datetime(2025, 1, 1, tzinfo=UTC)
    bars = []
    for index in range(260):
        close = 100.0 + index * 0.2
        bars.append(OHLCVBar(
            timestamp=start + timedelta(days=index),
            symbol="TEST",
            open=close - 0.1,
            high=close + 1.0,
            low=close - 1.0,
            close=close,
            volume=1_000.0 + index,
        ))
    cache.put(bars, "1day", "official-nse-test")
    analysis = StockResearchService(cache, artifacts).run("TEST")
    return cache, artifacts, analysis


def _router(cache: SqliteMarketCache, artifacts: SqliteArtifactStore):
    router = routes.create_trading_agents_router(cache, artifacts)
    post = next(route.endpoint for route in router.routes if route.path.endswith("/trading-agents") and "POST" in route.methods)
    history = next(route.endpoint for route in router.routes if route.path.endswith("/trading-agents/history"))
    return post, history


def _sync_stub(
    monkeypatch: pytest.MonkeyPatch,
    calls: list[int],
    error: Exception | None = None,
    cache: SqliteMarketCache | None = None,
    status: str = "complete",
) -> None:
    class _DailySync:
        def __init__(self, _cache: SqliteMarketCache) -> None:
            pass

        def sync_latest(self) -> dict[str, object]:
            calls.append(1)
            if error:
                raise error
            if cache is not None and len(calls) == 1:
                latest = cache.get("TEST", timeframe="1day")[-1]
                close = latest.close + 0.2
                cache.put([OHLCVBar(
                    timestamp=latest.timestamp + timedelta(days=1),
                    symbol="TEST",
                    open=close - 0.1,
                    high=close + 1.0,
                    low=close - 1.0,
                    close=close,
                    volume=latest.volume + 1,
                )], "1day", "official-nse-test-sync")
            latest_day = cache.summary().latest.isoformat()[:10] if cache is not None else "2025-09-17"
            return {
                "status": status,
                "message": f"Latest saved NSE daily data is {latest_day}.",
                "target_trading_day": latest_day,
                "latest_trading_day": f"{latest_day}T00:00:00",
                "synced_days": 1 if cache is not None and len(calls) == 1 else 0,
                "skipped_days": 1 if status == "partial" else 0,
            }

    monkeypatch.setattr(routes, "DailySyncService", _DailySync)


def test_every_review_syncs_and_saves_fresh_analysis_and_attempt(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cache, artifacts, initial = _saved_analysis(tmp_path)
    sync_calls: list[int] = []
    review_calls: list[dict[str, object]] = []
    _sync_stub(monkeypatch, sync_calls, cache=cache, status="partial")

    def review(analysis: dict[str, object]) -> dict[str, str]:
        review_calls.append(analysis)
        return {
            "symbol": "TEST",
            "data_as_of": str(analysis["data_as_of"]),
            "model": "test-model",
            "bull_case": "Bull",
            "bear_case": "Bear",
            "review": "Review",
        }

    monkeypatch.setattr(routes, "review_stock_analysis", review)
    post, history = _router(cache, artifacts)
    request = routes.TradingAgentsRequest(run_id=str(initial["run_id"]))

    first = post(request)
    second = post(request)

    assert first.source_run_id != initial["run_id"]
    assert second.source_run_id != first.source_run_id
    assert first.analysis.run_id == first.source_run_id
    assert first.data_as_of == "2025-09-18"
    assert first.data_hash != initial["data_hash"]
    assert review_calls[0]["data_as_of"] == first.data_as_of
    assert first.sync_status == second.sync_status == "partial"
    assert first.skipped_days == 1
    assert sync_calls == [1, 1]
    assert len(review_calls) == 1  # Same data fingerprint reuses the saved AI result.
    attempts = history("TEST", 20).attempts
    assert len(attempts) == 2
    assert attempts[0].status == attempts[1].status == "completed"
    assert attempts[0].cache_hit is True
    assert attempts[1].cache_hit is False
    assert all(attempt.data_hash == first.data_hash for attempt in attempts)
    assert len(artifacts.list(ARTIFACT_KIND)) == 3


def test_sync_failure_is_saved_and_prevents_ai_review(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cache, artifacts, initial = _saved_analysis(tmp_path)
    sync_calls: list[int] = []
    _sync_stub(monkeypatch, sync_calls, RuntimeError("NSE unavailable"))
    monkeypatch.setattr(routes, "review_stock_analysis", lambda _analysis: pytest.fail("AI must not receive stale data"))
    post, history = _router(cache, artifacts)

    with pytest.raises(HTTPException) as caught:
        post(routes.TradingAgentsRequest(run_id=str(initial["run_id"])))

    assert caught.value.status_code == 502
    attempt = history("TEST", 20).attempts[0]
    assert attempt.status == "sync_failed"
    assert attempt.sync_status == "failed"
    assert "AI review was not sent" in attempt.error
    assert sync_calls == [1]


@pytest.mark.parametrize("error,code", [
    (TradingAgentsUnavailableError("Configure provider"), 503),
    (TradingAgentsReviewError("Provider failed"), 502),
])
def test_provider_errors_are_saved_and_not_cached(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    error: Exception,
    code: int,
) -> None:
    cache, artifacts, initial = _saved_analysis(tmp_path)
    sync_calls: list[int] = []
    _sync_stub(monkeypatch, sync_calls)

    def fail(_analysis: dict[str, object]) -> None:
        raise error

    monkeypatch.setattr(routes, "review_stock_analysis", fail)
    post, history = _router(cache, artifacts)
    request = routes.TradingAgentsRequest(run_id=str(initial["run_id"]))

    for _ in range(2):
        with pytest.raises(HTTPException) as caught:
            post(request)
        assert caught.value.status_code == code

    attempts = history("TEST", 20).attempts
    expected_status = "review_unavailable" if code == 503 else "review_failed"
    assert len(attempts) == 2
    assert all(attempt.status == expected_status for attempt in attempts)
    assert all(attempt.source_run_id is not None for attempt in attempts)
    assert artifacts.list("trading_agents_review") == []
    assert len(artifacts.list(REVIEW_ATTEMPT_ARTIFACT_KIND)) == 2
    assert sync_calls == [1, 1]


def test_missing_or_incomplete_analysis_cannot_start_review(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    artifacts = SqliteArtifactStore(tmp_path / "market.sqlite3")
    sync_calls: list[int] = []
    _sync_stub(monkeypatch, sync_calls)
    post, _history = _router(cache, artifacts)

    with pytest.raises(HTTPException) as caught:
        post(routes.TradingAgentsRequest(run_id="missing"))
    assert caught.value.status_code == 404
    artifacts.save(ARTIFACT_KIND, "failed", {"run_status": "failed", "symbol": "TEST"})
    with pytest.raises(HTTPException) as caught:
        post(routes.TradingAgentsRequest(run_id="failed"))
    assert caught.value.status_code == 422
    assert sync_calls == []
