import csv
import io
import sqlite3
import zipfile
from datetime import UTC, date, datetime
from pathlib import Path

from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.nse_import import NseBhavcopyImporter


def test_nse_importer_accepts_legacy_bhavcopy_columns() -> None:
    bars = NseBhavcopyImporter._bars_for_rows(
        [{"SYMBOL": "HDFCBANK", "SERIES": "EQ", "OPEN": "100", "HIGH": "105", "LOW": "99", "CLOSE": "102", "TOTTRDQTY": "5000"}],
        {"HDFCBANK"},
        date(2025, 1, 2),
    )

    assert len(bars) == 1
    assert bars[0].close == 102
    assert bars[0].symbol == "HDFCBANK"


def test_nse_importer_accepts_udiff_columns() -> None:
    bars = NseBhavcopyImporter._bars_for_rows(
        [{"TckrSymb": "BANKBEES", "SctySrs": "ETF", "OpnPric": "50", "HghPric": "54", "LwPric": "49", "ClsPric": "52", "TtlTradgVol": "100"}],
        {"BANKBEES"},
        date(2025, 1, 2),
    )

    assert len(bars) == 1
    assert bars[0].volume == 100


def test_nse_importer_accepts_legacy_historical_columns() -> None:
    bars = NseBhavcopyImporter._bars_for_rows(
        [{
            "SYMBOL": "RELIANCE",
            "SERIES": "EQ",
            "OPEN_PRICE": "100",
            "HIGH_PRICE": "105",
            "LOW_PRICE": "99",
            "CLOSE_PRICE": "102",
            "TTL_TRD_QNTY": "5000",
        }],
        {"RELIANCE"},
        date(2020, 1, 2),
    )

    assert len(bars) == 1
    assert bars[0].close == 102
    assert bars[0].volume == 5000


def test_nse_importer_uses_legacy_url_before_2024_and_year_archive_folder(tmp_path: Path) -> None:
    importer = NseBhavcopyImporter(SqliteMarketCache(tmp_path / "market.sqlite3"))

    assert "/2020/JAN/cm02JAN2020bhav.csv.zip" in importer._archive_url(date(2020, 1, 2))
    assert importer._archive_file(date(2020, 1, 2)).parent.name == "2020"
    assert "/2024" in str(importer._archive_file(date(2024, 1, 2)))


def test_nse_importer_skips_a_day_already_recorded_for_the_requested_symbols(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.mark_nse_day_covered(["RELIANCE"], "1day", date(2025, 1, 2))
    importer = NseBhavcopyImporter(cache)

    result = importer.import_daily_universe(["RELIANCE"], date(2025, 1, 2), date(2025, 1, 2))

    assert result.downloaded_days == 0
    assert result.already_available_days == 1


def test_nse_importer_remembers_unavailable_archive_days(tmp_path: Path, monkeypatch) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = NseBhavcopyImporter(cache)
    monkeypatch.setattr(importer, "_download_day", lambda _: None)

    first = importer.import_daily_universe(["RELIANCE"], date(2020, 1, 2), date(2020, 1, 2))
    second = importer.import_daily_universe(["RELIANCE"], date(2020, 1, 2), date(2020, 1, 2))

    assert first.skipped_days == 1
    assert second.skipped_days == 1
    assert cache.is_nse_day_unavailable(date(2020, 1, 2))


def test_nse_importer_reports_progress_for_cache_and_download_steps(tmp_path: Path, monkeypatch) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = NseBhavcopyImporter(cache)
    events: list[tuple[str, int, int]] = []
    monkeypatch.setattr(importer, "_download_day", lambda _: [])

    result = importer.import_daily_universe(
        ["RELIANCE"],
        date(2025, 1, 2),
        date(2025, 1, 3),
        progress=lambda stage, completed, total: events.append((stage, completed, total)),
    )

    assert result.downloaded_days == 2
    assert any(stage == "Downloading missing NSE archives" for stage, _, _ in events)
    assert any(stage == "Saving complete NSE archive to SQLite" for stage, _, _ in events)
    assert events[-1][1:] == (2, 2)


def test_importer_reuses_saved_archive_and_loads_all_equity_rows(tmp_path: Path, monkeypatch) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    importer = NseBhavcopyImporter(cache)
    trading_day = date(2025, 1, 2)
    rows = [
        {"TckrSymb": "RELIANCE", "SctySrs": "EQ", "OpnPric": "100", "HghPric": "105", "LwPric": "99", "ClsPric": "102", "TtlTradgVol": "1000"},
        {"TckrSymb": "INFY", "SctySrs": "EQ", "OpnPric": "200", "HghPric": "205", "LwPric": "199", "ClsPric": "202", "TtlTradgVol": "2000"},
        {"TckrSymb": "RELIANCE", "SctySrs": "FUT", "OpnPric": "100", "HghPric": "105", "LwPric": "99", "ClsPric": "102", "TtlTradgVol": "3000"},
    ]
    text = io.StringIO()
    writer = csv.DictWriter(text, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    importer._archive_file(trading_day).parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(importer._archive_file(trading_day), "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("BhavCopy.csv", text.getvalue())

    monkeypatch.setattr(importer, "_download_day", lambda _: (_ for _ in ()).throw(AssertionError("archive was downloaded again")))

    result = importer.import_daily_universe(["RELIANCE"], trading_day, trading_day)

    assert result.downloaded_days == 0
    assert result.reused_archive_days == 1
    assert result.archive_rows == 3
    assert result.stored_bars == 2
    assert cache.get(
        "INFY",
        "1day",
        datetime.combine(trading_day, datetime.min.time(), tzinfo=UTC),
        datetime.combine(trading_day, datetime.max.time(), tzinfo=UTC),
    )
    with sqlite3.connect(cache.path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM nse_bhavcopy_rows WHERE trading_day = ?", (trading_day.isoformat(),)).fetchone()[0] == 3
    assert cache.is_nse_day_covered(["TCS"], "1day", trading_day)
