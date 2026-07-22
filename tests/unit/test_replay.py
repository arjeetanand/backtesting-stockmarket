"""Unit tests for the Market Replay and Execution Engine."""

from __future__ import annotations

from typing import Any

from quant_research.services.replay import (
    close_order,
    create_session,
    finish_session,
    place_order,
    step_session,
)


def historical_bars(count: int = 24) -> list[dict[str, object]]:
    return [
        {
            "date": f"2024-01-{index + 1:02d}T09:15:00",
            "open": 100.0 + index,
            "high": 102.0 + index,
            "low": 99.0 + index,
            "close": 101.0 + index,
            "volume": 10_000,
        }
        for index in range(count)
    ]


def make_session(
    symbol: str = "NIFTY 50", timeframe: str = "1day", initial_capital: float = 100_000.0
) -> dict[str, Any]:
    return create_session(
        symbol=symbol,
        timeframe=timeframe,
        start_date="2024-01-01",
        end_date="2024-01-31",
        mode="manual",
        initial_capital=initial_capital,
        bars=historical_bars(),
    )


def test_create_replay_session() -> None:
    session = make_session(timeframe="15m", initial_capital=100000.0)
    assert session["session_id"].startswith("rpl_")
    assert session["symbol"] == "NIFTY 50"
    assert session["status"] == "REPLAYING"
    assert session["initial_capital"] == 100000.0
    assert len(session["revealed_bars"]) == 16  # cursor at 15
    assert len(session["events"]) >= 1


def test_step_replay_session() -> None:
    session = make_session(symbol="BANKNIFTY", timeframe="5m")
    session_id = session["session_id"]
    initial_cursor = session["cursor_index"]

    updated = step_session(session_id, steps=3)
    assert updated is not None
    assert updated["cursor_index"] == initial_cursor + 3
    assert len(updated["revealed_bars"]) == initial_cursor + 4


def test_place_and_close_order() -> None:
    session = make_session(symbol="RELIANCE", timeframe="1day", initial_capital=50000.0)
    session_id = session["session_id"]

    # Place buy order
    after_order = place_order(session_id, side="buy", quantity=10, order_type="market")
    assert after_order is not None
    assert len(after_order["orders"]) == 1
    order_id = after_order["orders"][0]["order_id"]
    assert after_order["orders"][0]["status"] == "FILLED"

    # Step cursor forward
    step_session(session_id, steps=2)

    # Close order
    after_close = close_order(session_id, order_id)
    assert after_close is not None
    assert after_close["orders"][0]["status"] == "CLOSED"
    assert len(after_close["events"]) >= 3


def test_finish_replay_session() -> None:
    session = make_session()
    session_id = session["session_id"]

    finished = finish_session(session_id)
    assert finished is not None
    assert finished["status"] == "FINISHED"
    assert finished["cursor_index"] == finished["total_bars"] - 1
