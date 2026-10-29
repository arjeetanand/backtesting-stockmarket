const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type MarketAvailability = {
  symbol: string;
  timeframe: string;
  bars: number;
  earliest: string | null;
  latest: string | null;
  latest_close: number | null;
};

export type MarketDataBar = {
  timestamp: string;
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketDataResponse = {
  symbol: string;
  timeframe: string;
  bars: MarketDataBar[];
  quality: {
    is_valid: boolean;
    errors: Array<string | { message?: string }>;
    warnings: Array<string | { message?: string }>;
  };
};

export type VolumeMomentumStats = {
  observations: number;
  next_up_count: number;
  next_down_count: number;
  next_flat_count: number;
  next_up_rate: number | null;
  next_down_rate: number | null;
  average_next_return: number | null;
  median_next_return: number | null;
};

export type VolumeMomentumGroup = VolumeMomentumStats & {
  volume_band: string;
  momentum_direction: "down" | "flat" | "up";
};

export type VolumeMomentumResponse = {
  symbol: string;
  start: string;
  end: string;
  lookback_sessions: number;
  momentum_cutoff_pct: number;
  next_day_direction_cutoff_pct: number;
  overall: VolumeMomentumStats;
  groups: VolumeMomentumGroup[];
  excluded_insufficient_history: number;
  excluded_no_next_session: number;
  excluded_next_session_after_end: number;
  excluded_zero_volume_baseline: number;
  notes: string[];
};

export async function getMarketAvailability(symbol: string): Promise<MarketAvailability> {
  const response = await fetch(`${API_BASE_URL}/data/availability?symbol=${encodeURIComponent(symbol)}`);
  const payload = await response.json().catch(() => null) as MarketAvailability | { detail?: string } | null;
  if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not read local data availability." : "Could not read local data availability.");
  return payload as MarketAvailability;
}

export async function getMarketData(symbol: string, start: string, end: string, timeframe = "1day"): Promise<MarketDataResponse> {
  const params = new URLSearchParams({
    symbol,
    start: `${start}T00:00:00`,
    end: `${end}T23:59:59`,
    timeframe,
  });
  const response = await fetch(`${API_BASE_URL}/market-data?${params.toString()}`);
  const payload = await response.json().catch(() => null) as MarketDataResponse | { detail?: string } | null;
  if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not load local market data." : "Could not load local market data.");
  return payload as MarketDataResponse;
}

export async function analyzeVolumeMomentum(symbol: string, start: string, end: string): Promise<VolumeMomentumResponse> {
  const response = await fetch(`${API_BASE_URL}/research/volume-momentum`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, start, end }),
  });
  const payload = await response.json().catch(() => null) as VolumeMomentumResponse | { detail?: string } | null;
  if (!response.ok) {
    throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not calculate volume and next-day outcomes." : "Could not calculate volume and next-day outcomes.");
  }
  return payload as VolumeMomentumResponse;
}
