import pytest

from quant_research.services.youtube_strategy import extract_strategy


def test_youtube_transcript_extracts_reviewable_rules() -> None:
    result = extract_strategy(
        "https://www.youtube.com/watch?v=abc1234",
        transcript=(
            "Buy when the 20 EMA crosses above the 50 EMA and RSI is above 55. "
            "Sell when price closes below the 20 EMA. "
            "Place a stop loss at 1 ATR and risk one percent of capital."
        ),
    )

    assert result.video_id == "abc1234"
    assert result.transcript_available is True
    assert "EMA" in result.indicators
    assert "RSI" in result.indicators
    assert result.entry_rules and result.exit_rules and result.risk_rules
    assert result.confidence > 0.5


def test_youtube_url_is_validated_before_extraction() -> None:
    with pytest.raises(ValueError, match="valid YouTube URL"):
        extract_strategy("https://example.com/video")

