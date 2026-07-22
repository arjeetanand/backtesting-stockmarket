from datetime import date
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


def test_nse_importer_skips_a_day_already_recorded_for_the_requested_symbols(tmp_path: Path) -> None:
    cache = SqliteMarketCache(tmp_path / "market.sqlite3")
    cache.mark_nse_day_covered(["RELIANCE"], "1day", date(2025, 1, 2))
    importer = NseBhavcopyImporter(cache)

    result = importer.import_daily_universe(["RELIANCE"], date(2025, 1, 2), date(2025, 1, 2))

    assert result.downloaded_days == 0
    assert result.already_available_days == 1
