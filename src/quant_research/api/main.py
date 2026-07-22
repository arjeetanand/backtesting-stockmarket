"""ASGI application entry point.

Run locally with:
    uvicorn quant_research.api.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from quant_research.api.config import Settings
from quant_research.api.container import create_container
from quant_research.api.routes.api import create_api_router
from quant_research.data_providers.base import MarketDataProvider
from quant_research.services.hypotheses import JsonLlmClient


def create_app(
    settings: Settings | None = None,
    provider: MarketDataProvider | None = None,
    llm_client: JsonLlmClient | None = None,
) -> FastAPI:
    """Create the configured API app; dependency injection keeps tests deterministic."""
    container = create_container(settings or Settings.from_environment(), provider, llm_client)
    app = FastAPI(
        title="Quant Research API",
        version="0.1.0",
        description="Real market-data retrieval, validation, and deterministic SMA crossover backtests.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(container.settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    app.include_router(create_api_router(container.research, container.hypotheses, container.nse_importer, container.market_cache, container.nifty500_catalogue, container.artifacts))
    return app


app = create_app()
