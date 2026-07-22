import hashlib

import numpy as np
import pandas as pd

from quant_research.domain.data.models import (
    DataQualityReport,
    ValidationErrorDetail,
    ValidationWarningDetail,
)


class MarketDataValidator:
    @classmethod
    def validate(cls, df: pd.DataFrame) -> DataQualityReport:
        """Validates market data DataFrame and generates a DataQualityReport.

        Args:
            df: The pandas DataFrame to validate.

        Returns:
            A DataQualityReport detailing any validation errors or warnings.
        """
        errors: list[ValidationErrorDetail] = []
        warnings: list[ValidationWarningDetail] = []

        # 1. Check required columns
        required_cols = [
            "timestamp",
            "symbol",
            "open",
            "high",
            "low",
            "close",
            "volume",
        ]
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            data_hash = hashlib.sha256(b"").hexdigest()
            return DataQualityReport(
                is_valid=False,
                errors=[
                    ValidationErrorDetail(
                        row_index=0,
                        column="columns",
                        error_type="missing_columns",
                        message=f"Missing columns: {missing_cols}",
                    )
                ],
                warnings=[],
                metrics={"row_count": len(df)},
                data_hash=data_hash,
            )

        # Create copy to avoid mutating user input
        df = df.copy()

        # Try to convert timestamp to datetime
        if not pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            try:
                df["timestamp"] = pd.to_datetime(df["timestamp"])
            except Exception as e:
                return DataQualityReport(
                    is_valid=False,
                    errors=[
                        ValidationErrorDetail(
                            row_index=0,
                            column="timestamp",
                            error_type="invalid_datetime_format",
                            message=f"Could not convert timestamp column to datetime: {e}",
                        )
                    ],
                    warnings=[],
                    metrics={"row_count": len(df)},
                    data_hash=hashlib.sha256(b"").hexdigest(),
                )

        # 2. Timezone checks
        tzs = df["timestamp"].dt.tz
        if tzs is None:
            warnings.append(
                ValidationWarningDetail(
                    row_index=0,
                    column="timestamp",
                    warning_type="naive_timestamp",
                    message="Timestamps are timezone-naive. UTC timezone is highly recommended.",
                )
            )

        # 3. Check for NaNs
        nan_mask = df.isna()
        if nan_mask.any().any():
            nan_rows = np.where(nan_mask.any(axis=1))[0]
            for idx in nan_rows:
                row = df.iloc[idx]
                for col in df.columns:
                    if pd.isna(row[col]):
                        errors.append(
                            ValidationErrorDetail(
                                row_index=int(idx),
                                column=col,
                                error_type="nan_value",
                                message=f"NaN value found in column '{col}'",
                            )
                        )

        # 4. Check sorting and duplicates per symbol group
        symbols = df["symbol"].unique()
        for sym in symbols:
            sym_df = df[df["symbol"] == sym]

            # Unsorted check
            if not sym_df["timestamp"].is_monotonic_increasing:
                errors.append(
                    ValidationErrorDetail(
                        row_index=0,
                        column="timestamp",
                        error_type="unsorted_timestamps",
                        message=f"Timestamps for symbol '{sym}' are not sorted in ascending order.",
                    )
                )

            # Duplicate check
            duplicates = sym_df[sym_df.duplicated(subset=["timestamp"], keep=False)]
            if not duplicates.empty:
                for idx in duplicates.index:
                    errors.append(
                        ValidationErrorDetail(
                            row_index=int(idx),
                            column="timestamp",
                            error_type="duplicate_timestamp",
                            message=f"Duplicate timestamp found for symbol '{sym}'",
                        )
                    )

        # 5. Prices validation (open, high, low, close must be > 0)
        for price_col in ["open", "high", "low", "close"]:
            bad_indices = df[df[price_col] <= 0].index
            for idx in bad_indices:
                errors.append(
                    ValidationErrorDetail(
                        row_index=int(idx),
                        column=price_col,
                        error_type="non_positive_price",
                        message=f"Non-positive price ({df.loc[idx, price_col]}) in column '{price_col}'",
                    )
                )

        # 6. Volume validation (volume must be >= 0)
        bad_vol_indices = df[df["volume"] < 0].index
        for idx in bad_vol_indices:
            errors.append(
                ValidationErrorDetail(
                    row_index=int(idx),
                    column="volume",
                    error_type="negative_volume",
                    message=f"Negative volume ({df.loc[idx, 'volume']}) in column 'volume'",
                )
            )

        # 7. High-low relationship (high >= low)
        bad_hl_indices = df[df["high"] < df["low"]].index
        for idx in bad_hl_indices:
            errors.append(
                ValidationErrorDetail(
                    row_index=int(idx),
                    column="high",
                    error_type="high_less_than_low",
                    message=f"High price ({df.loc[idx, 'high']}) is lower than low price ({df.loc[idx, 'low']})",
                )
            )

        # 8. Open price range (low <= open <= high)
        bad_open_indices = df[(df["open"] < df["low"]) | (df["open"] > df["high"])].index
        for idx in bad_open_indices:
            errors.append(
                ValidationErrorDetail(
                    row_index=int(idx),
                    column="open",
                    error_type="open_out_of_range",
                    message=(
                        f"Open price ({df.loc[idx, 'open']}) is outside the high-low "
                        f"range [{df.loc[idx, 'low']}, {df.loc[idx, 'high']}]"
                    ),
                )
            )

        # 9. Close price range (low <= close <= high)
        bad_close_indices = df[(df["close"] < df["low"]) | (df["close"] > df["high"])].index
        for idx in bad_close_indices:
            errors.append(
                ValidationErrorDetail(
                    row_index=int(idx),
                    column="close",
                    error_type="close_out_of_range",
                    message=(
                        f"Close price ({df.loc[idx, 'close']}) is outside the high-low "
                        f"range [{df.loc[idx, 'low']}, {df.loc[idx, 'high']}]"
                    ),
                )
            )

        # Calculate stable hash of the data
        sorted_df = df.sort_values(by=["symbol", "timestamp"]).copy()
        # Convert timestamp to ISO-8601 string format for serialization
        sorted_df["timestamp"] = sorted_df["timestamp"].dt.strftime("%Y-%m-%dT%H:%M:%S.%f%z")
        records_json = sorted_df.to_json(orient="records")
        data_hash = hashlib.sha256(records_json.encode("utf-8")).hexdigest()

        metrics = {
            "row_count": len(df),
            "symbol_count": len(symbols),
            "start_date": df["timestamp"].min().isoformat() if len(df) > 0 else None,
            "end_date": df["timestamp"].max().isoformat() if len(df) > 0 else None,
        }

        is_valid = len(errors) == 0

        return DataQualityReport(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            metrics=metrics,
            data_hash=data_hash,
        )
