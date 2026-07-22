import { fetchWithTimeout } from "./api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type LiveBacktestResult = {
  run_id: string;
  symbol: string;
  timeframe: string;
  initial_capital: number;
  final_equity: number;
  metrics: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
    win_rate: number;
    profit_factor: number;
    total_trades: number;
  };
  equity_curve: Array<{ date: string; equity: number }>;
  trades: Array<{ trade_id: number; entry_date: string; exit_date: string; position: string; pnl: number; return_pct: number }>;
};

export type StrategyBacktestInput = {
  symbol: string;
  strategyId?: string;
  timeframe?: "1day" | "1week" | "1month";
  start: string;
  end: string;
  initialCapital: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  fastEma: number;
  slowEma: number;
  commissionPct: number;
  slippagePct: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  positionSizePct?: number;
  maxPositions?: number;
};

export async function runLocalBacktest(input: { symbol: string; start: string; end: string; initialCapital: number }): Promise<LiveBacktestResult> {
  return runStrategyBacktest({
    ...input,
    rsiPeriod: 14,
    rsiOversold: 30,
    rsiOverbought: 70,
    fastEma: 20,
    slowEma: 50,
    commissionPct: 0.001,
    slippagePct: 0.0005,
  });
}

export async function runStrategyBacktest(input: StrategyBacktestInput): Promise<LiveBacktestResult> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/backtests/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: input.symbol,
      strategy_id: input.strategyId ?? "rsi_ema",
      timeframe: input.timeframe ?? "1day",
      start: `${input.start}T00:00:00`,
      end: `${input.end}T23:59:59`,
      initial_capital: input.initialCapital,
      rsi_period: input.rsiPeriod,
      rsi_oversold: input.rsiOversold,
      rsi_overbought: input.rsiOverbought,
      fast_ema: input.fastEma,
      slow_ema: input.slowEma,
      commission_pct: input.commissionPct,
      slippage_pct: input.slippagePct,
      stop_loss_pct: input.stopLossPct ?? 0,
      take_profit_pct: input.takeProfitPct ?? 0,
      position_size_pct: input.positionSizePct ?? 100,
      max_positions: input.maxPositions ?? 1,
    }),
  });
  const payload = await response.json().catch(() => null) as LiveBacktestResult | { detail?: string } | null;
  if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not run local backtest." : "Could not run local backtest.");
  return payload as LiveBacktestResult;
}
