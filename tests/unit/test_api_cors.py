from __future__ import annotations

import asyncio
from pathlib import Path

from quant_research.api.config import Settings
from quant_research.api.main import create_app


class StubLlm:
    model = "test"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {}


def test_local_frontend_on_alternate_port_passes_cors_preflight(tmp_path: Path) -> None:
    settings = Settings(
        cors_origins=("http://localhost:3000", "http://127.0.0.1:3000"),
        ollama_base_url="http://127.0.0.1:11434",
        ollama_model="test",
        market_cache_path=tmp_path / "market.sqlite3",
        nse_archive_path=tmp_path / "archives",
    )
    app = create_app(settings=settings, llm_client=StubLlm())
    messages: list[dict[str, object]] = []

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    asyncio.run(
        app(
            {
                "type": "http",
                "http_version": "1.1",
                "method": "OPTIONS",
                "scheme": "http",
                "path": "/api/v1/research/hypothesis",
                "raw_path": b"/api/v1/research/hypothesis",
                "query_string": b"",
                "headers": [
                    (b"origin", b"http://127.0.0.1:3001"),
                    (b"access-control-request-method", b"POST"),
                    (b"access-control-request-headers", b"content-type"),
                ],
                "server": ("127.0.0.1", 8001),
                "client": ("127.0.0.1", 3001),
            },
            receive,
            send,
        )
    )

    response_start = next(message for message in messages if message["type"] == "http.response.start")
    headers = dict(response_start["headers"])
    assert response_start["status"] == 200
    assert headers[b"access-control-allow-origin"] == b"http://127.0.0.1:3001"
