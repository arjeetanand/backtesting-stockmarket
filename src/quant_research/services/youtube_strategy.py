"""Turn a YouTube trading video/transcript into a reviewable strategy draft."""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from html import unescape
from typing import Any
from urllib.request import Request, urlopen


@dataclass(frozen=True, slots=True)
class StrategyExtraction:
    video_id: str | None
    title: str | None
    transcript_available: bool
    strategy_name: str
    indicators: list[str]
    entry_rules: list[str]
    exit_rules: list[str]
    risk_rules: list[str]
    assumptions: list[str]
    confidence: float
    source_url: str


def _video_id(url: str) -> str | None:
    match = re.search(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{6,})", url)
    return match.group(1) if match else None


def _sentences(text: str) -> list[str]:
    return [sentence.strip() for sentence in re.split(r"(?<=[.!?])\s+", text) if sentence.strip()]


def extract_strategy(url: str, transcript: str | None = None, extractor: Callable[[str], dict[str, Any]] | None = None) -> StrategyExtraction:
    clean_url = url.strip()
    if not re.match(r"https?://(?:www\.)?(?:youtube\.com|youtu\.be)/", clean_url):
        raise ValueError("Enter a valid YouTube URL.")

    metadata: dict[str, Any] = {}
    resolved_transcript = transcript or ""
    if not resolved_transcript and extractor:
        metadata = extractor(clean_url)
        resolved_transcript = str(metadata.get("transcript") or "")
    if not resolved_transcript:
        try:
            import yt_dlp  # type: ignore[import-untyped]

            with yt_dlp.YoutubeDL({"quiet": True, "skip_download": True, "writesubtitles": True, "writeautomaticsub": True}) as ydl:
                info = ydl.extract_info(clean_url, download=False)
                metadata = info if isinstance(info, dict) else {}
        except Exception:
            metadata = {}
        resolved_transcript = _transcript_from_metadata(metadata)
    if not resolved_transcript:
        page_metadata = _youtube_page_metadata(clean_url)
        if page_metadata:
            metadata = {**metadata, **page_metadata}
            resolved_transcript = _transcript_from_metadata(metadata)

    text = resolved_transcript.lower()
    indicators = [label for label, token in (("RSI", "rsi"), ("EMA", "ema"), ("SMA", "sma"), ("MACD", "macd"), ("Bollinger Bands", "bollinger"), ("VWAP", "vwap"), ("ATR", "atr")) if token in text]
    sentences = _sentences(resolved_transcript)
    entry_rules = [sentence for sentence in sentences if any(token in sentence.lower() for token in ("buy", "entry", "above", "cross"))][:4]
    exit_rules = [sentence for sentence in sentences if any(token in sentence.lower() for token in ("sell", "exit", "below", "target"))][:4]
    risk_rules = [sentence for sentence in sentences if any(token in sentence.lower() for token in ("stop", "risk", "position", "capital"))][:4]
    assumptions = [
        "Rules are extracted from captions/transcript and require human review.",
        "Execution is modeled on the next available bar unless the strategy says otherwise.",
    ]
    if not resolved_transcript:
        assumptions.append("No transcript was available. Install yt-dlp or paste the transcript to extract rules.")
    confidence = min(0.96, 0.42 + len(indicators) * 0.08 + len(entry_rules) * 0.06 + len(exit_rules) * 0.06) if resolved_transcript else 0.18
    strategy_name = " + ".join(indicators[:3]) + " strategy" if indicators else "Review required: unstructured strategy"
    return StrategyExtraction(
        video_id=_video_id(clean_url),
        title=str(metadata.get("title") or "YouTube strategy source"),
        transcript_available=bool(resolved_transcript),
        strategy_name=strategy_name,
        indicators=indicators,
        entry_rules=entry_rules or ["No explicit entry rule detected — add one during review."],
        exit_rules=exit_rules or ["No explicit exit rule detected — add one during review."],
        risk_rules=risk_rules or ["No explicit risk rule detected — define stop loss and position sizing."],
        assumptions=assumptions,
        confidence=round(confidence, 2),
        source_url=clean_url,
    )


def _transcript_from_metadata(metadata: dict[str, Any]) -> str:
    direct = metadata.get("transcript")
    if isinstance(direct, str) and direct.strip():
        return direct.strip()
    tracks = metadata.get("captionTracks") or metadata.get("subtitles") or metadata.get("automatic_captions")
    if not isinstance(tracks, (list, dict)):
        return ""
    candidates: list[dict[str, Any]] = []
    if isinstance(tracks, list):
        candidates = [item for item in tracks if isinstance(item, dict)]
    else:
        for language, values in tracks.items():
            if isinstance(values, list):
                candidates.extend(item for item in values if isinstance(item, dict) and item.setdefault("languageCode", language))
    candidates.sort(key=lambda item: (str(item.get("languageCode", "")) not in {"en", "en-IN", "hi"}, str(item.get("kind", "")) == "asr"))
    for track in candidates:
        base_url = track.get("baseUrl") or track.get("url")
        if isinstance(base_url, str):
            text = _download_caption(base_url)
            if text:
                return text
    return ""


def _youtube_page_metadata(url: str) -> dict[str, Any]:
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=15) as response:  # noqa: S310 - user supplied URL is validated as YouTube above
            page = response.read().decode("utf-8", errors="ignore")
        match = re.search(r'"captionTracks":(\[.*?\])', page)
        tracks = json.loads(match.group(1)) if match else []
        title_match = re.search(r'"title":"((?:\\.|[^"\\])*)"', page)
        title = json.loads(f'"{title_match.group(1)}"') if title_match else "YouTube strategy source"
        return {"captionTracks": tracks, "title": title}
    except Exception:
        return {}


def _download_caption(url: str) -> str:
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=15) as response:  # noqa: S310 - URL comes from YouTube caption metadata
            raw = response.read().decode("utf-8", errors="ignore")
        if raw.lstrip().startswith("{"):
            payload = json.loads(raw)
            transcript_lines = [segment.get("utf8", "") for event in payload.get("events", []) for segment in event.get("segs", [])]
            return " ".join(line.strip() for line in transcript_lines if line.strip())
        lines: list[str] = []
        for line in raw.splitlines():
            clean = re.sub(r"<[^>]+>", "", unescape(line)).strip()
            if not clean or clean == "WEBVTT" or re.match(r"^\d+$", clean) or " --> " in clean:
                continue
            if not lines or lines[-1] != clean:
                lines.append(clean)
        return " ".join(lines)
    except Exception:
        return ""
