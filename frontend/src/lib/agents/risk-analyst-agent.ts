import type { EquityPoint, Trade } from "./types";

export function analyseRisk(equity: EquityPoint[], trades: Trade[]) {
  const winners = trades.filter((trade) => trade.pnl > 0);
  const losers = trades.filter((trade) => trade.pnl <= 0);
  const grossProfit = winners.reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, trade) => sum + trade.pnl, 0));
  const final = equity.at(-1)!;
  const monthlyReturns = equity.slice(1).map((point, index) => point.strategy / equity[index].strategy - 1);
  const avg = monthlyReturns.reduce((sum, value) => sum + value, 0) / Math.max(monthlyReturns.length, 1);
  const variance = monthlyReturns.reduce((sum, value) => sum + (value - avg) ** 2, 0) / Math.max(monthlyReturns.length, 1);
  return {
    netReturn: Number(((final.strategy / equity[0].strategy - 1) * 100).toFixed(1)),
    benchmarkReturn: Number(((final.benchmark / equity[0].benchmark - 1) * 100).toFixed(1)),
    winRate: Number(((winners.length / Math.max(trades.length, 1)) * 100).toFixed(1)),
    maxDrawdown: Number(Math.min(...equity.map((point) => point.drawdown)).toFixed(1)),
    sharpe: Number(((avg / Math.max(Math.sqrt(variance), 0.0001)) * Math.sqrt(12)).toFixed(2)),
    profitFactor: Number((grossProfit / Math.max(grossLoss, 1)).toFixed(2)),
  };
}

export const riskLabel = "Walk-forward caveat attached";
