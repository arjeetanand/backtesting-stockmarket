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
    nse_archive_path: Path
    ollama_timeout_seconds: float = 25.0

    @classmethod
    def from_environment(cls) -> Settings:
        load_dotenv()
        origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
        try:
            ollama_timeout = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "25"))
        except ValueError:
            ollama_timeout = 25.0
        return cls(
            cors_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434"),
            ollama_model=os.getenv("OLLAMA_MODEL", "qwen3:4b"),
            ollama_timeout_seconds=min(60.0, max(5.0, ollama_timeout)),
            market_cache_path=Path(os.getenv("MARKET_CACHE_PATH", "data/market_cache.sqlite3")),
            nse_archive_path=Path(os.getenv("NSE_ARCHIVE_PATH", "data/nse_archives")),
        )
