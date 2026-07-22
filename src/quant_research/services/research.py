"""Application service that coordinates market data, validation, and backtests."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import pandas as pd

from quant_research.data_providers.base import MarketDataProvider
from quant_research.domain.backtesting.models import BacktestResult
from quant_research.domain.data.models import DataQualityReport, OHLCVBar
from quant_research.domain.data.validator import MarketDataValidator
from quant_research.repositories.backtests import InMemoryBacktestRepository
from quant_research.services.sma_backtest import run_sma_crossover_backtest


class ResearchServiceError(ValueError):
    """Raised for a request that cannot be safely run as research."""


class MarketDataUnavailableError(RuntimeError):
    """Raised when no market-data provider has been configured."""


@dataclass(frozen=True, slots=True)
class MarketDataResult:
    symbol: str
    timeframe: str
    bars: list[OHLCVBar]
    quality: DataQualityReport


@dataclass(frozen=True, slots=True)
class SmaBacktestCommand:
    symbol: str
    start: datetime
    end: datetime
    timeframe: str
    fast_window: int
    slow_window: int
    initial_capital: float
    commission: float
    slippage: float


class ResearchService:
    """Single entry point for data-backed research operations."""

    def __init__(self, provider: MarketDataProvider | None, repository: InMemoryBacktestRepository) -> None:
        self._provider = provider
        self._repository = repository

    @property
    def market_data_configured(self) -> bool:
        return self._provider is not None

    @property
    def provider_name(self) -> str:
        return str(getattr(self._provider, "provider_name", "not_configured")) if self._provider else "not_configured"

    @property
    def provider(self) -> MarketDataProvider | None:
        return self._provider

    def get_market_data(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> MarketDataResult:
        if start >= end:
            raise ResearchServiceError("start must be before end.")
        if self._provider is None:
            raise MarketDataUnavailableError("Free historical market data is unavailable. Check the network and retry.")

        clean_symbol = symbol.strip().upper()
        if not clean_symbol:
            raise ResearchServiceError("symbol must not be empty.")
        bars = self._provider.get_ohlcv(clean_symbol, timeframe, start, end)
        data = pd.DataFrame([bar.model_dump() for bar in bars])
        quality = MarketDataValidator.validate(data)
        if not quality.is_valid:
            raise ResearchServiceError("Provider returned invalid OHLCV data.")
        return MarketDataResult(symbol=clean_symbol, timeframe=timeframe, bars=bars, quality=quality)

    def run_sma_backtest(self, command: SmaBacktestCommand) -> BacktestResult:
        if command.fast_window >= command.slow_window:
            raise ResearchServiceError("fast_window must be smaller than slow_window.")
        market_data = self.get_market_data(command.symbol, command.timeframe, command.start, command.end)
        data = pd.DataFrame([bar.model_dump() for bar in market_data.bars])
        try:
            result = run_sma_crossover_backtest(
                data,
                symbol=market_data.symbol,
                fast_window=command.fast_window,
                slow_window=command.slow_window,
                initial_capital=command.initial_capital,
                commission=command.commission,
                slippage=command.slippage,
            )
        except ValueError as exc:
            raise ResearchServiceError(str(exc)) from exc
        return self._repository.save(result)

    def list_backtests(self) -> list[BacktestResult]:
        return self._repository.list()

    def get_backtest(self, run_id: str) -> BacktestResult | None:
        return self._repository.get(run_id)
