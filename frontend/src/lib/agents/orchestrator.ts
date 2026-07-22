import { fetchMarketData, providerLabel } from "./market-data-agent";
import { generateSignals, signalLabel } from "./signal-engine-agent";
import { executionLabel, runSimulation } from "./backtest-runner-agent";
import { analyseRisk, riskLabel } from "./risk-analyst-agent";
import { narrateResult, narratorLabel } from "./ux-narrator-agent";
import type { AgentSnapshot, BacktestConfig, BacktestResult } from "./types";

export const swarmAgents: AgentSnapshot[] = [
  { id: "market-data", name: "Market Data", role: "Agent 01", description: providerLabel, status: "complete", metric: "1,246 bars", color: "blue" },
  { id: "signal-engine", name: "Signal Engine", role: "Agent 02", description: signalLabel, status: "complete", metric: "RSI + EMA", color: "violet" },
  { id: "backtest-runner", name: "Backtest Runner", role: "Agent 03", description: executionLabel, status: "complete", metric: "Vectorized", color: "mint" },
  { id: "risk-analyst", name: "Risk Analyst", role: "Agent 04", description: riskLabel, status: "complete", metric: "6 checks", color: "amber" },
  { id: "ux-narrator", name: "UX Narrator", role: "Agent 05", description: narratorLabel, status: "complete", metric: "Ready", color: "rose" },
];

export function runSwarmBacktest(config: BacktestConfig): BacktestResult {
  const bars = fetchMarketData(config);
  const signals = generateSignals(bars, config);
  const simulation = runSimulation(bars, signals, config);
  const risk = analyseRisk(simulation.equity, simulation.trades);
  const narrative = narrateResult(config, risk);
  return {
    bars,
    equity: simulation.equity,
    trades: simulation.trades,
    ...risk,
    finalValue: simulation.equity.at(-1)?.strategy ?? config.initialCapital,
    narrative,
    caveat: "The dashboard preview is being replaced with local official NSE data. Server backtests use the local NSE historical cache; no broker orders are sent.",
  };
}

export type { AgentSnapshot, BacktestConfig, BacktestResult } from "./types";
