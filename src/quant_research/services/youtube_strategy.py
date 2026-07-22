"""Turn a YouTube trading video/transcript into a reviewable strategy draft."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


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
