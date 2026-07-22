"""Persistent local OHLCV cache used to avoid repeated remote data calls."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
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


@dataclass(frozen=True, slots=True)
class Instrument:
    symbol: str
    company_name: str
    industry: str | None
    series: str | None
    isin: str | None


@dataclass(frozen=True, slots=True)
class MarketAvailability:
    symbol: str
    timeframe: str
    bars: int
    earliest: datetime | None
    latest: datetime | None
    latest_close: float | None


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
                CREATE TABLE IF NOT EXISTS instruments (
                    symbol TEXT PRIMARY KEY,
                    company_name TEXT NOT NULL,
                    industry TEXT,
                    series TEXT,
                    isin TEXT,
                    universe TEXT NOT NULL,
                    source TEXT NOT NULL,
                    refreshed_at TEXT NOT NULL
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
        by_symbol: dict[str, tuple[str, int, str | None, str | None]] = {}
        with self._connect() as connection:
            for chunk in _chunks(clean_symbols):
                placeholders = ", ".join("?" for _ in chunk)
                rows = connection.execute(
                    f"""
                    SELECT symbol, COUNT(*), MIN(timestamp), MAX(timestamp)
                    FROM ohlcv_bars
                    WHERE timeframe = ? AND symbol IN ({placeholders})
                    GROUP BY symbol
                    """,
                    (timeframe, *chunk),
                ).fetchall()
                by_symbol.update({row[0]: row for row in rows})
        return [
            SymbolCoverage(
                symbol=symbol,
                bars=int(by_symbol[symbol][1]) if symbol in by_symbol else 0,
                earliest=_parse_optional_datetime(by_symbol[symbol][2]) if symbol in by_symbol else None,
                latest=_parse_optional_datetime(by_symbol[symbol][3]) if symbol in by_symbol else None,
            )
            for symbol in clean_symbols
        ]

    def coverage_days(self, symbols: list[str], timeframe: str, start: date, end: date) -> dict[str, int]:
        """Return exact NSE archive coverage counts for a date range.

        Queries are chunked because the full NSE equity catalogue is larger than
        SQLite's commonly configured bound-parameter limit.
        """
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        counts = dict.fromkeys(clean_symbols, 0)
        if not clean_symbols or start > end:
            return counts
        with self._connect() as connection:
            for chunk in _chunks(clean_symbols):
                placeholders = ", ".join("?" for _ in chunk)
                rows = connection.execute(
                    f"""
                    SELECT symbol, COUNT(DISTINCT trading_day)
                    FROM nse_import_coverage
                    WHERE timeframe = ? AND trading_day >= ? AND trading_day <= ?
                      AND symbol IN ({placeholders})
                    GROUP BY symbol
                    """,
                    (timeframe, start.isoformat(), end.isoformat(), *chunk),
                ).fetchall()
                for symbol, count in rows:
                    counts[str(symbol)] = int(count)
        return counts

    def bars_in_range(self, symbols: list[str], timeframe: str, start: date, end: date) -> dict[str, int]:
        """Return cached OHLCV bar counts inside an inclusive date range."""
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        counts = dict.fromkeys(clean_symbols, 0)
        if not clean_symbols or start > end:
            return counts
        start_stamp = f"{start.isoformat()}T00:00:00+00:00"
        end_stamp = f"{end.isoformat()}T23:59:59.999999+00:00"
        with self._connect() as connection:
            for chunk in _chunks(clean_symbols):
                placeholders = ", ".join("?" for _ in chunk)
                rows = connection.execute(
                    f"""
                    SELECT symbol, COUNT(*)
                    FROM ohlcv_bars
                    WHERE timeframe = ? AND timestamp >= ? AND timestamp <= ?
                      AND symbol IN ({placeholders})
                    GROUP BY symbol
                    """,
                    (timeframe, start_stamp, end_stamp, *chunk),
                ).fetchall()
                for symbol, count in rows:
                    counts[str(symbol)] = int(count)
        return counts

    def is_nse_day_covered(self, symbols: list[str], timeframe: str, trading_day: date) -> bool:
        """Whether this exact official archive/day was already processed for every symbol."""
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        if not clean_symbols:
            return True
        with self._connect() as connection:
            count = 0
            for chunk in _chunks(clean_symbols):
                placeholders = ", ".join("?" for _ in chunk)
                count += int(connection.execute(
                    f"""
                    SELECT COUNT(DISTINCT symbol)
                    FROM nse_import_coverage
                    WHERE timeframe = ? AND trading_day = ? AND symbol IN ({placeholders})
                    """,
                    (timeframe, trading_day.isoformat(), *chunk),
                ).fetchone()[0])
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

    def replace_instruments(self, instruments: list[Instrument], universe: str, source: str) -> int:
        """Atomically replace a downloaded universe so removed constituents disappear too."""
        refreshed_at = datetime.now(UTC).isoformat()
        with self._connect() as connection:
            connection.execute("DELETE FROM instruments WHERE universe = ?", (universe,))
            connection.executemany(
                """
                INSERT INTO instruments (symbol, company_name, industry, series, isin, universe, source, refreshed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol) DO UPDATE SET
                    company_name = excluded.company_name, industry = excluded.industry,
                    series = excluded.series, isin = excluded.isin, universe = excluded.universe,
                    source = excluded.source, refreshed_at = excluded.refreshed_at
                """,
                [
                    (item.symbol, item.company_name, item.industry, item.series, item.isin, universe, source, refreshed_at)
                    for item in instruments
                ],
            )
        return len(instruments)

    def search_instruments(self, query: str = "", universe: str | None = None, limit: int = 50) -> list[Instrument]:
        clean_query = f"%{query.strip().upper()}%"
        with self._connect() as connection:
            if universe:
                rows = connection.execute(
                    """SELECT symbol, company_name, industry, series, isin FROM instruments
                    WHERE universe = ? AND (UPPER(symbol) LIKE ? OR UPPER(company_name) LIKE ? OR UPPER(COALESCE(industry, '')) LIKE ?)
                    ORDER BY symbol LIMIT ?""",
                    (universe, clean_query, clean_query, clean_query, limit),
                ).fetchall()
            else:
                rows = connection.execute(
                    """SELECT symbol, company_name, industry, series, isin FROM instruments
                    WHERE UPPER(symbol) LIKE ? OR UPPER(company_name) LIKE ? OR UPPER(COALESCE(industry, '')) LIKE ?
                    ORDER BY symbol LIMIT ?""",
                    (clean_query, clean_query, clean_query, limit),
                ).fetchall()
        return [Instrument(*row) for row in rows]

    def stored_symbols(self, query: str = "", limit: int = 500) -> list[str]:
        """Return symbols that have OHLCV rows, including symbols outside the catalogue."""
        clean_query = f"%{query.strip().upper()}%"
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT DISTINCT symbol FROM ohlcv_bars WHERE UPPER(symbol) LIKE ? ORDER BY symbol LIMIT ?",
                (clean_query, limit),
            ).fetchall()
        return [str(row[0]) for row in rows]

    def universe_symbols(self, universe: str | None = None) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute("SELECT symbol FROM instruments WHERE universe = ? ORDER BY symbol", (universe,)).fetchall() if universe else connection.execute("SELECT symbol FROM instruments ORDER BY symbol").fetchall()
        return [str(row[0]) for row in rows]

    def market_availability(self, symbol: str, timeframe: str = "1day") -> MarketAvailability:
        clean_symbol = symbol.strip().upper().removesuffix(".NS")
        with self._connect() as connection:
            summary = connection.execute(
                """
                SELECT COUNT(*), MIN(timestamp), MAX(timestamp)
                FROM ohlcv_bars WHERE symbol = ? AND timeframe = ?
                """,
                (clean_symbol, timeframe),
            ).fetchone()
            latest = connection.execute(
                """
                SELECT close FROM ohlcv_bars
                WHERE symbol = ? AND timeframe = ? ORDER BY timestamp DESC LIMIT 1
                """,
                (clean_symbol, timeframe),
            ).fetchone()
        return MarketAvailability(
            symbol=clean_symbol,
            timeframe=timeframe,
            bars=int(summary[0]),
            earliest=datetime.fromisoformat(summary[1]) if summary[1] else None,
            latest=datetime.fromisoformat(summary[2]) if summary[2] else None,
            latest_close=float(latest[0]) if latest else None,
        )

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)


def _stamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def _parse_optional_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _chunks(values: list[str], size: int = 500) -> Iterator[list[str]]:
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]
