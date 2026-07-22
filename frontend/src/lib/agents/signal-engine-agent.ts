import type { BacktestConfig, MarketBar } from "./types";

export type Signal = "BUY" | "SELL" | "HOLD";

export function generateSignals(bars: MarketBar[], config: BacktestConfig): Signal[] {
  const fast = config.strategy.includes("MACD") ? 5 : config.strategy.includes("Bollinger") ? 4 : 6;
  const slow = config.strategy.includes("EMA") ? 12 : 14;
  return bars.map((bar, index) => {
    if (index < slow) return "HOLD";
    const fastMean = bars.slice(index - fast, index).reduce((sum, point) => sum + point.close, 0) / fast;
    const slowMean = bars.slice(index - slow, index).reduce((sum, point) => sum + point.close, 0) / slow;
    if (fastMean > slowMean * 1.012) return "BUY";
    if (fastMean < slowMean * 0.988) return "SELL";
    return "HOLD";
  });
}

export const signalLabel = "No look-ahead · next bar execution";
