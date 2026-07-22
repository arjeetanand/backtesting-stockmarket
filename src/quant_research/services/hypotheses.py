"""LLM-assisted conversion of research hypotheses into reviewable suggestions."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from pydantic import BaseModel, Field


class JsonLlmClient(Protocol):
    model: str

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any]: ...


class SuggestedSmaBacktest(BaseModel):
    symbol: str
    timeframe: str = "1day"
    fast_window: int = Field(ge=2, le=500)
    slow_window: int = Field(ge=3, le=1_000)
    rationale: str = Field(min_length=1, max_length=1_000)


class HypothesisAnalysis(BaseModel):
    generated_by: str = "local Ollama"
    model: str = "unknown"
    summary: str = Field(min_length=1, max_length=2_000)
    assumptions: list[str] = Field(default_factory=list, max_length=8)
    risks: list[str] = Field(default_factory=list, max_length=8)
    suggested_backtest: SuggestedSmaBacktest


@dataclass(frozen=True, slots=True)
class HypothesisCommand:
    hypothesis: str
    symbol: str
    timeframe: str
    strategy_id: str = "sma_crossover"


class HypothesisService:
    """Generate a constrained, human-reviewable backtest suggestion."""

    STRATEGY_LABELS = {
        "sma_crossover": "SMA crossover",
        "ema_crossover": "EMA crossover",
        "rsi_ema": "RSI plus EMA filter",
        "rsi_mean_reversion": "RSI mean reversion",
        "bollinger_mean_reversion": "Bollinger Band mean reversion",
        "macd_crossover": "MACD crossover",
        "donchian_breakout": "Donchian breakout",
        "momentum": "price momentum",
    }

    def __init__(self, client: JsonLlmClient) -> None:
        self._client = client

    @property
    def model(self) -> str:
        return self._client.model

    def analyse(self, command: HypothesisCommand) -> HypothesisAnalysis:
        clean_symbol = command.symbol.strip().upper()
        if not clean_symbol:
            raise ValueError("symbol must not be empty.")
        strategy_label = self.STRATEGY_LABELS.get(command.strategy_id, command.strategy_id.replace("_", " "))
        system_prompt = f"""Return one compact JSON object only. You are a cautious quantitative-research assistant.
Interpret the hypothesis for the selected {strategy_label} strategy and prepare a long-only historical test proposal. Do not claim profitability or give investment advice.
Use the provided symbol and timeframe exactly. fast_window must be at least 2 and less than slow_window.
Use no more than 3 short assumptions and 3 short risks. Keep the summary and rationale to one sentence each.
Required JSON: {{"summary": string, "assumptions": [string], "risks": [string], "suggested_backtest": {{"symbol": string, "timeframe": string, "fast_window": integer, "slow_window": integer, "rationale": string}}}}."""
        user_prompt = (
            f"Hypothesis: {command.hypothesis}\n"
            f"Symbol: {clean_symbol}\n"
            f"Timeframe: {command.timeframe}\n"
            f"Selected strategy: {strategy_label} ({command.strategy_id})\n"
            "Produce a concise proposal that a user must review before running."
        )
        raw = self._client.generate_json(system_prompt, user_prompt)
        proposed = raw.get("suggested_backtest")
        if not isinstance(proposed, dict):
            proposed = raw.get("strategy")
        if not isinstance(proposed, dict):
            proposed = {}

        fast_window = self._window(proposed.get("fast_window"), default=20, minimum=2, maximum=500)
        slow_window = self._window(proposed.get("slow_window"), default=50, minimum=3, maximum=1_000)
        if slow_window <= fast_window:
            slow_window = min(max(fast_window * 2, fast_window + 1), 1_000)

        return HypothesisAnalysis(
            generated_by="local Ollama",
            model=self.model,
            summary=self._text(
                raw.get("summary") or raw.get("analysis"),
                f"The local model reviewed the hypothesis and prepared a cautious {strategy_label} test proposal.",
                maximum=2_000,
            ),
            assumptions=self._text_list(raw.get("assumptions")),
            risks=self._text_list(raw.get("risks")),
            suggested_backtest=SuggestedSmaBacktest(
                # Never let an LLM change the asset or timeframe the user asked to research.
                symbol=clean_symbol,
                timeframe=command.timeframe,
                fast_window=fast_window,
                slow_window=slow_window,
                rationale=self._text(
                    proposed.get("rationale") or raw.get("rationale"),
                    f"Test the selected {strategy_label} rules against the requested historical data.",
                    maximum=1_000,
                ),
            ),
        )

    @staticmethod
    def _text(value: object, fallback: str, maximum: int) -> str:
        if not isinstance(value, str) or not value.strip():
            return fallback
        return value.strip()[:maximum]

    @staticmethod
    def _text_list(value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [item.strip()[:1_000] for item in value if isinstance(item, str) and item.strip()][:8]

    @staticmethod
    def _window(value: object, default: int, minimum: int, maximum: int) -> int:
        if not isinstance(value, (int, float, str)):
            return default
        try:
            window = int(value)
        except (TypeError, ValueError):
            return default
        return min(max(window, minimum), maximum)
