import type { BacktestConfig, BacktestResult } from "./types";

export function narrateResult(config: BacktestConfig, result: Pick<BacktestResult, "netReturn" | "benchmarkReturn" | "winRate" | "maxDrawdown">) {
  const outperformance = result.netReturn - result.benchmarkReturn;
  const verdict = outperformance >= 0 ? "outperformed" : "lagged";
  return `${config.strategy} ${verdict} ${config.symbol} buy & hold by ${Math.abs(outperformance).toFixed(1)} pts with a ${result.winRate.toFixed(1)}% win rate.`;
}

export const narratorLabel = "Plain-English result summary";
