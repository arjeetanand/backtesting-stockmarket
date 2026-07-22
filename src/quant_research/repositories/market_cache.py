"""Persistent local OHLCV cache used to avoid repeated remote data calls."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from quant_research.domain.data.models import OHLCVBar


@dataclass(frozen=True, slots=True)
class CacheSummary:
    symbols: int
    bars: int
    earliest: datetime | None
    latest: datetime | None


@dataclass(frozen=True, slots=True)
class SymbolCoverage:
    """Local availability for one instrument at one timeframe."""

    symbol: str
    bars: int
    earliest: datetime | None
    latest: datetime | None

    def covers(self, start: date, end: date) -> bool:
        return bool(self.earliest and self.latest and self.earliest.date() <= start and self.latest.date() >= end)


class SqliteMarketCache:
    """Small, dependency-free local store. It contains research data only."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS ohlcv_bars (
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    open REAL NOT NULL,
                    high REAL NOT NULL,
                    low REAL NOT NULL,
                    close REAL NOT NULL,
                    volume REAL NOT NULL,
                    source TEXT NOT NULL,
                    PRIMARY KEY (symbol, timeframe, timestamp)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS nse_import_coverage (
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    trading_day TEXT NOT NULL,
                    PRIMARY KEY (symbol, timeframe, trading_day)
                )
                """
            )

    def get(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[OHLCVBar]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT timestamp, open, high, low, close, volume
                FROM ohlcv_bars
                WHERE symbol = ? AND timeframe = ? AND timestamp >= ? AND timestamp <= ?
                ORDER BY timestamp
                """,
                (symbol.upper(), timeframe, _stamp(start), _stamp(end)),
            ).fetchall()
        return [
            OHLCVBar(
                timestamp=datetime.fromisoformat(row[0]),
                symbol=symbol.upper(),
                open=row[1], high=row[2], low=row[3], close=row[4], volume=row[5],
            )
            for row in rows
        ]

    def put(self, bars: list[OHLCVBar], timeframe: str, source: str) -> int:
        if not bars:
            return 0
        records = [
            (bar.symbol.upper(), timeframe, _stamp(bar.timestamp), bar.open, bar.high, bar.low, bar.close, bar.volume, source)
            for bar in bars
        ]
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO ohlcv_bars (symbol, timeframe, timestamp, open, high, low, close, volume, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, timeframe, timestamp) DO UPDATE SET
                    open = excluded.open, high = excluded.high, low = excluded.low,
                    close = excluded.close, volume = excluded.volume, source = excluded.source
                """,
                records,
            )
        return len(records)

    def summary(self) -> CacheSummary:
        with self._connect() as connection:
            symbols, bars, earliest, latest = connection.execute(
                "SELECT COUNT(DISTINCT symbol), COUNT(*), MIN(timestamp), MAX(timestamp) FROM ohlcv_bars"
            ).fetchone()
        return CacheSummary(
            symbols=int(symbols), bars=int(bars),
            earliest=datetime.fromisoformat(earliest) if earliest else None,
            latest=datetime.fromisoformat(latest) if latest else None,
        )

    def coverage(self, symbols: list[str], timeframe: str) -> list[SymbolCoverage]:
        """Return per-symbol cached range without fetching an upstream provider."""
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        if not clean_symbols:
            return []
        placeholders = ", ".join("?" for _ in clean_symbols)
        with self._connect() as connection:
            rows = connection.execute(
                f"""
                SELECT symbol, COUNT(*), MIN(timestamp), MAX(timestamp)
                FROM ohlcv_bars
                WHERE timeframe = ? AND symbol IN ({placeholders})
                GROUP BY symbol
                """,
                (timeframe, *clean_symbols),
            ).fetchall()
        by_symbol = {row[0]: row for row in rows}
        return [
            SymbolCoverage(
                symbol=symbol,
                bars=int(by_symbol[symbol][1]) if symbol in by_symbol else 0,
                earliest=datetime.fromisoformat(by_symbol[symbol][2]) if symbol in by_symbol else None,
                latest=datetime.fromisoformat(by_symbol[symbol][3]) if symbol in by_symbol else None,
            )
            for symbol in clean_symbols
        ]

    def is_nse_day_covered(self, symbols: list[str], timeframe: str, trading_day: date) -> bool:
        """Whether this exact official archive/day was already processed for every symbol."""
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        if not clean_symbols:
            return True
        placeholders = ", ".join("?" for _ in clean_symbols)
        with self._connect() as connection:
            count = connection.execute(
                f"""
                SELECT COUNT(DISTINCT symbol)
                FROM nse_import_coverage
                WHERE timeframe = ? AND trading_day = ? AND symbol IN ({placeholders})
                """,
                (timeframe, trading_day.isoformat(), *clean_symbols),
            ).fetchone()[0]
        return int(count) == len(clean_symbols)

    def mark_nse_day_covered(self, symbols: list[str], timeframe: str, trading_day: date) -> None:
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        if not clean_symbols:
            return
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO nse_import_coverage (symbol, timeframe, trading_day)
                VALUES (?, ?, ?)
                ON CONFLICT(symbol, timeframe, trading_day) DO NOTHING
                """,
                [(symbol, timeframe, trading_day.isoformat()) for symbol in clean_symbols],
            )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)


def _stamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()
