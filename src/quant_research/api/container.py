"""Dependency assembly for the HTTP application."""

from __future__ import annotations

from dataclasses import dataclass

from quant_research.api.config import Settings
from quant_research.data_providers.base import MarketDataProvider
from quant_research.data_providers.local_cache import LocalNseCacheProvider
from quant_research.llm.ollama import OllamaClient
from quant_research.repositories.artifacts import SqliteArtifactStore
from quant_research.repositories.backtests import SqliteBacktestRepository
from quant_research.repositories.market_cache import SqliteMarketCache
from quant_research.services.hypotheses import HypothesisService, JsonLlmClient
from quant_research.services.nifty500_catalogue import Nifty500CatalogueImporter
from quant_research.services.nse_import import NseBhavcopyImporter
from quant_research.services.research import ResearchService


@dataclass(frozen=True, slots=True)
class ApplicationContainer:
    settings: Settings
    research: ResearchService
    hypotheses: HypothesisService
    market_cache: SqliteMarketCache
    nse_importer: NseBhavcopyImporter
    nifty500_catalogue: Nifty500CatalogueImporter
    artifacts: SqliteArtifactStore


def create_container(
    settings: Settings, provider: MarketDataProvider | None = None, llm_client: JsonLlmClient | None = None
) -> ApplicationContainer:
    market_cache = SqliteMarketCache(settings.market_cache_path)
    configured_provider = provider or LocalNseCacheProvider(market_cache)
    repository = SqliteBacktestRepository(settings.market_cache_path)
    artifacts = SqliteArtifactStore(settings.market_cache_path)
    configured_llm = llm_client or OllamaClient(model=settings.ollama_model, base_url=settings.ollama_base_url)
    return ApplicationContainer(
        settings=settings,
        research=ResearchService(configured_provider, repository),
        hypotheses=HypothesisService(configured_llm),
        market_cache=market_cache,
        nse_importer=NseBhavcopyImporter(market_cache),
        nifty500_catalogue=Nifty500CatalogueImporter(market_cache),
        artifacts=artifacts,
    )
