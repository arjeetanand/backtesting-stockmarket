import { describe, expect, it } from "vitest";
import { adaptBacktestChart, adaptMarketBars } from "./research-chart";

describe("research chart adapters", () => {
  it("drops invalid API values and maps indicators to chart panes", () => {
    const result = adaptBacktestChart({
      candles: [
        { date: "2024-01-02", open: 100, high: 105, low: 98, close: 103, volume: 500 },
        { date: "2024-01-03", open: undefined, high: 106, low: 99, close: 104 },
      ],
      indicators: { RSI: [{ date: "2024-01-02", value: 62 }, { date: "2024-01-03", value: null as number | null }] },
      signals: [{ id: "entry-1", date: "2024-01-02", type: "entry", price: 100, trade_id: 3 }, { date: "", type: "exit", price: 105 }],
    });

    expect(result.candles).toHaveLength(2);
    expect(result.indicators[0].placement).toBe("pane");
    expect(result.indicators[0].referenceLines?.map((line) => line.value)).toEqual([30, 70]);
    expect(result.tradeMarkers).toEqual([{ id: "entry-1", tradeId: "3", timestamp: "2024-01-02", price: 100, kind: "entry", label: "Buy / entry" }]);
  });

  it("preserves the local market bar contract including unavailable volume", () => {
    const result = adaptMarketBars([{ timestamp: "2024-01-01", symbol: "RELIANCE", open: 10, high: 12, low: 9, close: 11, volume: 0 }]);
    expect(result.candles).toEqual([{ timestamp: "2024-01-01", open: 10, high: 12, low: 9, close: 11, volume: 0 }]);
    expect(result.trades).toEqual([]);
  });
});
