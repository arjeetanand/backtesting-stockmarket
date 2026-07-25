import { describe, expect, it } from "vitest";
import { createFinancialChartData } from "./chart-data";

describe("createFinancialChartData", () => {
  it("sorts and de-duplicates valid candles without fabricating missing volume", () => {
    const data = createFinancialChartData({
      candles: [
        { timestamp: "2024-01-02", open: 105, high: 110, low: 100, close: 108 },
        { timestamp: "2024-01-01", open: 100, high: 106, low: 98, close: 105, volume: null },
        { timestamp: "2024-01-02T00:00:00Z", open: 106, high: 111, low: 101, close: 109, volume: 1200 },
        { timestamp: "2024-01-03", open: Number.NaN, high: 112, low: 107, close: 111 },
      ],
    });

    expect(data.candles).toHaveLength(2);
    expect(data.candles.map((candle) => candle.close)).toEqual([105, 109]);
    expect(data.candles[0].volume).toBeNull();
    expect(data.candles[1].isBullish).toBe(true);
  });

  it("merges trade-derived markers with explicit signals and keeps marker order stable", () => {
    const data = createFinancialChartData({
      candles: [{ timestamp: "2024-01-01", open: 100, high: 106, low: 98, close: 105 }],
      trades: [{ id: "7", entry: { timestamp: "2024-01-01", price: 100 }, exit: null, pnl: 5 }],
      tradeMarkers: [{ id: "signal-1", timestamp: "2024-01-01", price: 101, kind: "signal" }],
    });

    expect(data.trades[0].id).toBe("7");
    expect(data.tradeMarkers.map((marker) => marker.kind)).toEqual(["entry", "signal"]);
    expect(data.tradeMarkers[0].tradeId).toBe("7");
  });
});

