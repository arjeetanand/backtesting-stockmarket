"""User-requested, source-linked global context; separate from NSE price data."""

from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4

from quant_research.repositories.artifacts import SqliteArtifactStore

ARTIFACT_KIND = "global_market_brief"
TOPICS = {
    "global": "global equity markets, major central banks, bond yields, currencies and commodities",
    "equities": "US, European and Asian equity markets and major earnings developments",
    "rates": "major central banks, inflation, government bond yields and currencies",
    "commodities": "oil, gold and industrial commodities, including implications for Indian markets",
}


class GlobalMarketUnavailableError(RuntimeError):
    """The backend key or account cannot provide this optional feature."""


class GlobalMarketBriefError(RuntimeError):
    """A complete source-linked brief could not be obtained."""


def _scope(topic: str, symbol: str | None) -> tuple[str, str | None, str]:
    if topic not in TOPICS:
        raise ValueError("Choose global, equities, rates or commodities.")
    normalized = symbol.strip().upper().removesuffix(".NS") if symbol else None
    if normalized and not re.fullmatch(r"[A-Z0-9][A-Z0-9&._-]{0,39}", normalized):
        raise ValueError("Enter a valid NSE symbol.")
    normalized = normalized or None
    return topic, normalized, f"{topic}:{normalized or ''}"


def _parse_response(payload: object) -> tuple[str, list[dict[str, str]]]:
    if not isinstance(payload, dict) or payload.get("status") != "completed" or payload.get("error"):
        raise GlobalMarketBriefError("OpenAI did not complete the market brief. Try again.")
    output = payload.get("output")
    if not isinstance(output, list) or len(output) > 100:
        raise GlobalMarketBriefError("OpenAI returned an unreadable market brief.")
    texts: list[str] = []
    citations: list[dict[str, str]] = []
    searched = False
    for item in output:
        if not isinstance(item, dict):
            raise GlobalMarketBriefError("OpenAI returned an unreadable market brief.")
        if item.get("type") == "web_search_call" and item.get("status") == "completed":
            searched = True
        if item.get("type") != "message":
            continue
        if item.get("role") != "assistant" or item.get("status") != "completed":
            raise GlobalMarketBriefError("OpenAI did not complete the market brief. Try again.")
        content = item.get("content")
        if not isinstance(content, list):
            raise GlobalMarketBriefError("OpenAI returned an unreadable market brief.")
        for block in content:
            if not isinstance(block, dict) or block.get("type") != "output_text":
                raise GlobalMarketBriefError("OpenAI could not provide a source-linked market brief.")
            text = block.get("text")
            annotations = block.get("annotations")
            if not isinstance(text, str) or not text.strip() or not isinstance(annotations, list):
                raise GlobalMarketBriefError("OpenAI returned an unreadable market brief.")
            texts.append(text.strip())
            for annotation in annotations:
                if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
                    continue
                url, title = annotation.get("url"), annotation.get("title")
                start, end = annotation.get("start_index"), annotation.get("end_index")
                if (
                    not isinstance(url, str) or len(url) > 2048 or any(ord(char) <= 32 for char in url)
                    or not isinstance(title, str) or not title.strip()
                    or type(start) is not int or type(end) is not int or not 0 <= start < end <= len(text)
                ):
                    raise GlobalMarketBriefError("OpenAI returned an invalid source citation; the brief was not saved.")
                try:
                    parsed = urlsplit(url)
                    valid = parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username and not parsed.password
                except ValueError:
                    valid = False
                if not valid:
                    raise GlobalMarketBriefError("OpenAI returned an invalid source citation; the brief was not saved.")
                if url not in {citation["url"] for citation in citations}:
                    citations.append({"url": url, "title": title.strip()[:200]})
    text = "\n\n".join(texts)
    if not searched or not text or len(text) > 24000 or not citations or len(citations) > 30:
        raise GlobalMarketBriefError("No complete, web-sourced market brief was returned; nothing was saved.")
    return text, citations


def create_brief(artifacts: SqliteArtifactStore, topic: str = "global", symbol: str | None = None) -> dict[str, Any]:
    topic, symbol, scope_key = _scope(topic, symbol)
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise GlobalMarketUnavailableError("Set OPENAI_API_KEY privately in the backend .env and restart Backtrack to create a global market brief.")
    model = os.getenv("GLOBAL_MARKET_MODEL", "gpt-6-luna").strip() or "gpt-6-luna"
    requested_at = datetime.now(UTC).isoformat()
    prompt = (
        f"As of {requested_at}, search the web for the latest material developments in {TOPICS[topic]}. "
        + (f"Include relevant implications for NSE symbol {symbol}; preserve its identity. " if symbol else "")
        + "Write a concise factual market brief with publication/event dates, what changed, "
        "and possible implications for Indian markets. Prefer original exchange, central-bank, "
        "government and company releases. Clearly distinguish reported facts from inference, "
        "and delayed or unavailable information from current observations. Cite factual claims "
        "with web-search citations. Do not infer live prices, promise returns, recommend trades, "
        "or invent portfolio holdings. This is news context, not a price feed or a forecast."
    )
    body = {
        "model": model, "store": False, "input": prompt,
        "tools": [{"type": "web_search", "search_context_size": "low"}],
        "tool_choice": "required", "max_output_tokens": 2500,
    }
    request = Request(
        "https://api.openai.com/v1/responses", data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=60) as response:
            raw = response.read(1_000_001)
        if len(raw) > 1_000_000:
            raise GlobalMarketBriefError("OpenAI returned an oversized market brief; nothing was saved.")
        payload = json.loads(raw)
    except HTTPError as exc:
        if exc.code in {401, 403}:
            raise GlobalMarketUnavailableError("OpenAI could not authorize this request. Check the backend API key and model/web-search access.") from None
        raise GlobalMarketBriefError("OpenAI could not create the market brief. Check account limits and model/web-search access, then retry.") from None
    except (URLError, TimeoutError, UnicodeDecodeError, json.JSONDecodeError):
        raise GlobalMarketBriefError("Could not read the OpenAI market brief. Check the connection and try again.") from None
    text, citations = _parse_response(payload)
    brief: dict[str, Any] = {
        "brief_id": uuid4().hex, "topic": topic, "symbol": symbol, "scope_key": scope_key,
        "created_at": datetime.now(UTC).isoformat(), "requested_at": requested_at,
        "model": model, "text": text, "citations": citations,
    }
    artifacts.save(ARTIFACT_KIND, brief["brief_id"], brief)
    return brief


def saved_briefs(artifacts: SqliteArtifactStore, topic: str = "global", symbol: str | None = None) -> list[dict[str, Any]]:
    _, _, scope_key = _scope(topic, symbol)
    return artifacts.list_with_metadata_by_json_value(ARTIFACT_KIND, "$.scope_key", scope_key, limit=5)
