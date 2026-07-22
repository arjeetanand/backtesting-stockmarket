// Mock data for all screens

export const mockMetrics = {
  totalBacktests: 142,
  bestSharpe: 1.87,
  avgMaxDrawdown: -9.3,
  activeRuns: 3,
};

export const mockRecentRuns = [
  {
    id: "bt_a3f7c2d1",
    name: "RSI Oversold + EMA Trend Confirmation",
    hypothesis:
      "Test whether RSI oversold signals combined with EMA trend confirmation outperform buy and hold on NIFTY 50.",
    status: "COMPLETED" as const,
    symbols: ["NIFTY 50"],
    cagr: 18.2,
    sharpe: 1.87,
    maxDrawdown: -12.3,
    trades: 182,
    runDate: "2024-01-15",
    runDuration: "2m 43s",
    dateRange: "2019-01-01 → 2024-12-31",
  },
  {
    id: "bt_c4d9a7b2",
    name: "Bollinger Band Mean Reversion",
    hypothesis:
      "Test mean reversion strategy using Bollinger Band squeeze on Bank NIFTY.",
    status: "RUNNING" as const,
    symbols: ["BANKNIFTY"],
    cagr: null,
    sharpe: null,
    maxDrawdown: null,
    trades: null,
    runDate: "2024-01-15",
    runDuration: "1m 12s",
    dateRange: "2020-01-01 → 2024-12-31",
  },
  {
    id: "bt_b8e2f1a4",
    name: "MACD Momentum Strategy",
    hypothesis:
      "MACD crossover signals with volume confirmation on large-cap index.",
    status: "COMPLETED" as const,
    symbols: ["NIFTY 50"],
    cagr: 12.7,
    sharpe: 1.34,
    maxDrawdown: -18.7,
    trades: 243,
    runDate: "2024-01-14",
    runDuration: "3m 21s",
    dateRange: "2019-01-01 → 2024-12-31",
  },
];

export const mockAllRuns = [
  ...mockRecentRuns,
  {
    id: "bt_d1e5f8c6",
    name: "ATR Breakout System",
    hypothesis: "ATR-based breakout with trend filter.",
    status: "FAILED" as const,
    symbols: ["NIFTY 50"],
    cagr: null,
    sharpe: null,
    maxDrawdown: null,
    trades: null,
    runDate: "2024-01-13",
    runDuration: "0m 32s",
    dateRange: "2021-01-01 → 2024-12-31",
  },
  {
    id: "bt_e7f3d2a9",
    name: "EMA Crossover Classic",
    hypothesis: "Classic EMA 20/50 crossover on NIFTY Bank.",
    status: "COMPLETED" as const,
    symbols: ["NIFTY BANK"],
    cagr: 9.1,
    sharpe: 0.94,
    maxDrawdown: -22.1,
    trades: 178,
    runDate: "2024-01-12",
    runDuration: "2m 05s",
    dateRange: "2018-01-01 → 2024-12-31",
  },
  {
    id: "bt_f2a8b3c1",
    name: "Dual RSI Momentum",
    hypothesis: "Dual RSI divergence strategy with EMA filter.",
    status: "COMPLETED" as const,
    symbols: ["NIFTY 50"],
    cagr: 15.4,
    sharpe: 1.52,
    maxDrawdown: -14.8,
    trades: 156,
    runDate: "2024-01-11",
    runDuration: "2m 55s",
    dateRange: "2019-01-01 → 2024-12-31",
  },
  {
    id: "bt_g9c4d5e2",
    name: "Supertrend Momentum",
    hypothesis: "Supertrend indicator momentum on mid-caps.",
    status: "COMPLETED" as const,
    symbols: ["NIFTY MIDCAP"],
    cagr: 21.3,
    sharpe: 1.71,
    maxDrawdown: -16.2,
    trades: 134,
    runDate: "2024-01-10",
    runDuration: "2m 18s",
    dateRange: "2020-01-01 → 2024-12-31",
  },
  {
    id: "bt_h1e7f9a3",
    name: "VWAP Intraday Scalper",
    hypothesis: "VWAP deviation scalping strategy on Nifty futures.",
    status: "COMPLETED" as const,
    symbols: ["NIFTY FUT"],
    cagr: 28.9,
    sharpe: 2.14,
    maxDrawdown: -8.4,
    trades: 512,
    runDate: "2024-01-09",
    runDuration: "5m 42s",
    dateRange: "2022-01-01 → 2024-12-31",
  },
];

export const mockBacktestResult = {
  id: "bt_a3f7c2d1",
  name: "RSI Oversold + EMA Trend Confirmation",
  status: "COMPLETED",
  symbols: "NIFTY 50",
  exchange: "NSE",
  timeframe: "1D",
  dateRange: "2019-01-01 to 2024-12-31",
  runDuration: "2m 43s",
  engineVersion: "vbt-0.6.2",
  executionTimestamp: "2024-01-15T14:32:18Z",
  strategyHash: "a3f7c2d1e4b5",
  dataHash: "9e8d7c6b5a4",
  metrics: {
    totalReturn: 34.7,
    cagr: 18.2,
    sharpeRatio: 1.87,
    sortinoRatio: 2.14,
    calmarRatio: 1.48,
    maxDrawdown: -12.3,
    annualizedVolatility: 11.8,
    winRate: 62.4,
    profitFactor: 1.73,
    expectancy: 847,
    avgWinner: 1284,
    avgLoser: -742,
    payoffRatio: 1.73,
    tradeCount: 182,
    avgHoldingDays: 3.2,
    exposure: 68.4,
    turnover: 3.2,
  },
  biasChecks: [
    { name: "Look-ahead Bias", status: "PASS" as const },
    { name: "Survivorship Bias", status: "WARN" as const },
    { name: "Overfitting Check", status: "PASS" as const },
    { name: "Data Snooping", status: "PASS" as const },
  ],
  warnings: [
    "Survivorship bias: index composition changes during test period not accounted for.",
  ],
  aiAnalysis: [
    "The RSI+EMA strategy outperforms buy-and-hold with a 1.87 Sharpe vs. estimated 0.81 for passive.",
    "Entry signals are concentrated during high-volatility periods (VIX > 20), suggesting the strategy profits from mean reversion post-spike.",
    "The 62.4% win rate combined with 1.73 payoff ratio indicates favorable asymmetry — letting winners run while cutting losses.",
    "Max drawdown of -12.3% is well-controlled relative to returns; Calmar of 1.48 is excellent.",
    "Consider walk-forward testing to validate performance across unseen market regimes.",
  ],
};

// Equity curve data
export const mockEquityCurve = Array.from({ length: 72 }, (_, i) => {
  const date = new Date("2019-01-01");
  date.setMonth(date.getMonth() + i);
  // Fixed oscillations keep demo data stable across SSR and client hydration.
  // It is intentionally not random: a changing curve makes a backtest result
  // impossible to compare and caused React hydration errors in the run view.
  const strategyGrowth =
    100000 * (1 + 0.182 * (i / 12)) +
    Math.sin(i * 0.8) * 5000 +
    Math.cos(i * 0.31) * 1800;
  const benchmarkGrowth =
    100000 * (1 + 0.098 * (i / 12)) +
    Math.sin(i * 0.6) * 3200 +
    Math.cos(i * 0.43) * 1100;
  return {
    date: date.toISOString().slice(0, 7),
    strategy: Math.max(80000, strategyGrowth + i * 500),
    benchmark: Math.max(70000, benchmarkGrowth + i * 300),
  };
});

// Drawdown data
export const mockDrawdownData = mockEquityCurve.map((point) => ({
  date: point.date,
  drawdown: Math.min(
    0,
    ((point.strategy - Math.max(...mockEquityCurve.slice(0, mockEquityCurve.indexOf(point) + 1).map((p) => p.strategy))) /
      Math.max(...mockEquityCurve.slice(0, mockEquityCurve.indexOf(point) + 1).map((p) => p.strategy))) *
      100
  ),
}));

// Top strategies for dashboard chart
export const mockTopStrategies = Array.from({ length: 36 }, (_, i) => {
  const date = new Date("2021-01-01");
  date.setMonth(date.getMonth() + i);
  return {
    date: date.toISOString().slice(0, 7),
    "RSI+EMA": 100 + i * 1.5 + Math.sin(i * 0.9) * 4 + Math.cos(i * 0.29),
    "MACD Momentum": 100 + i * 1.1 + Math.sin(i * 0.7) * 5 + Math.cos(i * 0.41) * 1.5,
    "EMA Crossover": 100 + i * 0.8 + Math.sin(i * 0.5) * 3 + Math.cos(i * 0.63),
  };
});

export const exampleHypotheses = [
  "Test whether RSI oversold signals combined with EMA trend confirmation outperform buy and hold on NIFTY 50",
  "Does MACD crossover with volume filter generate alpha on BANKNIFTY from 2020 to 2024?",
  "Bollinger Band squeeze + RSI momentum hybrid on large-cap Indian equities",
  "ATR-based volatility breakout strategy on NIFTY Midcap 150 index",
];

export const agentWorkflowSteps = [
  { id: 1, label: "Parse Hypothesis", description: "NLP extraction of strategy parameters" },
  { id: 2, label: "Validate DSL", description: "Type-safe strategy compilation" },
  { id: 3, label: "Load Market Data", description: "Fetching OHLCV bars" },
  { id: 4, label: "Compile Strategy", description: "Indicator dependency resolution" },
  { id: 5, label: "Execute Backtest", description: "VectorBT simulation engine" },
  { id: 6, label: "Calculate Metrics", description: "Deterministic quant metrics" },
  { id: 7, label: "Detect Biases", description: "Look-ahead, survivorship checks" },
  { id: 8, label: "Generate Analysis", description: "AI research summary" },
];

export type RunStatus = "COMPLETED" | "RUNNING" | "FAILED" | "PENDING";
