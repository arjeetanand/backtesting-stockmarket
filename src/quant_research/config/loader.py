"""Validated loaders for appendable scanner and index configuration files."""

from __future__ import annotations

import json
from functools import lru_cache
from importlib.resources import files
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from quant_research.repositories.market_cache import SqliteMarketCache

OHLCV_FIELDS = frozenset({"open", "high", "low", "close", "volume"})
MembershipKind = Literal["snapshot", "local_catalogue"]


class ConfigValidationError(ValueError):
    """Raised when a checked-in scanner configuration is unsafe or malformed."""


class FormulaParameter(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9_]*$")
    type: Literal["integer", "number", "boolean", "string"]
    default: int | float | bool | str
    minimum: int | float | None = None
    maximum: int | float | None = None


class FormulaDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    formula_id: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=1)
    category: str = Field(min_length=1)
    description: str = Field(min_length=1)
    required_fields: list[str] = Field(min_length=1)
    parameters: list[FormulaParameter] = Field(default_factory=list)
    timeframe: Literal["1day"] = "1day"
    status: Literal["supported", "planned"] = "supported"

    @field_validator("required_fields")
    @classmethod
    def validate_required_fields(cls, fields: list[str]) -> list[str]:
        normalized = [field.strip().lower() for field in fields]
        if len(set(normalized)) != len(normalized):
            raise ValueError("required_fields must not contain duplicates")
        unsupported = sorted(set(normalized) - OHLCV_FIELDS)
        if unsupported:
            raise ValueError(f"formulas may only use local OHLCV fields; unsupported fields: {', '.join(unsupported)}")
        return normalized

    @model_validator(mode="after")
    def validate_parameter_defaults(self) -> FormulaDefinition:
        for parameter in self.parameters:
            if parameter.minimum is not None and isinstance(parameter.default, (int, float)) and parameter.default < parameter.minimum:
                raise ValueError(f"default for {parameter.name} is below minimum")
            if parameter.maximum is not None and isinstance(parameter.default, (int, float)) and parameter.default > parameter.maximum:
                raise ValueError(f"default for {parameter.name} is above maximum")
        return self


class ScannerCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1)
    as_of: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    source: str = Field(min_length=1)
    data_boundary: Literal["official_nse_daily_ohlcv"]
    formulas: list[FormulaDefinition] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_formula_ids(self) -> ScannerCatalog:
        ids = [formula.formula_id for formula in self.formulas]
        if len(ids) != len(set(ids)):
            raise ValueError("formula_id values must be unique")
        return self


class UniverseMembership(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: MembershipKind
    catalogue_universe: str | None = Field(default=None, min_length=1)
    expected_members: int = Field(ge=1)

    @model_validator(mode="after")
    def validate_source(self) -> UniverseMembership:
        if self.kind == "local_catalogue" and not self.catalogue_universe:
            raise ValueError("local_catalogue membership requires catalogue_universe")
        if self.kind == "snapshot" and self.catalogue_universe:
            raise ValueError("snapshot membership must not specify catalogue_universe")
        return self


class UniverseDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    universe_id: str = Field(min_length=1, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=1)
    exchange: Literal["NSE", "BSE", "NSE+BSE"]
    as_of: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    source: str = Field(min_length=1)
    sector_source: Literal["official_nse_catalogue_industry", "unavailable"]
    membership: UniverseMembership
    symbols: list[str] = Field(default_factory=list)

    @field_validator("symbols")
    @classmethod
    def normalize_symbols(cls, symbols: list[str]) -> list[str]:
        normalized = [symbol.strip().upper().removesuffix(".NS") for symbol in symbols if symbol.strip()]
        if len(normalized) != len(set(normalized)):
            raise ValueError("symbols must not contain duplicates")
        if any(" " in symbol for symbol in normalized):
            raise ValueError("symbols must be exchange tickers without spaces")
        return sorted(normalized)

    @model_validator(mode="after")
    def validate_membership_size(self) -> UniverseDefinition:
        if self.membership.kind == "snapshot" and len(self.symbols) != self.membership.expected_members:
            raise ValueError(
                f"{self.universe_id} declares {self.membership.expected_members} members but contains {len(self.symbols)} symbols"
            )
        if self.membership.kind == "local_catalogue" and self.symbols:
            raise ValueError("local_catalogue universes must resolve symbols from the configured local catalogue")
        return self


class UniverseCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: int = Field(ge=1)
    as_of: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    source: str = Field(min_length=1)
    universes: list[UniverseDefinition] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_universe_ids(self) -> UniverseCatalog:
        ids = [universe.universe_id for universe in self.universes]
        if len(ids) != len(set(ids)):
            raise ValueError("universe_id values must be unique")
        return self


def _read_json(resource_name: str, path: Path | None) -> dict[str, Any]:
    try:
        raw = path.read_text(encoding="utf-8") if path else files("quant_research.config").joinpath(resource_name).read_text(encoding="utf-8")
        value = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigValidationError(f"Could not load {resource_name}: {exc}") from exc
    if not isinstance(value, dict):
        raise ConfigValidationError(f"{resource_name} must contain a JSON object")
    return value


@lru_cache(maxsize=4)
def _load_scanner_catalog_cached(path_text: str | None) -> ScannerCatalog:
    path = Path(path_text) if path_text else None
    try:
        return ScannerCatalog.model_validate(_read_json("scanner_catalog.json", path))
    except ValueError as exc:
        raise ConfigValidationError(f"Invalid scanner catalog: {exc}") from exc


def load_scanner_catalog(path: Path | None = None) -> ScannerCatalog:
    """Load and validate the appendable scanner formula catalog."""

    return _load_scanner_catalog_cached(str(path.resolve()) if path else None)


@lru_cache(maxsize=4)
def _load_universe_catalog_cached(path_text: str | None) -> UniverseCatalog:
    path = Path(path_text) if path_text else None
    try:
        return UniverseCatalog.model_validate(_read_json("index_universes.json", path))
    except ValueError as exc:
        raise ConfigValidationError(f"Invalid index universe catalog: {exc}") from exc


def load_universe_catalog(path: Path | None = None) -> UniverseCatalog:
    """Load and validate the appendable index universe catalog."""

    return _load_universe_catalog_cached(str(path.resolve()) if path else None)


def resolve_universe_symbols(universe: UniverseDefinition, cache: SqliteMarketCache) -> tuple[list[str], str]:
    """Resolve configured symbols without reaching a remote provider or inventing membership."""

    if universe.membership.kind == "snapshot":
        return list(universe.symbols), "snapshot"
    symbols = cache.universe_symbols(universe.membership.catalogue_universe)
    return symbols, "local_catalogue" if symbols else "unavailable"
