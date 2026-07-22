from datetime import UTC, date, datetime
from pathlib import Path

from quant_research.domain.data.models import OHLCVBar
from quant_research.repositories.market_cache import Instrument, SqliteMarketCache


def test_sqlite_cache_round_trips_daily_bars(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    bar = OHLCVBar(
        timestamp=datetime(2025, 1, 2, tzinfo=UTC), symbol="RELIANCE", open=100, high=105, low=99, close=102, volume=1_000
    )

    assert cache.put([bar], "1day", "nse_common_bhavcopy") == 1
    cached = cache.get("RELIANCE", "1day", datetime(2025, 1, 1, tzinfo=UTC), datetime(2025, 1, 3, tzinfo=UTC))

    assert cached == [bar]
    assert cache.summary().bars == 1


def test_sqlite_cache_reports_coverage_and_records_processed_nse_days(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.put(
        [
            OHLCVBar(timestamp=datetime(2025, 1, 2, tzinfo=UTC), symbol="RELIANCE", open=100, high=105, low=99, close=102, volume=1_000),
            OHLCVBar(timestamp=datetime(2025, 1, 3, tzinfo=UTC), symbol="RELIANCE", open=102, high=106, low=101, close=104, volume=1_000),
        ],
        "1day",
        "nse_common_bhavcopy",
    )

    coverage = cache.coverage(["RELIANCE", "INFY"], "1day")

    assert coverage[0].symbol == "INFY"
    assert coverage[0].bars == 0
    assert coverage[1].covers(date(2025, 1, 2), date(2025, 1, 3))
    assert not cache.is_nse_day_covered(["RELIANCE", "INFY"], "1day", date(2025, 1, 2))

    cache.mark_nse_day_covered(["RELIANCE", "INFY"], "1day", date(2025, 1, 2))

    assert cache.is_nse_day_covered(["RELIANCE", "INFY"], "1day", date(2025, 1, 2))


def test_sqlite_cache_searches_a_persisted_instrument_catalogue(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.replace_instruments(
        [
            Instrument("RELIANCE", "Reliance Industries Ltd.", "Oil & Gas", "EQ", "INE002A01018"),
            Instrument("TCS", "Tata Consultancy Services Ltd.", "Information Technology", "EQ", "INE467B01029"),
        ],
        universe="nifty500",
        source="official-nse",
    )

    matches = cache.search_instruments("consultancy")

    assert [item.symbol for item in matches] == ["TCS"]
    assert cache.universe_symbols() == ["RELIANCE", "TCS"]


def test_sqlite_cache_reports_latest_daily_bar_for_ui_availability(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.put(
        [
            OHLCVBar(timestamp=datetime(2025, 1, 2, tzinfo=UTC), symbol="RELIANCE", open=100, high=105, low=99, close=102, volume=1_000),
            OHLCVBar(timestamp=datetime(2025, 1, 3, tzinfo=UTC), symbol="RELIANCE", open=102, high=108, low=101, close=107, volume=1_100),
        ],
        "1day",
        "nse_common_bhavcopy",
    )

    availability = cache.market_availability("RELIANCE.NS")

    assert availability.bars == 2
    assert availability.latest_close == 107
    assert availability.earliest == datetime(2025, 1, 2, tzinfo=UTC)
    assert availability.latest == datetime(2025, 1, 3, tzinfo=UTC)
