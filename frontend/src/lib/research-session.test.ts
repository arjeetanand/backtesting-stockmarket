import { describe, expect, it } from "vitest";
import { buildResearchSessionSnapshot } from "./research-session";

describe("research session persistence", () => {
  it("stores a result reference instead of candle, indicator, and trade arrays", () => {
    const snapshot = buildResearchSessionSnapshot({
      symbol: "TATACONSUM",
      strategyId: "donchian_breakout",
      backtest: {
        _artifact_key: "stable-local-result-key",
        run_id: "bt_123",
        candles: Array.from({ length: 5_000 }, (_, index) => ({ date: String(index) })),
        indicators: { "Donchian high": Array.from({ length: 5_000 }, (_, index) => ({ date: String(index), value: index })) },
        trades: [{ pnl: 500 }],
      },
    });

    expect(snapshot).toEqual({ symbol: "TATACONSUM", strategyId: "donchian_breakout", backtestArtifactKey: "stable-local-result-key", backtestRunId: "bt_123" });
    expect(JSON.stringify(snapshot).length).toBeLessThan(150);
  });
});
