const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

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

export async function runLocalBacktest(input: { symbol: string; start: string; end: string; initialCapital: number }): Promise<LiveBacktestResult> {
  const response = await fetch(`${API_BASE_URL}/backtests/custom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: input.symbol,
      timeframe: "1day",
      start: `${input.start}T00:00:00`,
      end: `${input.end}T23:59:59`,
      initial_capital: input.initialCapital,
    }),
  });
  const payload = await response.json().catch(() => null) as LiveBacktestResult | { detail?: string } | null;
  if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not run local backtest." : "Could not run local backtest.");
  return payload as LiveBacktestResult;
}
