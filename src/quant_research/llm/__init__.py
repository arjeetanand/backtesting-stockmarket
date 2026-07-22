"""Local LLM integrations used to assist—not execute—research decisions."""

from quant_research.llm.ollama import OllamaClient, OllamaError

__all__ = ["OllamaClient", "OllamaError"]
