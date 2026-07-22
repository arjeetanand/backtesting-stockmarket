from datetime import UTC, datetime

import numpy as np
import pandas as pd

from quant_research.domain.data.validator import MarketDataValidator


def create_valid_df() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "timestamp": [
                datetime(2023, 1, 1, tzinfo=UTC),
                datetime(2023, 1, 2, tzinfo=UTC),
                datetime(2023, 1, 3, tzinfo=UTC),
            ],
            "symbol": ["AAPL", "AAPL", "AAPL"],
            "open": [150.0, 152.0, 151.0],
            "high": [153.0, 155.0, 154.0],
            "low": [149.0, 151.0, 150.0],
            "close": [152.0, 153.0, 153.0],
            "volume": [1000.0, 1100.0, 1050.0],
        }
    )


def test_validator_valid_data() -> None:
    df = create_valid_df()
    report = MarketDataValidator.validate(df)
    assert report.is_valid
    assert not report.errors
    assert not report.warnings
    assert report.metrics["row_count"] == 3
    assert report.data_hash is not None


def test_validator_missing_columns() -> None:
    df = create_valid_df().drop(columns=["open"])
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "missing_columns" for err in report.errors)


def test_validator_nan_values() -> None:
    df = create_valid_df()
    df.loc[1, "close"] = np.nan
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "nan_value" and err.column == "close" for err in report.errors)


def test_validator_non_positive_price() -> None:
    df = create_valid_df()
    df.loc[1, "open"] = -5.0
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "non_positive_price" and err.column == "open" for err in report.errors)


def test_validator_negative_volume() -> None:
    df = create_valid_df()
    df.loc[2, "volume"] = -100.0
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "negative_volume" for err in report.errors)


def test_validator_high_less_than_low() -> None:
    df = create_valid_df()
    df.loc[0, "high"] = 140.0  # low is 149.0
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "high_less_than_low" for err in report.errors)


def test_validator_open_out_of_range() -> None:
    df = create_valid_df()
    df.loc[0, "open"] = 160.0  # range is [149.0, 153.0]
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "open_out_of_range" for err in report.errors)


def test_validator_duplicate_timestamp() -> None:
    df = create_valid_df()
    df.loc[1, "timestamp"] = df.loc[0, "timestamp"]
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "duplicate_timestamp" for err in report.errors)


def test_validator_unsorted_timestamps() -> None:
    df = pd.DataFrame(
        {
            "timestamp": [
                datetime(2023, 1, 2, tzinfo=UTC),
                datetime(2023, 1, 1, tzinfo=UTC),
            ],
            "symbol": ["AAPL", "AAPL"],
            "open": [150.0, 152.0],
            "high": [153.0, 155.0],
            "low": [149.0, 151.0],
            "close": [152.0, 153.0],
            "volume": [1000.0, 1100.0],
        }
    )
    report = MarketDataValidator.validate(df)
    assert not report.is_valid
    assert any(err.error_type == "unsorted_timestamps" for err in report.errors)


def test_validator_timezone_warning() -> None:
    # naive datetimes should trigger warning
    df = pd.DataFrame(
        {
            "timestamp": [datetime(2023, 1, 1), datetime(2023, 1, 2)],
            "symbol": ["AAPL", "AAPL"],
            "open": [150.0, 152.0],
            "high": [153.0, 155.0],
            "low": [149.0, 151.0],
            "close": [152.0, 153.0],
            "volume": [1000.0, 1100.0],
        }
    )
    report = MarketDataValidator.validate(df)
    assert report.is_valid  # Valid, but warnings
    assert not report.errors
    assert any(w.warning_type == "naive_timestamp" for w in report.warnings)
