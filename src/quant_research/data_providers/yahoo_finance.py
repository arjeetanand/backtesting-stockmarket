"""Keyless Yahoo Finance historical OHLCV adapter for research backtests.

This integration intentionally supports historical research only. It does not
place orders, stream quotes, or require an account, API key, or paid plan.
Yahoo Finance is an external, best-effort data source rather than an exchange
feed, so callers must retain the project's data-quality checks and caveats.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, cast
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from quant_research.data_providers.base import MarketDataProviderError
from quant_research.domain.data.models import OHLCVBar


class YahooFinanceDataError(MarketDataProviderError):
    """Raised when the keyless historical-data source cannot return candles."""


_NSE_ALIASES = {
    "NIFTY": "^NSEI",
    "NIFTY 50": "^NSEI",
    "NIFTY50": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "NIFTY BANK": "^NSEBANK",
}

_INTERVALS = {
    "1d": "1d",
    "1day": "1d",
    "day": "1d",
    "1h": "60m",
    "60m": "60m",
    "15m": "15m",
    "5m": "5m",
    "1m": "1m",
    "1w": "1wk",
    "1week": "1wk",
    "1mo": "1mo",
    "1month": "1mo",
}


def _ticker_for(symbol: str) -> str:
    clean = symbol.strip().upper()
    if not clean:
        raise YahooFinanceDataError("symbol must not be empty.")
    if clean in _NSE_ALIASES:
        return _NSE_ALIASES[clean]
    if clean.startswith("^") or clean.endswith(".NS") or clean.endswith(".BO"):
        return clean
    return f"{clean}.NS"


def _interval_for(timeframe: str) -> str:
    interval = _INTERVALS.get(timeframe.lower())
    if interval is None:
        raise YahooFinanceDataError("Unsupported timeframe. Use 1m, 5m, 15m, 1h, 1day, 1week, or 1month.")
    return interval


@dataclass(slots=True)
class YahooFinanceClient:
    """Dependency-free historical OHLCV client using Yahoo Finance chart data."""

    timeout_seconds: float = 15.0
    base_url: str = "https://query1.finance.yahoo.com/v8/finance/chart"
    opener: Callable[..., Any] = urlopen

    @property
    def provider_name(self) -> str:
        return "yahoo_finance"

    def get_ohlcv(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        if start >= end:
            raise YahooFinanceDataError("The start date must be before the end date.")
        ticker = _ticker_for(symbol)
        interval = _interval_for(timeframe)
        query = urlencode(
            {
                "period1": int(start.astimezone(UTC).timestamp()),
                "period2": int(end.astimezone(UTC).timestamp()),
                "interval": interval,
                "events": "history",
                "includeAdjustedClose": "true",
            }
        )
        request = Request(f"{self.base_url}/{ticker}?{query}", headers={"Accept": "application/json"})
        try:
            with self.opener(request, timeout=self.timeout_seconds) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise YahooFinanceDataError(f"Free historical-data source returned HTTP {exc.code}.") from exc
        except URLError as exc:
            raise YahooFinanceDataError("Could not reach the free historical-data source.") from exc
        except (TimeoutError, json.JSONDecodeError, TypeError) as exc:
            raise YahooFinanceDataError("Free historical-data source returned an invalid response.") from exc

        result = self._result(payload)
        timestamps = result.get("timestamp")
        indicators = result.get("indicators")
        quotes = indicators.get("quote") if isinstance(indicators, dict) else None
        quote = quotes[0] if isinstance(quotes, list) and quotes and isinstance(quotes[0], dict) else None
        if not isinstance(timestamps, list) or not isinstance(quote, dict):
            raise YahooFinanceDataError(f"No historical data was returned for {ticker} in the requested range.")

        opens = quote.get("open")
        highs = quote.get("high")
        lows = quote.get("low")
        closes = quote.get("close")
        volumes = quote.get("volume")
        if not all(isinstance(values, list) for values in (opens, highs, lows, closes, volumes)):
            raise YahooFinanceDataError("Free historical-data source returned an unsupported candle shape.")
        open_values = cast(list[Any], opens)
        high_values = cast(list[Any], highs)
        low_values = cast(list[Any], lows)
        close_values = cast(list[Any], closes)
        volume_values = cast(list[Any], volumes)

        bars: list[OHLCVBar] = []
        try:
            for index, timestamp in enumerate(timestamps):
                values = (open_values[index], high_values[index], low_values[index], close_values[index], volume_values[index])
                if any(value is None for value in values):
                    continue
                bars.append(
                    OHLCVBar(
                        timestamp=datetime.fromtimestamp(float(timestamp), tz=UTC),
                        symbol=symbol.strip().upper(),
                        open=float(open_values[index]),
                        high=float(high_values[index]),
                        low=float(low_values[index]),
                        close=float(close_values[index]),
                        volume=float(volume_values[index] or 0.0),
                    )
                )
        except (IndexError, TypeError, ValueError) as exc:
            raise YahooFinanceDataError("Free historical-data source returned malformed candles.") from exc

        if not bars:
            raise YahooFinanceDataError(f"No usable historical candles were returned for {ticker}.")
        return sorted(bars, key=lambda bar: bar.timestamp)

    @staticmethod
    def _result(payload: object) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise YahooFinanceDataError("Free historical-data source returned an invalid JSON object.")
        chart = payload.get("chart")
        if not isinstance(chart, dict):
            raise YahooFinanceDataError("Free historical-data source returned no chart data.")
        error = chart.get("error")
        if isinstance(error, dict):
            raise YahooFinanceDataError(str(error.get("description") or "Free historical-data source rejected the request."))
        results = chart.get("result")
        if not isinstance(results, list) or not results or not isinstance(results[0], dict):
            raise YahooFinanceDataError("Free historical-data source returned no chart result.")
        return cast(dict[str, Any], results[0])
