"""Dependency-free client for Ollama's local chat API."""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class OllamaError(RuntimeError):
    """Raised when the local Ollama server cannot provide a valid response."""


def _extract_json(content: str) -> dict[str, Any]:
    """Parse JSON even if a model unnecessarily wraps it in a Markdown fence."""
    text = content.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0].strip()
    if not text.startswith("{"):
        first_brace = text.find("{")
        last_brace = text.rfind("}")
        if first_brace >= 0 and last_brace > first_brace:
            text = text[first_brace : last_brace + 1]
    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        raise OllamaError("Ollama did not return valid JSON. Try the request again.") from exc
    if not isinstance(value, dict):
        raise OllamaError("Ollama returned JSON in an unexpected format.")
    return value


@dataclass(slots=True)
class OllamaClient:
    """Call a locally installed Ollama model and request structured JSON output."""

    model: str
    base_url: str = "http://127.0.0.1:11434"
    timeout_seconds: float = 90.0
    opener: Callable[..., Any] = urlopen

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any]:
        payload = json.dumps(
            {
                "model": self.model,
                "stream": False,
                "format": "json",
                "think": False,
                "keep_alive": "10m",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                # A structured research proposal can exceed 350 tokens. Truncation
                # leaves a syntactically invalid JSON object, so retain enough room
                # for the complete response while keeping local inference bounded.
                "options": {"temperature": 0.2, "num_predict": 650},
            }
        ).encode("utf-8")
        request = Request(
            f"{self.base_url.rstrip('/')}/api/chat",
            data=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        try:
            with self.opener(request, timeout=self.timeout_seconds) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:
            raise OllamaError(f"Ollama returned HTTP {exc.code}. Check that model '{self.model}' is installed.") from exc
        except URLError as exc:
            raise OllamaError("Could not reach Ollama. Start it with: ollama serve") from exc
        except (TimeoutError, json.JSONDecodeError) as exc:
            raise OllamaError("Ollama returned an invalid response.") from exc

        message = response_payload.get("message")
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str) or not content.strip():
            raise OllamaError("Ollama returned an empty response.")
        return _extract_json(content)
