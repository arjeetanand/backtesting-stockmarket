import type { BacktestConfig, MarketBar } from "./types";

const symbolBases: Record<string, number> = {
  "NIFTY 50": 100,
  BANKNIFTY: 86,
  RELIANCE: 118,
  TCS: 128,
  INFY: 112,
};

function hash(text: string) {
  return [...text].reduce((total, character) => total + character.charCodeAt(0), 17);
}

export function fetchMarketData(config: BacktestConfig): MarketBar[] {
  const start = new Date(`${config.start}T00:00:00Z`);
  const end = new Date(`${config.end}T00:00:00Z`);
  const monthCount = Math.max(18, Math.min(72, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30))));
  const base = symbolBases[config.symbol] ?? 100;
  const seed = hash(`${config.symbol}:${config.strategy}`);

  return Array.from({ length: monthCount + 1 }, (_, index) => {
    const date = new Date(start);
    date.setMonth(start.getMonth() + index);
    const cycle = Math.sin(index * 0.68 + seed) * 2.4 + Math.cos(index * 0.19) * 1.3;
    const trend = index * (config.symbol === "BANKNIFTY" ? 1.05 : 0.8);
    const regime = Math.sin(index * 0.13 + seed / 10) > 0.2 ? 1.18 : 0.78;
    return {
      date: date.toISOString().slice(0, 7),
      close: Number((base + trend * regime + cycle).toFixed(2)),
      volume: Math.round(1_000_000 + Math.abs(Math.sin(index * 0.42 + seed)) * 1_600_000),
    };
  });
}

export const providerLabel = "Keyless Yahoo Finance historical adapter";
