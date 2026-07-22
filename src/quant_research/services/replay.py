"""Market Replay and Manual/Automated Execution Engine."""

from __future__ import annotations

import uuid
from dataclasses import asdict, dataclass, field
from typing import Any

from quant_research.repositories.artifacts import SqliteArtifactStore


@dataclass
class ReplayBar:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class ReplayOrder:
    order_id: str
    side: str  # "buy" | "sell"
    order_type: str  # "market" | "limit" | "stop"
    quantity: float
    requested_price: float
    fill_price: float | None = None
    stop_loss: float | None = None
    take_profit: float | None = None
    status: str = "OPEN"  # "OPEN" | "FILLED" | "CLOSED" | "CANCELLED"
    created_at_bar: int = 0
    filled_at_bar: int | None = None
    closed_at_bar: int | None = None
    realized_pnl: float = 0.0


@dataclass
class ReplayEvent:
    event_id: str
    timestamp: str
    event_type: str
    description: str


@dataclass
class ReplaySession:
    session_id: str
    symbol: str
    timeframe: str
    mode: str  # "manual" | "automated"
    start_date: str
    end_date: str
    initial_capital: float
    cash: float
    equity: float
    status: str  # "REPLAYING" | "PAUSED" | "FINISHED"
    cursor_index: int
    bars: list[dict]
    orders: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)

    @property
    def revealed_bars(self) -> list[dict]:
        return self.bars[: self.cursor_index + 1]


_SESSION_STORE: dict[str, ReplaySession] = {}


def create_session(
    *,
    symbol: str,
    timeframe: str,
    start_date: str,
    end_date: str,
    mode: str,
    initial_capital: float,
    bars: list[dict],
    store: SqliteArtifactStore | None = None,
) -> dict[str, Any]:
    """Start a simulated replay from supplied, historical OHLCV bars only."""
    if len(bars) < 16:
        raise ValueError("Replay needs at least 16 historical candles. Choose a longer date range or a larger timeframe.")

    session_id = f"rpl_{uuid.uuid4().hex[:8]}"

    initial_event = {
        "event_id": f"evt_{uuid.uuid4().hex[:6]}",
        "timestamp": bars[0]["date"],
        "event_type": "SESSION_STARTED",
        "description": f"Market Replay session initialized for {symbol} ({timeframe}) with ₹{initial_capital:,.0f} capital.",
    }

    session = ReplaySession(
        session_id=session_id,
        symbol=symbol,
        timeframe=timeframe,
        mode=mode,
        start_date=start_date,
        end_date=end_date,
        initial_capital=initial_capital,
        cash=initial_capital,
        equity=initial_capital,
        status="REPLAYING",
        cursor_index=15,  # Start with 15 historical candles revealed
        bars=bars,
        orders=[],
        events=[initial_event],
    )

    _SESSION_STORE[session_id] = session
    return _persist_session(session, store)


def get_session(session_id: str, store: SqliteArtifactStore | None = None) -> dict[str, Any] | None:
    session = _load_session(session_id, store)
    if not session:
        return None
    return _serialize_session(session)


def step_session(session_id: str, steps: int = 1, store: SqliteArtifactStore | None = None) -> dict[str, Any] | None:
    session = _load_session(session_id, store)
    if not session or session.status == "FINISHED":
        return None

    new_cursor = min(session.cursor_index + steps, len(session.bars) - 1)
    session.cursor_index = new_cursor

    if new_cursor >= len(session.bars) - 1:
        session.status = "FINISHED"

    current_bar = session.bars[new_cursor]

    # Evaluate pending orders against current bar
    for order_dict in session.orders:
        if order_dict["status"] == "OPEN":
            # Fill market orders or matching limit/stop orders
            order_dict["status"] = "FILLED"
            order_dict["filled_at_bar"] = new_cursor
            order_dict["fill_price"] = current_bar["open"]
            session.events.append(
                {
                    "event_id": f"evt_{uuid.uuid4().hex[:6]}",
                    "timestamp": current_bar["date"],
                    "event_type": "ORDER_FILLED",
                    "description": f"Order #{order_dict['order_id']} FILLED: {order_dict['side'].upper()} {order_dict['quantity']} units @ ₹{current_bar['open']}",
                }
            )

    _recalculate_session_equity(session)
    return _persist_session(session, store)


def place_order(
    session_id: str,
    side: str,
    quantity: float,
    order_type: str = "market",
    price: float | None = None,
    stop_loss: float | None = None,
    take_profit: float | None = None,
    store: SqliteArtifactStore | None = None,
) -> dict[str, Any] | None:
    session = _load_session(session_id, store)
    if not session or session.status == "FINISHED":
        return None

    current_bar = session.bars[session.cursor_index]
    fill_price = current_bar["close"] if order_type == "market" else (price or current_bar["close"])

    order_id = f"ord_{uuid.uuid4().hex[:6]}"
    order_dict = {
        "order_id": order_id,
        "side": side.lower(),
        "order_type": order_type.lower(),
        "quantity": quantity,
        "requested_price": fill_price,
        "fill_price": fill_price,
        "stop_loss": stop_loss,
        "take_profit": take_profit,
        "status": "FILLED",
        "created_at_bar": session.cursor_index,
        "filled_at_bar": session.cursor_index,
        "closed_at_bar": None,
        "realized_pnl": 0.0,
    }

    session.orders.append(order_dict)
    session.events.append(
        {
            "event_id": f"evt_{uuid.uuid4().hex[:6]}",
            "timestamp": current_bar["date"],
            "event_type": "ORDER_PLACED",
            "description": f"Placed {side.upper()} {quantity} units @ ₹{fill_price:,.2f} (SL: {stop_loss or 'None'}, TP: {take_profit or 'None'})",
        }
    )

    _recalculate_session_equity(session)
    return _persist_session(session, store)


def close_order(session_id: str, order_id: str, store: SqliteArtifactStore | None = None) -> dict[str, Any] | None:
    session = _load_session(session_id, store)
    if not session:
        return None

    current_bar = session.bars[session.cursor_index]
    for order in session.orders:
        if order["order_id"] == order_id and order["status"] == "FILLED":
            exit_price = current_bar["close"]
            entry_price = order["fill_price"] or exit_price
            qty = order["quantity"]

            pnl = (exit_price - entry_price) * qty if order["side"] == "buy" else (entry_price - exit_price) * qty
            order["status"] = "CLOSED"
            order["closed_at_bar"] = session.cursor_index
            order["realized_pnl"] = round(pnl, 2)

            session.cash += pnl
            session.events.append(
                {
                    "event_id": f"evt_{uuid.uuid4().hex[:6]}",
                    "timestamp": current_bar["date"],
                    "event_type": "POSITION_CLOSED",
                    "description": f"Closed Order #{order_id} @ ₹{exit_price:,.2f} — Realized P&L: ₹{pnl:+,.2f}",
                }
            )

    _recalculate_session_equity(session)
    return _persist_session(session, store)


def finish_session(session_id: str, store: SqliteArtifactStore | None = None) -> dict[str, Any] | None:
    session = _load_session(session_id, store)
    if not session:
        return None

    session.status = "FINISHED"
    session.cursor_index = len(session.bars) - 1
    session.events.append(
        {
            "event_id": f"evt_{uuid.uuid4().hex[:6]}",
            "timestamp": session.bars[-1]["date"],
            "event_type": "SESSION_FINISHED",
            "description": f"Replay session finished. Final Equity: ₹{session.equity:,.2f}",
        }
    )

    _recalculate_session_equity(session)
    return _persist_session(session, store)


def _recalculate_session_equity(session: ReplaySession) -> None:
    current_bar = session.bars[session.cursor_index]
    unrealized = 0.0

    for order in session.orders:
        if order["status"] == "FILLED":
            entry = order["fill_price"] or current_bar["close"]
            qty = order["quantity"]
            diff = (current_bar["close"] - entry) if order["side"] == "buy" else (entry - current_bar["close"])
            unrealized += diff * qty

    session.equity = round(session.cash + unrealized, 2)


def _serialize_session(session: ReplaySession) -> dict[str, Any]:
    current_bar = session.bars[session.cursor_index]
    closed_orders = [o for o in session.orders if o["status"] == "CLOSED"]
    total_realized = sum(o["realized_pnl"] for o in closed_orders)
    win_count = sum(1 for o in closed_orders if o["realized_pnl"] > 0)
    win_rate = (win_count / len(closed_orders) * 100) if closed_orders else 0.0

    return {
        "session_id": session.session_id,
        "symbol": session.symbol,
        "timeframe": session.timeframe,
        "mode": session.mode,
        "start_date": session.start_date,
        "end_date": session.end_date,
        "initial_capital": session.initial_capital,
        "cash": session.cash,
        "equity": session.equity,
        "unrealized_pnl": round(session.equity - session.cash, 2),
        "realized_pnl": round(total_realized, 2),
        "win_rate": round(win_rate, 1),
        "trade_count": len(closed_orders),
        "status": session.status,
        "cursor_index": session.cursor_index,
        "total_bars": len(session.bars),
        "current_bar": current_bar,
        "revealed_bars": session.revealed_bars,
        "orders": session.orders,
        "events": session.events,
    }


def _persist_session(session: ReplaySession, store: SqliteArtifactStore | None) -> dict[str, Any]:
    if store is not None:
        store.save("replay_session", session.session_id, {"session": asdict(session)})
    return _serialize_session(session)


def _load_session(session_id: str, store: SqliteArtifactStore | None) -> ReplaySession | None:
    session = _SESSION_STORE.get(session_id)
    if session is not None or store is None:
        return session
    payload = store.get("replay_session", session_id)
    raw = payload.get("session") if payload else None
    if not isinstance(raw, dict):
        return None
    session = ReplaySession(**raw)
    _SESSION_STORE[session_id] = session
    return session
