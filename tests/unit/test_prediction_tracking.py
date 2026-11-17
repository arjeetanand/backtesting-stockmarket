from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException

from quant_research.api.routes.predictions import TrackSetupRequest, create_predictions_router
from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.prediction_tracking import (
    OUTCOME_KIND,
    SNAPSHOT_KIND,
    PredictionTrackingService,
)
from quant_research.services.stock_research import ARTIFACT_KIND


@pytest.fixture
def setup(tmp_path: Path) -> tuple[PredictionTrackingService, SqliteMarketCache, SqliteArtifactStore, dict[str, Any]]:
    path = tmp_path / "tracking.sqlite3"
    cache = SqliteMarketCache(path)
    artifacts = SqliteArtifactStore(path)
    analysis = {
        "run_id": "run_1", "symbol": "TEST", "run_status": "completed",
        "data_as_of": "2026-01-02", "data_hash": "hash_1", "technical": {"close": 100.0},
        "setup": {
            "status": "watch", "direction": "long_only", "entry_trigger": 105.0,
            "stop_loss": 95.0, "target_2r": 125.0, "reasons": ["Long trend is aligned."],
            "exit_rules": ["Stop before target when order is unknown."], "account": "private-account",
        },
        "validation_gate": {"status": "failed", "reasons": ["Only 12 held-out trades."]},
        "chart": ["private-chart"],
    }
    return PredictionTrackingService(cache, artifacts), cache, artifacts, analysis


def _bar(day: datetime, close: float = 101.0, high: float = 110.0, low: float = 96.0) -> OHLCVBar:
    return OHLCVBar(symbol="TEST", timestamp=day, open=100.0, high=high, low=low, close=close, volume=1000)


def _record(service: PredictionTrackingService, analysis: dict[str, Any]) -> dict[str, Any]:
    record = service.record(analysis, datetime(2026, 1, 5, 2, tzinfo=UTC))
    assert record is not None
    return record


def test_snapshot_is_immutable_bounded_and_private_fields_are_excluded(setup: Any) -> None:
    service, _, artifacts, analysis = setup
    analysis["setup"]["reasons"] = ["x" * 1000] * 15
    snapshot = _record(service, analysis)
    frozen = deepcopy(snapshot)
    analysis["setup"]["entry_trigger"] = 110.0
    analysis["technical"]["close"] = 102.0
    assert _record(service, analysis) == frozen
    assert artifacts.get(SNAPSHOT_KIND, snapshot["prediction_id"]) == frozen
    assert len(snapshot["reasons"]) == 8
    assert all(len(reason) == 400 for reason in snapshot["reasons"])
    assert "private-" not in str(snapshot)
    assert snapshot["validation_reasons"] == ["Only 12 held-out trades."]


@pytest.mark.parametrize("status", ["no_long_setup", "stale_data", None])
def test_no_setup_is_never_a_prediction(setup: Any, status: str | None) -> None:
    service, _, artifacts, analysis = setup
    analysis["setup"]["status"] = status
    assert service.record(analysis) is None
    assert artifacts.list(SNAPSHOT_KIND) == []


@pytest.mark.parametrize("field,value", [("entry_trigger", float("inf")), ("stop_loss", float("nan")), ("target_2r", 90), ("entry_trigger", True)])
def test_invalid_levels_are_not_recorded(setup: Any, field: str, value: float) -> None:
    service, _, _, analysis = setup
    analysis["setup"][field] = value
    assert service.record(analysis) is None


def test_no_lookahead_and_same_bar_touch_is_ambiguous(setup: Any) -> None:
    service, cache, _, analysis = setup
    # Extreme signal-day prices cannot count as a forward result.
    cache.put([_bar(datetime(2026, 1, 2, tzinfo=UTC), high=200, low=1)], "1day", "nse-test")
    snapshot = _record(service, analysis)
    cache.put([
        _bar(datetime(2026, 1, 5, tzinfo=UTC), close=102, high=130, low=90),
        _bar(datetime(2026, 2, 20, tzinfo=UTC), close=400, high=500, low=1),
    ], "1day", "nse-test")
    outcome = service.evaluate(snapshot["prediction_id"], datetime(2026, 1, 6, 14, tzinfo=UTC))
    assert outcome["status"] == "pending"
    assert outcome["observed_sessions"] == 1
    assert outcome["touch_state"] == "ambiguous_touch"
    assert outcome["touch_date"] == "2026-01-05"
    assert outcome["entry_trigger_state"] == "reached_after_signal"
    assert outcome["entry_trigger_date"] == "2026-01-05"
    assert "intraday order is unknown" in outcome["path_summary"]
    assert outcome["forward_return_pct"] == pytest.approx(2.0)
    assert outcome["max_favorable_move_pct"] == pytest.approx(30.0)
    assert outcome["max_adverse_move_pct"] == pytest.approx(-10.0)


def test_underway_and_unpublished_sessions_are_excluded(setup: Any) -> None:
    service, cache, _, analysis = setup
    # 10:00 IST: the day's path began before the setup was recorded.
    snapshot = service.record(analysis, datetime(2026, 1, 5, 4, 30, tzinfo=UTC))
    assert snapshot is not None
    cache.put([
        _bar(datetime(2026, 1, 5, tzinfo=UTC), high=200, low=1),
        _bar(datetime(2026, 1, 6, tzinfo=UTC)),
    ], "1day", "nse-test")
    outcome = service.evaluate(snapshot["prediction_id"], datetime(2026, 1, 6, 10, tzinfo=UTC))
    assert outcome["observed_sessions"] == 0
    assert outcome["forward_return_pct"] is None
    outcome = service.evaluate(snapshot["prediction_id"], datetime(2026, 1, 6, 14, tzinfo=UTC))
    assert outcome["observed_sessions"] == 1
    assert outcome["touch_state"] == "no_touch"


def test_no_retrospective_snapshot_when_later_bars_already_exist(setup: Any) -> None:
    service, cache, artifacts, analysis = setup
    cache.put([_bar(datetime(2026, 1, 5, tzinfo=UTC))], "1day", "nse-test")
    assert service.record(analysis, datetime(2026, 1, 6, tzinfo=UTC)) is None
    assert artifacts.list(SNAPSHOT_KIND) == []


def test_tracking_reports_entry_not_reached_and_signal_trigger(setup: Any) -> None:
    service, cache, _, analysis = setup
    snapshot = _record(service, analysis)
    days = []
    day = datetime(2026, 1, 5, tzinfo=UTC)
    while len(days) < 20:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    cache.put([_bar(session, close=100, high=104, low=97) for session in days], "1day", "nse-test")
    result = service.evaluate(snapshot["prediction_id"], datetime(2026, 3, 1, tzinfo=UTC))
    assert result["entry_trigger_state"] == "not_reached_in_window"
    assert result["entry_trigger_date"] is None
    assert "not reached in 20 observed session" in result["path_summary"]

    triggered_analysis = deepcopy(analysis)
    triggered_analysis["symbol"] = "TEST2"
    triggered_analysis["data_hash"] = "hash_2"
    triggered_analysis["setup"]["status"] = "triggered"
    triggered = service.record(triggered_analysis, datetime(2026, 1, 5, 2, tzinfo=UTC))
    assert triggered is not None
    observed = service.evaluate(triggered["prediction_id"], datetime(2026, 1, 5, 2, tzinfo=UTC))
    assert observed["entry_trigger_state"] == "triggered_at_signal"
    assert observed["entry_trigger_date"] == "2026-01-02"


def test_twenty_session_horizon_and_evaluation_are_idempotent(setup: Any) -> None:
    service, cache, artifacts, analysis = setup
    snapshot = _record(service, analysis)
    days = []
    day = datetime(2026, 1, 5, tzinfo=UTC)
    while len(days) < 21:
        if day.weekday() < 5:
            days.append(day)
        day += timedelta(days=1)
    cache.put([_bar(day, close=100 + index, high=120, low=96) for index, day in enumerate(days[:19])], "1day", "nse-test")
    pending = service.evaluate(snapshot["prediction_id"], datetime(2026, 3, 1, tzinfo=UTC))
    assert pending["status"] == "pending"
    cache.put([_bar(days[19], close=110, high=130, low=96), _bar(days[20], close=1, high=500, low=1)], "1day", "nse-test")
    complete = service.evaluate(snapshot["prediction_id"], datetime(2026, 3, 1, tzinfo=UTC))
    assert complete["status"] == "completed"
    assert complete["observed_sessions"] == 20
    assert complete["forward_return_pct"] == pytest.approx(10)
    assert complete["touch_state"] == "target_hit"
    saved_before = artifacts.list_with_metadata(OUTCOME_KIND)
    assert service.evaluate(snapshot["prediction_id"], datetime(2026, 3, 2, tzinfo=UTC)) == complete
    assert artifacts.list_with_metadata(OUTCOME_KIND) == saved_before
    assert artifacts.get(SNAPSHOT_KIND, snapshot["prediction_id"]) == snapshot


def test_router_lists_local_records_and_rejects_non_setups(setup: Any) -> None:
    _, cache, artifacts, analysis = setup
    artifacts.save(ARTIFACT_KIND, "run_1", analysis)
    router = create_predictions_router(cache, artifacts)
    post = next(route.endpoint for route in router.routes if "POST" in route.methods)
    get = next(route.endpoint for route in router.routes if "GET" in route.methods)
    record = post(TrackSetupRequest(run_id="run_1"))
    assert record["status"] == "pending"
    assert get(symbol="TEST", limit=50)["predictions"][0]["prediction_id"] == record["prediction_id"]
    analysis["setup"]["status"] = "no_long_setup"
    artifacts.save(ARTIFACT_KIND, "run_2", analysis)
    with pytest.raises(HTTPException) as exc:
        post(TrackSetupRequest(run_id="run_2"))
    assert exc.value.status_code == 422
