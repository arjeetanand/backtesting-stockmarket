"""Thread-safe storage for backtest results.

The in-memory implementation is intentionally local-development storage. The
repository boundary lets a database implementation replace it without changing
HTTP routes or research services.
"""

from __future__ import annotations

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
