from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.services.ml_research import MlExperimentCommand, MlResearchService, build_ml_dataset


def make_bars(count: int = 320) -> list[OHLCVBar]:
    bars: list[OHLCVBar] = []
    for index in range(count):
        close = 100.0 + index * 0.08 + np.sin(index / 7.0) * 2.5
        bars.append(
            OHLCVBar(
                timestamp=datetime(2020, 1, 1, tzinfo=UTC) + timedelta(days=index),
                symbol="RELIANCE",
                open=close - 0.3,
                high=close + 1.0,
                low=close - 1.0,
                close=close,
                volume=100_000 + index * 10,
            )
        )
    return bars


class FakeProvider:
    provider_name = "fake"

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        return [bar for bar in make_bars() if start <= bar.timestamp <= end]


def test_ml_features_use_past_values_and_forward_target() -> None:
    frame, features = build_ml_dataset(make_bars(), horizon_days=5)

    assert len(features) == 14
    assert frame["date"].is_monotonic_increasing
    first = frame.iloc[0]
    source = [bar for bar in make_bars() if bar.timestamp == first["date"]][0]
    future = [bar for bar in make_bars() if bar.timestamp == first["date"] + timedelta(days=5)][0]
    assert first["close"] == source.close
    assert first["target_forward_return"] == future.close / source.close - 1.0


def test_ml_experiment_splits_by_date_and_reuses_cached_report(tmp_path: Path) -> None:
    service = MlResearchService(FakeProvider(), SqliteArtifactStore(tmp_path / "state.sqlite3"))
    command = MlExperimentCommand(
        symbol="RELIANCE",
        timeframe="1day",
        start=datetime(2020, 1, 1, tzinfo=UTC),
        end=datetime(2021, 12, 31, tzinfo=UTC),
        models=("ridge",),
    )

    result = service.run(command)
    cached = service.run(command)

    assert result["run_id"] == cached["run_id"]
    assert result["splits"]["train_rows"] > result["splits"]["validation_rows"]
    assert result["splits"]["validation_rows"] > 0
    assert result["splits"]["test_rows"] > 0
    assert result["selected_model"] == "ridge"
    assert result["test"]["backtest"]["trade_count"] >= 0
    assert result["warnings"]
