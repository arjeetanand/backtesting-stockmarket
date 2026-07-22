"""Leakage-aware machine-learning experiments built on Backtrack market data."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any, Literal, cast

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from quant_research.data_providers.base import MarketDataProviderError
from quant_research.domain.data.models import OHLCVBar
from quant_research.domain.utils.hashing import calculate_value_hash
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.services.research import MarketDataUnavailableError, ResearchServiceError

ModelName = Literal["ridge", "random_forest", "hist_gradient_boosting"]
SUPPORTED_MODELS: tuple[ModelName, ...] = ("ridge", "random_forest", "hist_gradient_boosting")


@dataclass(frozen=True, slots=True)
class MlExperimentCommand:
    symbol: str
    timeframe: str
    start: datetime
    end: datetime
    horizon_days: int = 5
    train_ratio: float = 0.6
    validation_ratio: float = 0.2
    test_ratio: float = 0.2
    models: tuple[ModelName, ...] = SUPPORTED_MODELS
    commission_pct: float = 0.001
    slippage_pct: float = 0.0005


def _rsi(series: pd.Series, window: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0.0).rolling(window, min_periods=window).mean()
    loss = (-delta.clip(upper=0.0)).rolling(window, min_periods=window).mean()
    relative_strength = gain / loss.replace(0.0, np.nan)
    return 100.0 - (100.0 / (1.0 + relative_strength))


def build_ml_dataset(bars: list[OHLCVBar], horizon_days: int) -> tuple[pd.DataFrame, list[str]]:
    """Create past-only features and a forward-return label from validated bars."""
    if horizon_days < 1:
        raise ValueError("horizon_days must be positive")
    if not bars:
        raise ValueError("At least one historical bar is required")

    frame = pd.DataFrame([bar.model_dump() for bar in bars]).rename(columns={"timestamp": "date"})
    frame["date"] = pd.to_datetime(frame["date"], utc=True)
    frame = frame.sort_values(["symbol", "date"]).drop_duplicates(["symbol", "date"]).reset_index(drop=True)

    def add_features(group: pd.DataFrame) -> pd.DataFrame:
        out = group.copy()
        close = out["close"]
        returns = close.pct_change()
        out["return_1d"] = returns
        out["return_5d"] = close.pct_change(5)
        out["return_20d"] = close.pct_change(20)
        out["sma_10_distance"] = close / close.rolling(10, min_periods=10).mean() - 1.0
        out["sma_20_distance"] = close / close.rolling(20, min_periods=20).mean() - 1.0
        out["ema_12_distance"] = close / close.ewm(span=12, adjust=False).mean() - 1.0
        out["ema_26_distance"] = close / close.ewm(span=26, adjust=False).mean() - 1.0
        out["volatility_10d"] = returns.rolling(10, min_periods=10).std()
        out["volatility_20d"] = returns.rolling(20, min_periods=20).std()
        out["volume_change_1d"] = out["volume"].pct_change()
        out["relative_volume_20d"] = out["volume"] / out["volume"].rolling(20, min_periods=20).mean()
        out["rsi_14"] = _rsi(close)
        ema_fast = close.ewm(span=12, adjust=False).mean()
        ema_slow = close.ewm(span=26, adjust=False).mean()
        out["macd_distance"] = (ema_fast - ema_slow) / close
        previous_close = close.shift(1)
        true_range = pd.concat(
            [out["high"] - out["low"], (out["high"] - previous_close).abs(), (out["low"] - previous_close).abs()],
            axis=1,
        ).max(axis=1)
        out["atr_14_normalized"] = true_range.rolling(14, min_periods=14).mean() / close
        out["target_forward_return"] = close.shift(-horizon_days) / close - 1.0
        return out

    frame = pd.concat([add_features(group) for _, group in frame.groupby("symbol", sort=False)], ignore_index=True)
    feature_columns = [
        "return_1d",
        "return_5d",
        "return_20d",
        "sma_10_distance",
        "sma_20_distance",
        "ema_12_distance",
        "ema_26_distance",
        "volatility_10d",
        "volatility_20d",
        "volume_change_1d",
        "relative_volume_20d",
        "rsi_14",
        "macd_distance",
        "atr_14_normalized",
    ]
    clean = frame.replace([np.inf, -np.inf], np.nan).dropna(subset=feature_columns + ["target_forward_return"])
    clean = clean.sort_values("date").reset_index(drop=True)
    if len(clean) < 120:
        raise ValueError("At least 120 usable historical rows are required after feature warm-up.")
    return clean, feature_columns


def _chronological_split(frame: pd.DataFrame, command: MlExperimentCommand) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    dates = [pd.Timestamp(value) for value in frame["date"].drop_duplicates().sort_values().tolist()]
    train_end = max(1, int(len(dates) * command.train_ratio))
    validation_end = max(train_end + 1, int(len(dates) * (command.train_ratio + command.validation_ratio)))
    if validation_end >= len(dates):
        validation_end = len(dates) - 1
    train_dates = set(dates[:train_end])
    validation_dates = set(dates[train_end:validation_end])
    test_dates = set(dates[validation_end:])
    train = frame[frame["date"].isin(train_dates)].copy()
    validation = frame[frame["date"].isin(validation_dates)].copy()
    test = frame[frame["date"].isin(test_dates)].copy()
    if min(len(train), len(validation), len(test)) < 20:
        raise ValueError("The selected range is too short for train, validation, and test windows.")
    return train, validation, test


def _build_model(name: ModelName) -> Pipeline:
    if name == "ridge":
        estimator: Any = Ridge(alpha=1.0)
    elif name == "random_forest":
        estimator = RandomForestRegressor(
            n_estimators=120,
            max_depth=6,
            min_samples_leaf=5,
            random_state=42,
            n_jobs=1,
        )
    else:
        estimator = HistGradientBoostingRegressor(
            learning_rate=0.05,
            max_iter=180,
            max_leaf_nodes=15,
            min_samples_leaf=12,
            l2_regularization=0.1,
            random_state=42,
        )
    return Pipeline([("scale", StandardScaler()), ("model", estimator)])


def _metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    error = actual - predicted
    direction = ((actual >= 0.0) == (predicted >= 0.0)).mean()
    correlation = float(np.corrcoef(actual, predicted)[0, 1]) if len(actual) > 1 else 0.0
    if not np.isfinite(correlation):
        correlation = 0.0
    return {
        "mae": float(np.mean(np.abs(error))),
        "rmse": float(np.sqrt(np.mean(error**2))),
        "directional_accuracy": float(direction),
        "correlation": correlation,
    }


def _backtest_forecast(test: pd.DataFrame, predictions: np.ndarray, commission_pct: float, slippage_pct: float) -> dict[str, float]:
    """Simulate predictions with next-bar-open execution and explicit costs."""
    frame = test[["date", "open", "close"]].copy().reset_index(drop=True)
    frame["prediction"] = predictions
    cash = 100_000.0
    units = 0.0
    equity: list[float] = []
    trades = 0
    for index, (_, row) in enumerate(frame.iterrows()):
        signal = float(frame.iloc[index - 1]["prediction"]) if index > 0 else float("nan")
        if index > 0 and np.isfinite(signal):
            if units == 0.0 and signal > 0.0:
                execution = float(row["open"]) * (1.0 + slippage_pct)
                units = cash / (execution * (1.0 + commission_pct))
                cash -= units * execution * commission_pct
                cash -= units * execution
                trades += 1
            elif units > 0.0 and signal <= 0.0:
                execution = float(row["open"]) * (1.0 - slippage_pct)
                cash += units * execution * (1.0 - commission_pct)
                units = 0.0
        equity.append(cash + units * float(row["close"]))
    if units > 0.0:
        final = float(frame.iloc[-1]["close"]) * (1.0 - slippage_pct)
        cash += units * final * (1.0 - commission_pct)
        equity[-1] = cash
    series = pd.Series(equity, dtype=float)
    curve = series / 100_000.0
    drawdown = curve / curve.cummax() - 1.0
    buy_hold = float(frame["close"].iloc[-1] / frame["close"].iloc[0] - 1.0)
    return {
        "strategy_return": float(curve.iloc[-1] - 1.0),
        "buy_hold_return": buy_hold,
        "maximum_drawdown": float(drawdown.min()),
        "trade_count": float(trades),
    }


def _walk_forward(frame: pd.DataFrame, features: list[str], selected_model: ModelName) -> dict[str, Any]:
    dates = [pd.Timestamp(value) for value in frame["date"].drop_duplicates().sort_values().tolist()]
    if len(dates) < 240:
        return {"folds": [], "message": "Not enough dates for three walk-forward folds."}
    fold_size = max(20, len(dates) // 8)
    folds: list[dict[str, float]] = []
    for fold in range(3):
        train_end = len(dates) - (3 - fold) * fold_size
        test_end = min(len(dates), train_end + fold_size)
        train = frame[frame["date"].isin(set(dates[:train_end]))]
        test = frame[frame["date"].isin(set(dates[train_end:test_end]))]
        if len(train) < 60 or len(test) < 10:
            continue
        model = _build_model(selected_model)
        model.fit(train[features], train["target_forward_return"])
        predictions = model.predict(test[features])
        result = _metrics(test["target_forward_return"].to_numpy(), predictions)
        result["test_rows"] = float(len(test))
        folds.append(result)
    return {"folds": folds, "message": "Expanding-window validation using only past dates."}


class MlResearchService:
    """Application service for cached, reproducible ML research experiments."""

    def __init__(self, provider: Any, artifacts: SqliteArtifactStore) -> None:
        self._provider = provider
        self._artifacts = artifacts

    def run(self, command: MlExperimentCommand) -> dict[str, Any]:
        if command.start >= command.end:
            raise ValueError("start must be before end.")
        if abs(command.train_ratio + command.validation_ratio + command.test_ratio - 1.0) > 1e-9:
            raise ValueError("train_ratio, validation_ratio, and test_ratio must sum to 1.")
        if not command.models:
            raise ValueError("Select at least one ML model.")
        if any(model not in SUPPORTED_MODELS for model in command.models):
            raise ValueError("Unsupported ML model selected.")
        if self._provider is None:
            raise MarketDataUnavailableError("The local NSE data provider is not configured.")
        clean_symbol = command.symbol.strip().upper()
        try:
            bars = self._provider.get_ohlcv(clean_symbol, command.timeframe, command.start, command.end)
        except (MarketDataProviderError, ResearchServiceError) as exc:
            raise ValueError(str(exc)) from exc
        frame, features = build_ml_dataset(bars, command.horizon_days)
        cache_key = calculate_value_hash(
            {"kind": "ml_experiment", **asdict(command), "bars": [bar.model_dump(mode="json") for bar in bars]}
        )
        cached = self._artifacts.get("ml_experiment", cache_key)
        if cached is not None:
            return cached

        train, validation, test = _chronological_split(frame, command)
        baseline_predictions = np.full(len(validation), float(train["target_forward_return"].mean()))
        model_results: list[dict[str, Any]] = [
            {"model": "train_mean", "validation": _metrics(validation["target_forward_return"].to_numpy(), baseline_predictions), "kind": "baseline"}
        ]
        for name in command.models:
            model = _build_model(name)
            model.fit(train[features], train["target_forward_return"])
            predictions = model.predict(validation[features])
            model_results.append({"model": name, "validation": _metrics(validation["target_forward_return"].to_numpy(), predictions), "kind": "ml"})
        selected = min((item for item in model_results if item["kind"] == "ml"), key=lambda item: item["validation"]["rmse"])
        selected_name = cast(ModelName, selected["model"])
        final_model = _build_model(selected_name)
        final_model.fit(pd.concat([train, validation])[features], pd.concat([train, validation])["target_forward_return"])
        test_predictions = final_model.predict(test[features])
        test_metrics = _metrics(test["target_forward_return"].to_numpy(), test_predictions)
        test_backtest = _backtest_forecast(test, test_predictions, command.commission_pct, command.slippage_pct)
        walk_forward = _walk_forward(frame, features, selected_name)
        predictions = [
            {
                "date": pd.Timestamp(str(row.date)).isoformat(),
                "actual_return": float(actual),
                "predicted_return": float(predicted),
            }
            for row, actual, predicted in zip(test.itertuples(), test["target_forward_return"], test_predictions, strict=True)
        ]
        payload: dict[str, Any] = {
            "run_id": f"ml_{cache_key[:12]}",
            "status": "complete",
            "symbol": clean_symbol,
            "timeframe": command.timeframe,
            "horizon_days": command.horizon_days,
            "data": {
                "raw_bars": len(bars),
                "usable_rows": len(frame),
                "feature_count": len(features),
                "start": frame["date"].min().isoformat(),
                "end": frame["date"].max().isoformat(),
            },
            "splits": {"train_rows": len(train), "validation_rows": len(validation), "test_rows": len(test)},
            "features": features,
            "selected_model": selected_name,
            "models": model_results,
            "test": {"metrics": test_metrics, "backtest": test_backtest, "predictions": predictions[-360:]},
            "walk_forward": walk_forward,
            "warnings": [
                "Predictions are evaluated only on a later chronological test window.",
                "The forecast backtest uses next-bar-open execution with commission and slippage.",
                "This is historical research, not a forecast or investment recommendation.",
            ],
        }
        self._artifacts.save("ml_experiment", cache_key, payload)
        return payload

    def list(self, limit: int = 25) -> list[dict[str, Any]]:
        return self._artifacts.list_with_metadata("ml_experiment", limit=limit)
