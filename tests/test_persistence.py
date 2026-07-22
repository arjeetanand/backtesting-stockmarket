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


def test_testing_history_can_delete_one_run_and_clear_analysis_artifacts(tmp_path) -> None:
    path = tmp_path / "state.sqlite3"
    repository = SqliteBacktestRepository(path)
    result = BacktestResult(
        run_id="bt_to_delete",
        strategy_hash="strategy",
        data_hash="data",
        engine_version="test",
        execution_timestamp=datetime.now(UTC),
        config={"strategy": "sma_crossover"},
    )
    repository.save(result)
    assert repository.delete("bt_to_delete") is True
    assert repository.get("bt_to_delete") is None
    assert repository.delete("bt_to_delete") is False

    artifacts = SqliteArtifactStore(path)
    artifacts.save("custom_backtest", "custom-1", {"status": "complete"})
    artifacts.save("import_job", "import-1", {"status": "complete"})
    assert artifacts.clear_kinds(("custom_backtest", "hypothesis", "robustness", "youtube_strategy", "replay_session")) == 1
    assert artifacts.list("custom_backtest") == []
    assert artifacts.get("import_job", "import-1") == {"status": "complete"}
