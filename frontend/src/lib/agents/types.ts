export type BacktestConfig = {
  symbol: string;
  strategy: string;
  timeframe: string;
  start: string;
  end: string;
  initialCapital: number;
  commissionBps: number;
};

export type MarketBar = {
  date: string;
  close: number;
  volume: number;
};

export type AgentStatus = "idle" | "running" | "complete" | "warning";

export type AgentSnapshot = {
  id: string;
  name: string;
  role: string;
  description: string;
  status: AgentStatus;
  metric: string;
  color: "blue" | "violet" | "mint" | "amber" | "rose";
};

export type Trade = {
  id: string;
  entry: string;
  exit: string;
  side: "LONG";
  pnl: number;
  returnPct: number;
  bars: number;
};

export type EquityPoint = {
  date: string;
  strategy: number;
  benchmark: number;
  drawdown: number;
};

export type BacktestResult = {
  bars: MarketBar[];
  equity: EquityPoint[];
  trades: Trade[];
  netReturn: number;
  benchmarkReturn: number;
  winRate: number;
  maxDrawdown: number;
  sharpe: number;
  profitFactor: number;
  finalValue: number;
  narrative: string;
  caveat: string;
};
