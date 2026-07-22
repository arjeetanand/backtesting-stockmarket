import hashlib
import json
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel


def calculate_model_hash(model: BaseModel) -> str:
    """Calculate a deterministic SHA-256 hash for a Pydantic model.

    This serializes the model to JSON, parses it back, and dumps it with
    sorted keys and compact separators to guarantee identical byte representations.
    """
    return calculate_value_hash(model.model_dump(mode="json"))


def calculate_value_hash(value: Any) -> str:
    """Calculate a deterministic SHA-256 hash for JSON-compatible values."""

    canonical_json = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        default=lambda item: item.isoformat() if isinstance(item, (date, datetime)) else str(item),
    )
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()
