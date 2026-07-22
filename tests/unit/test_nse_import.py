from datetime import date

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
