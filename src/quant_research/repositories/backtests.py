"""Persistent storage for backtest results."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock

from quant_research.domain.backtesting.models import BacktestResult


class InMemoryBacktestRepository:
    """Store backtests for the lifetime of one backend process."""

    def __init__(self) -> None:
        self._results: dict[str, BacktestResult] = {}
        self._lock = RLock()

    def save(self, result: BacktestResult) -> BacktestResult:
        with self._lock:
            self._results[result.run_id] = result
        return result

    def get(self, run_id: str) -> BacktestResult | None:
        with self._lock:
            return self._results.get(run_id)

    def list(self) -> list[BacktestResult]:
        with self._lock:
            return sorted(self._results.values(), key=lambda result: result.execution_timestamp, reverse=True)


class SqliteBacktestRepository:
    """Store complete backtest results and reuse identical completed runs."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS backtest_runs (
                    run_id TEXT PRIMARY KEY,
                    cache_key TEXT UNIQUE,
                    execution_timestamp TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )

    def save(self, result: BacktestResult, cache_key: str | None = None) -> BacktestResult:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO backtest_runs (run_id, cache_key, execution_timestamp, payload)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(run_id) DO UPDATE SET
                    cache_key = excluded.cache_key,
                    execution_timestamp = excluded.execution_timestamp,
                    payload = excluded.payload
                """,
                (
                    result.run_id,
                    cache_key,
                    result.execution_timestamp.isoformat(),
                    result.model_dump_json(),
                ),
            )
        return result

    def get(self, run_id: str) -> BacktestResult | None:
        with self._connect() as connection:
            row = connection.execute("SELECT payload FROM backtest_runs WHERE run_id = ?", (run_id,)).fetchone()
        return BacktestResult.model_validate_json(row[0]) if row else None

    def get_cached(self, cache_key: str) -> BacktestResult | None:
        with self._connect() as connection:
            row = connection.execute("SELECT payload FROM backtest_runs WHERE cache_key = ?", (cache_key,)).fetchone()
        return BacktestResult.model_validate_json(row[0]) if row else None

    def list(self) -> list[BacktestResult]:
        with self._connect() as connection:
            rows = connection.execute("SELECT payload FROM backtest_runs ORDER BY execution_timestamp DESC").fetchall()
        return [BacktestResult.model_validate(json.loads(row[0])) for row in rows]

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)
