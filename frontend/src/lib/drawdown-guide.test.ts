import { describe, expect, it } from "vitest";
import { calculatePaperPositionSize, summarizeRecentDrawdown } from "./drawdown-guide";

describe("drawdown guide calculations", () => {
  it("summarizes the last 20 sessions and compares volume with the prior 20", () => {
    const bars = Array.from({ length: 22 }, (_, index) => ({
      timestamp: `2026-10-${String(index + 1).padStart(2, "0")}`,
      low: index === 21 ? 78 : 99,
      close: index === 21 ? 80 : index === 20 ? 100 : 100,
      volume: index === 21 ? 200 : 100,
    }));

    const summary = summarizeRecentDrawdown(bars);
    expect(summary?.latestChangePct).toBeCloseTo(-20);
    expect(summary?.worstSession?.timestamp).toBe("2026-10-22");
    expect(summary?.worstSession?.changePct).toBeCloseTo(-20);
    expect(summary?.drawdownFromRecentHighPct).toBeCloseTo(-20);
    expect(summary?.averagePriorVolume).toBe(100);
    expect(summary?.lastFiveVolume).toBe(600);
    expect(summary?.lastFiveVsPriorAverage).toBeCloseTo(1.2);
  });

  it("caps whole shares by both the entered loss budget and allocation limit", () => {
    expect(calculatePaperPositionSize(100, 90, 250, 1_500)).toEqual({
      shares: 15,
      riskPerShare: 10,
      positionValue: 1_500,
      modeledLoss: 150,
    });
    expect(calculatePaperPositionSize(100, 100, 250, 1_500)).toBeNull();
    expect(calculatePaperPositionSize(100, 90, 0, 1_500)).toBeNull();
    expect(calculatePaperPositionSize(1e-20, 1e-21, 1e308, 1e308)).toBeNull();
  });
});
