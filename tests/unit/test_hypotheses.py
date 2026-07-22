from quant_research.services.hypotheses import HypothesisCommand, HypothesisService


class FakeLlmClient:
    model = "test-model"

    def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
        return {
            "summary": "Test a trend-following crossover under the stated assumptions.",
            "assumptions": ["Daily bars are liquid."],
            "risks": ["Past performance does not predict future performance."],
            "suggested_backtest": {
                "symbol": "AAPL",
                "timeframe": "1day",
                "fast_window": 20,
                "slow_window": 50,
                "rationale": "This is a conventional medium-term trend test.",
            },
        }


def test_hypothesis_service_returns_reviewable_validated_proposal() -> None:
    service = HypothesisService(FakeLlmClient())

    proposal = service.analyse(
        HypothesisCommand(hypothesis="Test a simple trend-following idea on Apple.", symbol="aapl", timeframe="1day")
    )

    assert proposal.suggested_backtest.symbol == "AAPL"
    assert proposal.suggested_backtest.fast_window < proposal.suggested_backtest.slow_window
    assert service.model == "test-model"


def test_hypothesis_service_forces_the_requested_symbol_and_timeframe() -> None:
    class WrongSymbolLlm(FakeLlmClient):
        def generate_json(self, system_prompt: str, user_prompt: str) -> dict[str, object]:
            response = super().generate_json(system_prompt, user_prompt)
            response["suggested_backtest"] = {
                "symbol": "MSFT",
                "timeframe": "1day",
                "fast_window": 20,
                "slow_window": 50,
                "rationale": "Wrong symbol.",
            }
            return response

    proposal = HypothesisService(WrongSymbolLlm()).analyse(
        HypothesisCommand(hypothesis="Test a simple trend-following idea on Apple.", symbol="AAPL", timeframe="1day")
    )

    assert proposal.suggested_backtest.symbol == "AAPL"
    assert proposal.suggested_backtest.timeframe == "1day"


def test_hypothesis_service_curated_fallback_is_explicit_and_testable() -> None:
    proposal = HypothesisService(FakeLlmClient()).curated_fallback(
        HypothesisCommand(
            hypothesis="Test a Donchian breakout on Reliance.",
            symbol="reliance",
            timeframe="1day",
            strategy_id="donchian_breakout",
        ),
        reason="Could not reach Ollama",
    )

    assert "Ollama unavailable" in proposal.generated_by
    assert proposal.model == "Backtrack strategy catalogue"
    assert proposal.suggested_backtest.symbol == "RELIANCE"
    assert proposal.suggested_backtest.fast_window < proposal.suggested_backtest.slow_window
    assert any("Could not reach Ollama" in risk for risk in proposal.risks)
