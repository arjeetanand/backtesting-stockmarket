const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export type MarketAvailability = {
  symbol: string;
  timeframe: string;
  bars: number;
  earliest: string | null;
  latest: string | null;
  latest_close: number | null;
};

export async function getMarketAvailability(symbol: string): Promise<MarketAvailability> {
  const response = await fetch(`${API_BASE_URL}/data/availability?symbol=${encodeURIComponent(symbol)}`);
  const payload = await response.json().catch(() => null) as MarketAvailability | { detail?: string } | null;
  if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not read local data availability." : "Could not read local data availability.");
  return payload as MarketAvailability;
}
