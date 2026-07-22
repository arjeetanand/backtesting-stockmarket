import json
from datetime import UTC, datetime
from urllib.request import Request

import pytest

from quant_research.data_providers.yahoo_finance import YahooFinanceClient, YahooFinanceDataError


class FakeResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


def test_yahoo_finance_client_maps_nse_symbol_and_sorts_bars() -> None:
    requests: list[Request] = []

    def opener(request: Request, timeout: float) -> FakeResponse:
        requests.append(request)
        return FakeResponse(
            {
                "chart": {
                    "result": [
                        {
                            "timestamp": [1704240000, 1704153600],
                            "indicators": {
                                "quote": [
                                    {
                                        "open": [102, 100],
                                        "high": [103, 102],
                                        "low": [101, 99],
                                        "close": [102.5, 101],
                                        "volume": [1200, 900],
                                    }
                                ]
                            },
                        }
                    ],
                    "error": None,
                }
            }
        )

    client = YahooFinanceClient(opener=opener)
    bars = client.get_ohlcv(
        "reliance",
        "1day",
        datetime(2024, 1, 1, tzinfo=UTC),
        datetime(2024, 1, 4, tzinfo=UTC),
    )

    assert [bar.close for bar in bars] == [101.0, 102.5]
    assert [bar.symbol for bar in bars] == ["RELIANCE", "RELIANCE"]
    assert "RELIANCE.NS" in requests[0].full_url
    assert "interval=1d" in requests[0].full_url


def test_yahoo_finance_client_maps_nifty_and_rejects_unknown_timeframe() -> None:
    requests: list[Request] = []

    def opener(request: Request, timeout: float) -> FakeResponse:
        requests.append(request)
        return FakeResponse({"chart": {"result": [], "error": None}})

    client = YahooFinanceClient(opener=opener)

    with pytest.raises(YahooFinanceDataError, match="returned no chart result"):
        client.get_ohlcv(
            "NIFTY 50",
            "1day",
            datetime(2024, 1, 1, tzinfo=UTC),
            datetime(2024, 1, 2, tzinfo=UTC),
        )

    assert "^NSEI" in requests[0].full_url

    with pytest.raises(YahooFinanceDataError, match="Unsupported timeframe"):
        client.get_ohlcv(
            "NIFTY 50",
            "2h",
            datetime(2024, 1, 1, tzinfo=UTC),
            datetime(2024, 1, 2, tzinfo=UTC),
        )
