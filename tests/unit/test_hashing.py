from datetime import datetime

from quant_research.domain.dsl.models import DateRange, StrategyMetadata
from quant_research.domain.utils.hashing import calculate_model_hash


def test_deterministic_hashing() -> None:
    meta1 = StrategyMetadata(name="Test Strategy", author="Researcher A", version="1.0.0")
    meta2 = StrategyMetadata(name="Test Strategy", author="Researcher A", version="1.0.0")

    hash1 = calculate_model_hash(meta1)
    hash2 = calculate_model_hash(meta2)

    assert hash1 == hash2


def test_hash_different_input() -> None:
    meta1 = StrategyMetadata(name="Test Strategy", author="Researcher A", version="1.0.0")
    meta2 = StrategyMetadata(name="Test Strategy", author="Researcher B", version="1.0.0")

    hash1 = calculate_model_hash(meta1)
    hash2 = calculate_model_hash(meta2)

    assert hash1 != hash2


def test_hash_date_range() -> None:
    d1 = DateRange(start=datetime(2023, 1, 1), end=datetime(2023, 12, 31))
    d2 = DateRange(start=datetime(2023, 1, 1), end=datetime(2023, 12, 31))

    assert calculate_model_hash(d1) == calculate_model_hash(d2)
