from typing import Any

from pydantic import BaseModel, ValidationError

from quant_research.domain.indicators.models import (
    ATRParameters,
    EMAParameters,
    MACDParameters,
    RSIParameters,
    SMAParameters,
)


class IndicatorRegistry:
    _registry: dict[str, type[BaseModel]] = {
        "SMA": SMAParameters,
        "EMA": EMAParameters,
        "RSI": RSIParameters,
        "MACD": MACDParameters,
        "ATR": ATRParameters,
    }

    @classmethod
    def register(cls, name: str, param_model: type[BaseModel]) -> None:
        """Register a new custom indicator model."""
        cls._registry[name] = param_model

    @classmethod
    def get_parameter_model(cls, name: str) -> type[BaseModel]:
        """Retrieve the parameter model for a registered indicator."""
        if name not in cls._registry:
            raise ValueError(f"Indicator '{name}' is not registered.")
        return cls._registry[name]

    @classmethod
    def validate_spec(cls, name: str, parameters: dict[str, Any]) -> None:
        """Validate parameter dict against the indicator schema."""
        model = cls.get_parameter_model(name)
        try:
            model(**parameters)
        except ValidationError as e:
            raise ValueError(f"Invalid parameters for indicator '{name}': {e}") from e

    @classmethod
    def list_indicators(cls) -> list[str]:
        """List all registered indicator names."""
        return list(cls._registry.keys())
