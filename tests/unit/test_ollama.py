import json
from typing import Any

from quant_research.llm.ollama import OllamaClient


class _Response:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self._payload).encode("utf-8")


def test_ollama_client_extracts_json_from_a_chat_response() -> None:
    payload = {"message": {"content": '```json\n{"answer": "structured"}\n```'}}
    client = OllamaClient("test-model", opener=lambda *_args, **_kwargs: _Response(payload))

    result = client.generate_json("system", "user")

    assert result == {"answer": "structured"}


def test_ollama_client_extracts_json_when_a_model_adds_prose() -> None:
    payload = {"message": {"content": 'Here is the requested result: {"answer": "structured"}'}}
    client = OllamaClient("test-model", opener=lambda *_args, **_kwargs: _Response(payload))

    result = client.generate_json("system", "user")

    assert result == {"answer": "structured"}
