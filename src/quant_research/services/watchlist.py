"""Watchlist and forward setup tracking service."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

from quant_research.repositories.market_cache import SqliteMarketCache, WatchlistItem


class WatchlistService:
    def __init__(self, cache: SqliteMarketCache) -> None:
        self._cache = cache

    def add_item(
        self,
        symbol: str,
        company_name: str,
        setup_type: str,
        entry_price: float,
        target_price: float | None = None,
        stop_loss_price: float | None = None,
    ) -> dict[str, Any]:
        clean_symbol = symbol.strip().upper()
        if target_price is None or target_price <= 0.0:
            target_price = round(entry_price * 1.15, 2)
        if stop_loss_price is None or stop_loss_price <= 0.0:
            stop_loss_price = round(entry_price * 0.95, 2)

        item_id = f"watch-{uuid4().hex[:8]}"
        now = datetime.now(tz=UTC)
        now_str = now.isoformat()

        item = WatchlistItem(
            id=item_id,
            symbol=clean_symbol,
            company_name=company_name,
            setup_type=setup_type,
            entry_date=now.astimezone(ZoneInfo("Asia/Kolkata")).date().isoformat(),
            entry_price=entry_price,
            target_price=target_price,
            stop_loss_price=stop_loss_price,
            status="waiting_for_trigger",
            created_at=now_str,
        )

        self._cache.add_watchlist_item(item)

        return {
            "id": item.id,
            "symbol": item.symbol,
            "company_name": item.company_name,
            "setup_type": item.setup_type,
            "entry_date": item.entry_date,
            "entry_price": item.entry_price,
            "target_price": item.target_price,
            "stop_loss_price": item.stop_loss_price,
            "status": item.status,
            "created_at": item.created_at,
        }

    def get_items(self) -> list[dict[str, Any]]:
        raw_items = self._cache.list_watchlist_items()
        result: list[dict[str, Any]] = []

        for item in raw_items:
            # Query recent daily bars for symbol
            bars = self._cache.get(item.symbol, "1day")
            current_price = item.entry_price
            status = item.status

            if bars:
                latest_bar = bars[-1]
                current_price = latest_bar.close

                # Evaluate performance only on bars at or after the setup's
                # entry date.  Looking at the full symbol history can mark a
                # newly bookmarked setup as already completed because an old
                # high or low happened before the setup existed.
                bars_since_entry = [
                    bar for bar in bars if bar.timestamp.date().isoformat() >= item.entry_date
                ]
                if item.status not in {"target_hit", "stop_loss_hit"}:
                    trigger_index = next(
                        (index for index, bar in enumerate(bars_since_entry) if bar.high >= item.entry_price),
                        None,
                    )
                    if trigger_index is None:
                        status = "waiting_for_trigger"
                    else:
                        # Daily OHLC cannot reveal which level traded first on the trigger candle.
                        outcome_bars = bars_since_entry[trigger_index + 1 :]
                        status = "active"
                        for bar in outcome_bars:
                            if bar.low <= item.stop_loss_price:
                                status = "stop_loss_hit"
                                break
                            if bar.high >= item.target_price:
                                status = "target_hit"
                                break

                if status != item.status:
                    self._cache.update_watchlist_status(item.id, status)

            pnl_pct = ((current_price / item.entry_price) - 1.0) * 100.0 if item.entry_price > 0 else 0.0

            result.append(
                {
                    "id": item.id,
                    "symbol": item.symbol,
                    "company_name": item.company_name,
                    "setup_type": item.setup_type,
                    "entry_date": item.entry_date,
                    "entry_price": item.entry_price,
                    "target_price": item.target_price,
                    "stop_loss_price": item.stop_loss_price,
                    "current_price": round(current_price, 2),
                    "pnl_pct": round(pnl_pct, 2),
                    "status": status,
                    "created_at": item.created_at,
                }
            )

        return result

    def delete_item(self, item_id: str) -> bool:
        return self._cache.delete_watchlist_item(item_id)
