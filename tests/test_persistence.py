from datetime import UTC, datetime

from quant_research.domain.backtesting.models import BacktestResult
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.backtests import SqliteBacktestRepository


def test_artifacts_survive_a_new_store_instance(tmp_path) -> None:
    path = tmp_path / "state.sqlite3"
    SqliteArtifactStore(path).save("research", "same-input", {"status": "complete", "value": 42})

    reopened = SqliteArtifactStore(path)
    assert reopened.get("research", "same-input") == {"status": "complete", "value": 42}


def test_backtest_repository_reuses_cached_result_after_reopen(tmp_path) -> None:
    path = tmp_path / "state.sqlite3"
    result = BacktestResult(
        run_id="bt_persisted",
        strategy_hash="strategy",
        data_hash="data",
        engine_version="test",
        execution_timestamp=datetime.now(UTC),
        config={"strategy": "sma_crossover"},
    )
    SqliteBacktestRepository(path).save(result, cache_key="same-input")

    reopened = SqliteBacktestRepository(path)
    assert reopened.get("bt_persisted") is not None
    assert reopened.get_cached("same-input").run_id == "bt_persisted"
