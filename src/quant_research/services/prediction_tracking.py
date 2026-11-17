"""Prospective observation of frozen daily rule setups; no trades or AI scoring."""

from __future__ import annotations

import hashlib
import math
from datetime import UTC, date, datetime, time, timedelta
from threading import Lock
from typing import Any
from zoneinfo import ZoneInfo

from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.market_cache import SqliteMarketCache

SNAPSHOT_KIND = "setup_prediction"
OUTCOME_KIND = "setup_prediction_outcome"
HORIZON_SESSIONS = 20
_INDIA_TZ = ZoneInfo("Asia/Kolkata")
_record_lock = Lock()


def _now(value: datetime | None) -> datetime:
    current = value or datetime.now(UTC)
    if current.tzinfo is None:
        raise ValueError("Tracking time must include a timezone.")
    return current.astimezone(_INDIA_TZ)


def _reasons(value: object) -> list[str]:
    return [text[:400] for text in value[:8] if isinstance(text, str)] if isinstance(value, list) else []


class PredictionTrackingService:
    def __init__(self, cache: SqliteMarketCache, artifacts: SqliteArtifactStore) -> None:
        self._cache = cache
        self._artifacts = artifacts

    def record(self, analysis: dict[str, Any], now: datetime | None = None) -> dict[str, Any] | None:
        setup = analysis.get("setup") or {}
        if analysis.get("run_status") != "completed" or setup.get("status") not in {"watch", "triggered"}:
            return None
        if setup.get("direction") != "long_only":
            return None
        fields: dict[str, Any] = {
            "signal_close": (analysis.get("technical") or {}).get("close"),
            "entry_trigger": setup.get("entry_trigger"),
            "stop_loss": setup.get("stop_loss"),
            "target_2r": setup.get("target_2r"),
        }
        if any(type(value) not in (int, float) or not math.isfinite(value) or value <= 0 for value in fields.values()):
            return None
        if not fields["stop_loss"] < fields["entry_trigger"] < fields["target_2r"]:
            return None
        symbol = str(analysis.get("symbol") or "").strip().upper()
        data_hash = str(analysis.get("data_hash") or "")
        if not symbol or not data_hash or not analysis.get("data_as_of"):
            return None
        data_day = date.fromisoformat(analysis["data_as_of"])
        current = _now(now)
        if data_day > current.date():
            return None
        prediction_id = hashlib.sha256(f"{symbol}:{data_day}:{data_hash}".encode()).hexdigest()[:24]
        with _record_lock:
            existing = self._artifacts.get(SNAPSHOT_KIND, prediction_id)
            if existing is not None:
                return existing
            bars = self._cache.get(symbol, "1day")
            if any(bar.timestamp.date() > data_day for bar in bars):
                return None
            # A daily candle already underway cannot establish what happened after recording.
            creation_cutoff = current.date() if current.time().replace(tzinfo=None) >= time(9, 15) else current.date() - timedelta(days=1)
            snapshot: dict[str, Any] = {
                "prediction_id": prediction_id,
                "source_run_id": str(analysis.get("run_id") or ""),
                "symbol": symbol,
                "recorded_at": current.astimezone(UTC).isoformat(),
                "data_as_of": data_day.isoformat(),
                "data_hash": data_hash,
                "tracking_start_after": max(data_day, creation_cutoff).isoformat(),
                "horizon_sessions": HORIZON_SESSIONS,
                "setup_status": setup["status"],
                "direction": "long_only",
                **fields,
                "reasons": _reasons(setup.get("reasons")),
                "exit_rules": _reasons(setup.get("exit_rules")),
                "validation_status": (analysis.get("validation_gate") or {}).get("status", "not_evaluable"),
                "validation_reasons": _reasons((analysis.get("validation_gate") or {}).get("reasons")),
                "note": "Conditional rule setup, not an AI forecast or filled trade. Returns measure price movement from the saved signal close over 20 later observed daily sessions; sessions already underway at recording are excluded.",
            }
            self._artifacts.save(SNAPSHOT_KIND, prediction_id, snapshot)
            return snapshot

    def evaluate(self, prediction_id: str, now: datetime | None = None) -> dict[str, Any]:
        snapshot = self._artifacts.get(SNAPSHOT_KIND, prediction_id)
        if snapshot is None:
            raise KeyError("Tracked setup not found.")
        current = _now(now)
        cutoff = current.date() if current.time().replace(tzinfo=None) >= time(18) else current.date() - timedelta(days=1)
        start_after = date.fromisoformat(snapshot["tracking_start_after"])
        bars = [
            bar for bar in self._cache.get(snapshot["symbol"], "1day")
            if start_after < bar.timestamp.date() <= cutoff
        ][:snapshot["horizon_sessions"]]
        outcome: dict[str, Any] = {
            "prediction_id": prediction_id,
            "status": "completed" if len(bars) == snapshot["horizon_sessions"] else "pending",
            "observed_sessions": len(bars),
            "evaluated_through": bars[-1].timestamp.date().isoformat() if bars else None,
            "forward_return_pct": None,
            "max_favorable_move_pct": None,
            "max_adverse_move_pct": None,
            "touch_state": "no_touch",
            "touch_date": None,
        }
        if bars:
            reference = snapshot["signal_close"]
            outcome.update({
                "forward_return_pct": (bars[-1].close / reference - 1) * 100,
                "max_favorable_move_pct": max(0.0, (max(bar.high for bar in bars) / reference - 1) * 100),
                "max_adverse_move_pct": min(0.0, (min(bar.low for bar in bars) / reference - 1) * 100),
            })
            for bar in bars:
                target = bar.high >= snapshot["target_2r"]
                stop = bar.low <= snapshot["stop_loss"]
                if target or stop:
                    outcome["touch_state"] = "ambiguous_touch" if target and stop else "target_hit" if target else "stop_hit"
                    outcome["touch_date"] = bar.timestamp.date().isoformat()
                    break
        if self._artifacts.get(OUTCOME_KIND, prediction_id) != outcome:
            self._artifacts.save(OUTCOME_KIND, prediction_id, outcome)
        return {**snapshot, **outcome}

    def list(self, symbol: str | None = None, limit: int = 50, now: datetime | None = None) -> list[dict[str, Any]]:
        if not 1 <= limit <= 100:
            raise ValueError("Tracking limit must be between 1 and 100.")
        if symbol:
            records = self._artifacts.list_with_metadata_by_json_value(SNAPSHOT_KIND, "$.symbol", symbol.strip().upper().removesuffix(".NS"), limit)
        else:
            records = self._artifacts.list(SNAPSHOT_KIND, limit)
        return [self.evaluate(record["prediction_id"], now) for record in records]
