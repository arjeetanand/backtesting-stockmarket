"""Runtime configuration for the API service."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True, slots=True)
class Settings:
    cors_origins: tuple[str, ...]
    ollama_base_url: str
    ollama_model: str
    market_cache_path: Path

    @classmethod
    def from_environment(cls) -> Settings:
        load_dotenv()
        origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
        return cls(
            cors_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
            ollama_model=os.getenv("OLLAMA_MODEL", "qwen3:4b"),
            market_cache_path=Path(os.getenv("MARKET_CACHE_PATH", "data/market_cache.sqlite3")),
        )
