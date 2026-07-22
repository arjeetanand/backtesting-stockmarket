from quant_research.services.nifty500_catalogue import Nifty500CatalogueImporter


def test_nifty500_catalogue_parser_normalizes_the_official_csv_shape() -> None:
    instruments = Nifty500CatalogueImporter._parse(
        "Company Name,Industry,Symbol,Series,ISIN Code\n"
        "Reliance Industries Ltd.,Oil Gas & Consumable Fuels,RELIANCE,EQ,INE002A01018\n"
        "Tata Consultancy Services Ltd.,Information Technology,TCS,EQ,INE467B01029\n"
        "Reliance Industries Ltd.,Oil Gas & Consumable Fuels,RELIANCE,EQ,INE002A01018\n"
    )

    assert [item.symbol for item in instruments] == ["RELIANCE", "TCS"]
    assert instruments[0].company_name == "Reliance Industries Ltd."
    assert instruments[1].industry == "Information Technology"
