import type { BacktestConfig, EquityPoint, MarketBar, Trade } from "./types";
import type { Signal } from "./signal-engine-agent";

export function runSimulation(bars: MarketBar[], signals: Signal[], config: BacktestConfig): {
  equity: EquityPoint[];
  trades: Trade[];
} {
  let equity = config.initialCapital;
  let benchmark = config.initialCapital;
  let openEntryIndex = -1;
  let openEntryValue = 0;
  let peak = equity;
  const trades: Trade[] = [];
  const equityPoints: EquityPoint[] = [];

  bars.forEach((bar, index) => {
    const previous = bars[index - 1];
    const monthlyReturn = previous ? bar.close / previous.close - 1 : 0;
    benchmark *= 1 + monthlyReturn;

    if (signals[index] === "BUY" && openEntryIndex === -1) {
      openEntryIndex = index;
      openEntryValue = equity;
    }
    if (signals[index] === "SELL" && openEntryIndex !== -1) {
      equity *= 1 + (bar.close / bars[openEntryIndex].close - 1) - config.commissionBps / 10_000;
      trades.push({
        id: `T-${String(trades.length + 1).padStart(3, "0")}`,
        entry: bars[openEntryIndex].date,
        exit: bar.date,
        side: "LONG",
        pnl: Math.round(equity - openEntryValue),
        returnPct: Number(((equity / openEntryValue - 1) * 100).toFixed(2)),
        bars: index - openEntryIndex,
      });
      openEntryIndex = -1;
      openEntryValue = 0;
    }

    const hasPosition = openEntryIndex !== -1;
    const markToMarket = hasPosition ? openEntryValue * (bar.close / bars[openEntryIndex].close) : equity;
    const strategyValue = Math.max(0, hasPosition ? markToMarket : equity);
    peak = Math.max(peak, strategyValue);
    equityPoints.push({
      date: bar.date,
      strategy: Math.round(strategyValue),
      benchmark: Math.round(benchmark),
      drawdown: Number(((strategyValue / peak - 1) * 100).toFixed(2)),
    });
  });

  if (openEntryIndex !== -1) {
    const final = bars.at(-1)!;
    equity *= final.close / bars[openEntryIndex].close;
    trades.push({
      id: `T-${String(trades.length + 1).padStart(3, "0")}`,
      entry: bars[openEntryIndex].date,
      exit: final.date,
      side: "LONG",
      pnl: Math.round(equity - openEntryValue),
      returnPct: Number(((equity / openEntryValue - 1) * 100).toFixed(2)),
      bars: bars.length - 1 - openEntryIndex,
    });
  }

  return { equity: equityPoints, trades };
}

export const executionLabel = "Close signal → next bar open";
