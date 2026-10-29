"""Persistent local OHLCV cache used to avoid repeated remote data calls."""

from __future__ import annotations

import json
import sqlite3
from collections import OrderedDict
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


@dataclass(frozen=True, slots=True)
class WatchlistItem:
    id: str
    symbol: str
    company_name: str
    setup_type: str
    entry_date: str
    entry_price: float
    target_price: float
    stop_loss_price: float
    status: str
    created_at: str


@dataclass(frozen=True, slots=True)
class FiiDiiRow:
    trading_day: date
    participant: str
    scope: str
    segment: str
    buy_value: float
    sell_value: float
    net_value: float
    source: str


@dataclass(frozen=True, slots=True)
class IndexClose:
    trading_day: date
    close: float
    source: str


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
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS nse_archive_days (
                    trading_day TEXT PRIMARY KEY,
                    archive_path TEXT,
                    source_url TEXT,
                    row_count INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'available',
                    saved_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS nse_bhavcopy_rows (
                    trading_day TEXT NOT NULL,
                    row_number INTEGER NOT NULL,
                    symbol TEXT,
                    series TEXT,
                    payload TEXT NOT NULL,
                    PRIMARY KEY (trading_day, row_number)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS cache_summary (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    symbols INTEGER NOT NULL,
                    bars INTEGER NOT NULL,
                    earliest TEXT,
                    latest TEXT,
                    refreshed_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS watchlist_items (
                    id TEXT PRIMARY KEY,
                    symbol TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    setup_type TEXT NOT NULL,
                    entry_date TEXT NOT NULL,
                    entry_price REAL NOT NULL,
                    target_price REAL NOT NULL,
                    stop_loss_price REAL NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS fii_dii_rows (
                    trading_day TEXT NOT NULL,
                    participant TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    segment TEXT NOT NULL,
                    buy_value REAL NOT NULL,
                    sell_value REAL NOT NULL,
                    net_value REAL NOT NULL,
                    source TEXT NOT NULL,
                    PRIMARY KEY (trading_day, participant, scope, segment)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS fii_dii_snapshots (
                    snapshot_id TEXT PRIMARY KEY,
                    fetched_at TEXT NOT NULL,
                    source_url TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS fii_dii_history_rows (
                    trading_day TEXT NOT NULL,
                    participant TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    segment TEXT NOT NULL,
                    buy_value REAL NOT NULL,
                    sell_value REAL NOT NULL,
                    net_value REAL NOT NULL,
                    source TEXT NOT NULL,
                    PRIMARY KEY (trading_day, participant, scope, segment)
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS nifty50_closes (
                    trading_day TEXT PRIMARY KEY,
                    close REAL NOT NULL,
                    source TEXT NOT NULL
                )
                """
            )
            # These read paths are used by the data-management screen on every
            # visit. Keep the date-coverage and archive lookups indexed so a
            # large NSE catalogue does not turn the first render into a scan.
            connection.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_time_symbol_timestamp ON ohlcv_bars (timeframe, symbol, timestamp)")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_ohlcv_symbol_tf_ts ON ohlcv_bars (symbol, timeframe, timestamp)")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_coverage_time_day_symbol ON nse_import_coverage (timeframe, trading_day, symbol)")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_archive_status_day ON nse_archive_days (status, trading_day)")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_fii_dii_scope_day ON fii_dii_rows (scope, segment, trading_day)")

    def get(self, symbol: str, timeframe: str = "1day", start: datetime | None = None, end: datetime | None = None) -> list[OHLCVBar]:
        if start is None:
            start = datetime(1970, 1, 1, tzinfo=UTC)
        if end is None:
            end = datetime(2099, 12, 31, tzinfo=UTC)

        cache_key = (symbol.upper(), timeframe, _stamp(start), _stamp(end))
        if hasattr(self, "_lru_cache") and cache_key in self._lru_cache:
            self._lru_cache.move_to_end(cache_key)
            return self._lru_cache[cache_key]

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
        result = [
            OHLCVBar(
                timestamp=datetime.fromisoformat(row[0]),
                symbol=symbol.upper(),
                open=row[1], high=row[2], low=row[3], close=row[4], volume=row[5],
            )
            for row in rows
        ]
        if not hasattr(self, "_lru_cache"):
            self._lru_cache = OrderedDict()
        self._lru_cache[cache_key] = result
        self._lru_cache.move_to_end(cache_key)
        if len(self._lru_cache) > 256:
            self._lru_cache.popitem(last=False)
        return result

    def get_recent_bars(self, symbols: list[str], timeframe: str = "1day", limit: int = 20) -> dict[str, list[OHLCVBar]]:
        """Read a bounded recent window per symbol without loading its full history."""
        if limit < 1:
            raise ValueError("limit must be positive")
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        bars_by_symbol: dict[str, list[OHLCVBar]] = {}
        with self._connect() as connection:
            for symbol in clean_symbols:
                rows = connection.execute(
                    """
                    SELECT timestamp, open, high, low, close, volume
                    FROM ohlcv_bars
                    WHERE symbol = ? AND timeframe = ?
                    ORDER BY timestamp DESC LIMIT ?
                    """,
                    (symbol, timeframe, limit),
                ).fetchall()
                if rows:
                    bars_by_symbol[symbol] = [
                        OHLCVBar(
                            timestamp=datetime.fromisoformat(row[0]),
                            symbol=symbol,
                            open=row[1],
                            high=row[2],
                            low=row[3],
                            close=row[4],
                            volume=row[5],
                        )
                        for row in reversed(rows)
                    ]
        return bars_by_symbol

    def clear_lru_cache(self) -> None:
        if hasattr(self, "_lru_cache"):
            self._lru_cache.clear()

    def put(self, bars: list[OHLCVBar], timeframe: str, source: str) -> int:
        self.clear_lru_cache()
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
            row = connection.execute("SELECT symbols, bars, earliest, latest FROM cache_summary WHERE id = 1").fetchone()
            if row is None:
                return self.refresh_summary(connection)
            symbols, bars, earliest, latest = row
        return CacheSummary(
            symbols=int(symbols), bars=int(bars),
            earliest=datetime.fromisoformat(earliest) if earliest else None,
            latest=datetime.fromisoformat(latest) if latest else None,
        )

    def get_available_symbols(self) -> list[str]:
        with self._connect() as connection:
            rows = connection.execute("SELECT DISTINCT symbol FROM ohlcv_bars").fetchall()
        return [row[0] for row in rows]

    def refresh_summary(self, connection: sqlite3.Connection | None = None) -> CacheSummary:
        """Refresh the persisted summary after a batch import or migration."""
        owns_connection = connection is None
        active_connection = connection or self._connect()
        try:
            symbols, bars, earliest, latest = active_connection.execute(
                "SELECT COUNT(DISTINCT symbol), COUNT(*), MIN(timestamp), MAX(timestamp) FROM ohlcv_bars"
            ).fetchone()
            active_connection.execute(
                """
                INSERT INTO cache_summary (id, symbols, bars, earliest, latest, refreshed_at)
                VALUES (1, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    symbols = excluded.symbols, bars = excluded.bars,
                    earliest = excluded.earliest, latest = excluded.latest,
                    refreshed_at = excluded.refreshed_at
                """,
                (int(symbols), int(bars), earliest, latest, datetime.now(UTC).isoformat()),
            )
            if owns_connection:
                active_connection.commit()
            return CacheSummary(
                symbols=int(symbols), bars=int(bars),
                earliest=datetime.fromisoformat(earliest) if earliest else None,
                latest=datetime.fromisoformat(latest) if latest else None,
            )
        finally:
            if owns_connection:
                active_connection.close()

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
            archive_days = {
                str(row[0])
                for row in connection.execute(
                    """
                    SELECT trading_day FROM nse_archive_days
                    WHERE status = 'available' AND trading_day >= ? AND trading_day <= ?
                    """,
                    (start.isoformat(), end.isoformat()),
                ).fetchall()
            }
            covered_days = {symbol: set(archive_days) for symbol in clean_symbols}
            for chunk in _chunks(clean_symbols):
                placeholders = ", ".join("?" for _ in chunk)
                rows = connection.execute(
                    f"""
                    SELECT symbol, trading_day
                    FROM nse_import_coverage
                    WHERE timeframe = ? AND trading_day >= ? AND trading_day <= ?
                      AND symbol IN ({placeholders})
                    """,
                    (timeframe, start.isoformat(), end.isoformat(), *chunk),
                ).fetchall()
                for symbol, trading_day in rows:
                    if str(symbol) in covered_days:
                        covered_days[str(symbol)].add(str(trading_day))
            for symbol, days in covered_days.items():
                counts[symbol] = len(days)
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
            archive_exists = connection.execute(
                "SELECT 1 FROM nse_archive_days WHERE trading_day = ? AND status = 'available'",
                (trading_day.isoformat(),),
            ).fetchone()
            if archive_exists:
                return True
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

    def is_nse_day_unavailable(self, trading_day: date) -> bool:
        """Whether NSE already confirmed that no archive exists for this date."""
        with self._connect() as connection:
            return connection.execute(
                "SELECT 1 FROM nse_archive_days WHERE trading_day = ? AND status = 'unavailable'",
                (trading_day.isoformat(),),
            ).fetchone() is not None

    def mark_nse_day_covered(self, symbols: list[str], timeframe: str, trading_day: date) -> None:
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        if not clean_symbols:
            return
        self.record_nse_archive(trading_day, None, None, 0)
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO nse_import_coverage (symbol, timeframe, trading_day)
                VALUES (?, ?, ?)
                ON CONFLICT(symbol, timeframe, trading_day) DO NOTHING
                """,
                [(symbol, timeframe, trading_day.isoformat()) for symbol in clean_symbols],
            )

    def record_nse_archive(self, trading_day: date, archive_path: str | None, source_url: str | None, row_count: int) -> None:
        """Record one complete official NSE archive so it is never fetched twice."""
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO nse_archive_days (trading_day, archive_path, source_url, row_count, status, saved_at)
                VALUES (?, ?, ?, ?, 'available', ?)
                ON CONFLICT(trading_day) DO UPDATE SET
                    archive_path = COALESCE(excluded.archive_path, nse_archive_days.archive_path),
                    source_url = COALESCE(excluded.source_url, nse_archive_days.source_url),
                    row_count = CASE WHEN excluded.row_count > 0 THEN excluded.row_count ELSE nse_archive_days.row_count END,
                    status = 'available', saved_at = excluded.saved_at
                """,
                (trading_day.isoformat(), archive_path, source_url, row_count, datetime.now(UTC).isoformat()),
            )

    def record_nse_day_unavailable(self, trading_day: date, source_url: str | None) -> None:
        """Remember an official 404 so it is not requested repeatedly."""
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO nse_archive_days (trading_day, archive_path, source_url, row_count, status, saved_at)
                VALUES (?, NULL, ?, 0, 'unavailable', ?)
                ON CONFLICT(trading_day) DO NOTHING
                """,
                (trading_day.isoformat(), source_url, datetime.now(UTC).isoformat()),
            )

    def store_nse_archive(
        self,
        trading_day: date,
        rows: list[dict[str, str]],
        bars: list[OHLCVBar],
        timeframe: str,
        source: str,
        symbols: list[str],
        archive_path: str | None,
        source_url: str | None,
    ) -> tuple[int, int]:
        """Persist one complete NSE archive in one SQLite transaction.

        The raw archive rows, normalized OHLCV bars, archive completion marker,
        and requested-symbol coverage are committed together. This prevents a
        partially imported day from being treated as complete after a crash.
        """
        clean_symbols = sorted({symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()})
        trading_day_text = trading_day.isoformat()
        raw_records = self._nse_archive_row_records(trading_day, rows)
        bar_records = [
            (bar.symbol.upper(), timeframe, _stamp(bar.timestamp), bar.open, bar.high, bar.low, bar.close, bar.volume, source)
            for bar in bars
        ]
        with self._connect() as connection:
            if raw_records:
                connection.executemany(
                    """
                    INSERT INTO nse_bhavcopy_rows (trading_day, row_number, symbol, series, payload)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(trading_day, row_number) DO UPDATE SET
                        symbol = excluded.symbol, series = excluded.series, payload = excluded.payload
                    """,
                    raw_records,
                )
            if bar_records:
                connection.executemany(
                    """
                    INSERT INTO ohlcv_bars (symbol, timeframe, timestamp, open, high, low, close, volume, source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(symbol, timeframe, timestamp) DO UPDATE SET
                        open = excluded.open, high = excluded.high, low = excluded.low,
                        close = excluded.close, volume = excluded.volume, source = excluded.source
                    """,
                    bar_records,
                )
            connection.execute(
                """
                INSERT INTO nse_archive_days (trading_day, archive_path, source_url, row_count, status, saved_at)
                VALUES (?, ?, ?, ?, 'available', ?)
                ON CONFLICT(trading_day) DO UPDATE SET
                    archive_path = COALESCE(excluded.archive_path, nse_archive_days.archive_path),
                    source_url = COALESCE(excluded.source_url, nse_archive_days.source_url),
                    row_count = CASE WHEN excluded.row_count > 0 THEN excluded.row_count ELSE nse_archive_days.row_count END,
                    status = 'available', saved_at = excluded.saved_at
                """,
                (trading_day_text, archive_path, source_url, len(rows), datetime.now(UTC).isoformat()),
            )
            connection.executemany(
                """
                INSERT INTO nse_import_coverage (symbol, timeframe, trading_day)
                VALUES (?, ?, ?)
                ON CONFLICT(symbol, timeframe, trading_day) DO NOTHING
                """,
                [(symbol, timeframe, trading_day_text) for symbol in clean_symbols],
            )
        return len(raw_records), len(bar_records)

    def put_nse_archive_rows(self, trading_day: date, rows: list[dict[str, str]]) -> int:
        """Persist every raw row from an archive for future fields and research."""
        if not rows:
            return 0
        records = self._nse_archive_row_records(trading_day, rows)
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO nse_bhavcopy_rows (trading_day, row_number, symbol, series, payload)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(trading_day, row_number) DO UPDATE SET
                    symbol = excluded.symbol, series = excluded.series, payload = excluded.payload
                """,
                records,
            )
        self.refresh_summary()
        return len(records)

    def store_fii_dii_snapshot(
        self,
        snapshot_id: str,
        fetched_at: datetime,
        source_url: str,
        payload: str,
        rows: list[FiiDiiRow],
    ) -> int:
        """Persist an official institutional-flow snapshot and normalized rows atomically."""
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO fii_dii_snapshots (snapshot_id, fetched_at, source_url, payload)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(snapshot_id) DO UPDATE SET
                    fetched_at = excluded.fetched_at,
                    source_url = excluded.source_url,
                    payload = excluded.payload
                """,
                (snapshot_id, fetched_at.isoformat(), source_url, payload),
            )
            connection.executemany(
                """
                INSERT INTO fii_dii_rows
                    (trading_day, participant, scope, segment, buy_value, sell_value, net_value, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(trading_day, participant, scope, segment) DO UPDATE SET
                    buy_value = excluded.buy_value,
                    sell_value = excluded.sell_value,
                    net_value = excluded.net_value,
                    source = excluded.source
                """,
                [
                    (
                        row.trading_day.isoformat(), row.participant, row.scope, row.segment,
                        row.buy_value, row.sell_value, row.net_value, row.source,
                    )
                    for row in rows
                ],
            )
        return len(rows)

    def get_fii_dii_rows(
        self,
        start: date,
        end: date,
        scope: str = "combined",
        segment: str = "equity",
    ) -> list[FiiDiiRow]:
        with self._connect() as connection:
            records = connection.execute(
                """
                SELECT trading_day, participant, scope, segment, buy_value, sell_value, net_value, source
                FROM fii_dii_rows
                WHERE trading_day >= ? AND trading_day <= ? AND scope = ? AND segment = ?
                ORDER BY trading_day ASC, participant ASC
                """,
                (start.isoformat(), end.isoformat(), scope, segment),
            ).fetchall()
        return [
            FiiDiiRow(
                trading_day=date.fromisoformat(str(record[0])), participant=str(record[1]), scope=str(record[2]),
                segment=str(record[3]), buy_value=float(record[4]), sell_value=float(record[5]),
                net_value=float(record[6]), source=str(record[7]),
            )
            for record in records
        ]

    def get_fii_dii_history_rows(self, start: date, end: date) -> list[FiiDiiRow]:
        with self._connect() as connection:
            records = connection.execute(
                """
                SELECT trading_day, participant, scope, segment, buy_value, sell_value, net_value, source
                FROM fii_dii_history_rows
                WHERE trading_day >= ? AND trading_day <= ?
                ORDER BY trading_day ASC, participant ASC
                """,
                (start.isoformat(), end.isoformat()),
            ).fetchall()
        return [
            FiiDiiRow(
                trading_day=date.fromisoformat(str(record[0])), participant=str(record[1]), scope=str(record[2]),
                segment=str(record[3]), buy_value=float(record[4]), sell_value=float(record[5]),
                net_value=float(record[6]), source=str(record[7]),
            )
            for record in records
        ]

    def store_fii_dii_history_rows(self, rows: list[FiiDiiRow]) -> int:
        """Upsert Tapetide's historical series without touching NSE snapshots."""
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO fii_dii_history_rows
                    (trading_day, participant, scope, segment, buy_value, sell_value, net_value, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(trading_day, participant, scope, segment) DO UPDATE SET
                    buy_value = excluded.buy_value,
                    sell_value = excluded.sell_value,
                    net_value = excluded.net_value,
                    source = excluded.source
                """,
                [
                    (
                        row.trading_day.isoformat(), row.participant, row.scope, row.segment,
                        row.buy_value, row.sell_value, row.net_value, row.source,
                    )
                    for row in rows
                ],
            )
        return len(rows)

    def fii_dii_history_coverage(self) -> tuple[date | None, date | None, int]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT MIN(trading_day), MAX(trading_day), COUNT(DISTINCT trading_day) FROM fii_dii_history_rows"
            ).fetchone()
        return (
            date.fromisoformat(str(row[0])) if row and row[0] else None,
            date.fromisoformat(str(row[1])) if row and row[1] else None,
            int(row[2] or 0) if row else 0,
        )

    def fii_dii_coverage(self, scope: str = "combined", segment: str = "equity") -> tuple[date | None, date | None, int]:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT MIN(trading_day), MAX(trading_day), COUNT(DISTINCT trading_day)
                FROM fii_dii_rows WHERE scope = ? AND segment = ?
                """,
                (scope, segment),
            ).fetchone()
        return (
            date.fromisoformat(str(row[0])) if row and row[0] else None,
            date.fromisoformat(str(row[1])) if row and row[1] else None,
            int(row[2] or 0) if row else 0,
        )

    def store_index_closes(self, closes: list[IndexClose]) -> int:
        with self._connect() as connection:
            connection.executemany(
                """
                INSERT INTO nifty50_closes (trading_day, close, source)
                VALUES (?, ?, ?)
                ON CONFLICT(trading_day) DO UPDATE SET close = excluded.close, source = excluded.source
                """,
                [(item.trading_day.isoformat(), item.close, item.source) for item in closes],
            )
        return len(closes)

    def get_index_closes(self, start: date, end: date) -> list[IndexClose]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT trading_day, close, source FROM nifty50_closes WHERE trading_day >= ? AND trading_day <= ? ORDER BY trading_day",
                (start.isoformat(), end.isoformat()),
            ).fetchall()
        return [IndexClose(date.fromisoformat(str(row[0])), float(row[1]), str(row[2])) for row in rows]

    @staticmethod
    def _nse_archive_row_records(trading_day: date, rows: list[dict[str, str]]) -> list[tuple[str, int, str | None, str | None, str]]:
        records = []
        for row_number, row in enumerate(rows):
            normalized = {key.strip().upper(): str(value).strip() for key, value in row.items() if key}
            records.append(
                (
                    trading_day.isoformat(),
                    row_number,
                    normalized.get("SYMBOL") or normalized.get("TCKRSYMB"),
                    normalized.get("SERIES") or normalized.get("SCTYSRS"),
                    json.dumps(row, ensure_ascii=False, sort_keys=True),
                )
            )
        return records

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

    def add_watchlist_item(self, item: WatchlistItem) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO watchlist_items (id, symbol, company_name, setup_type, entry_date, entry_price, target_price, stop_loss_price, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.id,
                    item.symbol,
                    item.company_name,
                    item.setup_type,
                    item.entry_date,
                    item.entry_price,
                    item.target_price,
                    item.stop_loss_price,
                    item.status,
                    item.created_at,
                ),
            )

    def list_watchlist_items(self) -> list[WatchlistItem]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT id, symbol, company_name, setup_type, entry_date, entry_price, target_price, stop_loss_price, status, created_at FROM watchlist_items ORDER BY created_at DESC"
            ).fetchall()
        return [
            WatchlistItem(
                id=r[0],
                symbol=r[1],
                company_name=r[2],
                setup_type=r[3],
                entry_date=r[4],
                entry_price=float(r[5]),
                target_price=float(r[6]),
                stop_loss_price=float(r[7]),
                status=r[8],
                created_at=r[9],
            )
            for r in rows
        ]

    def delete_watchlist_item(self, item_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM watchlist_items WHERE id = ?", (item_id,))
            return cursor.rowcount > 0

    def update_watchlist_status(self, item_id: str, status: str) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE watchlist_items SET status = ? WHERE id = ?", (status, item_id))

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
        connection = sqlite3.connect(self.path, timeout=30.0)
        connection.execute("PRAGMA busy_timeout = 30000")
        return connection


def _stamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat()


def _parse_optional_datetime(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value) if value else None


def _chunks(values: list[str], size: int = 500) -> Iterator[list[str]]:
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]
