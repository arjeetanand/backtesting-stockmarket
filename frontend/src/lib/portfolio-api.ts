import { fetchWithTimeout } from "@/lib/api";
import type { MarketDataSync } from "@/lib/stock-research";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";
const MAX_UPLOAD_BYTES = 10_000_000;

export type PortfolioSourceFormat = "xlsx" | "pdf" | "image" | "manual";

export type PortfolioHoldingDraft = {
  symbol: string;
  quantity: string;
  average_price: string;
  source_row?: string;
};

export type PortfolioPreview = {
  source_format: Exclude<PortfolioSourceFormat, "manual">;
  holdings: PortfolioHoldingDraft[];
  warnings: string[];
};

export type PortfolioSnapshot = {
  snapshot_id: string;
  created_at: string;
  source_format: PortfolioSourceFormat;
  holdings: Array<{
    symbol: string;
    quantity: string;
    average_price: string;
    cost_basis: string;
  }>;
  total_positions: number;
  total_shares: string;
  total_cost_basis: string;
};

export type PortfolioAnalysisPosition = {
  symbol: string;
  quantity: string;
  average_price: string;
  cost_basis: string;
  latest_close: string | null;
  market_value: string | null;
  market_value_weight_pct: string | null;
  unrealized_pnl: string | null;
  unrealized_pnl_pct: string | null;
  data_as_of: string | null;
  data_age_days: number | null;
  freshness: "fresh" | "stale" | "missing";
  indicators: {
    sma20: string | null;
    sma50: string | null;
    sma200: string | null;
    sma20_completed_months: string | null;
    relative_volume_20d: string | null;
    daily_bars_used: number;
    completed_months_used: number;
  };
  rule_assessment: {
    status: "insufficient_history" | "stale_data" | "triggered" | "watch" | "no_long_setup";
    data_as_of: string | null;
    history_bars: number;
    data_age_days: number | null;
    entry_trigger: string | null;
    stop_loss: string | null;
    target_1r: string | null;
    target_2r: string | null;
    risk_per_share: string | null;
    reasons: string[];
    level_note: string;
    historical_gate_status: "not_evaluated";
  };
  observations: string[];
};

export type PortfolioAnalysis = {
  snapshot_id: string;
  analyzed_at: string;
  data_source: string;
  price_basis: string;
  data_as_of: string | null;
  totals: {
    total_positions: number;
    priced_positions: number;
    total_cost_basis: string;
    priced_market_value: string;
    unrealized_pnl_on_priced_positions: string;
  };
  review_priorities: string[];
  positions: PortfolioAnalysisPosition[];
  market_sync: MarketDataSync | null;
};

type ApiError = { detail?: string };

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & ApiError) | null;
  if (!response.ok) throw new Error(payload?.detail ?? fallback);
  if (payload === null) throw new Error("The local service returned an unreadable response.");
  return payload;
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

export async function previewPortfolioFile(file: File): Promise<PortfolioPreview> {
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Choose a file smaller than 10 MB.");
  const dataBase64 = encodeBase64(new Uint8Array(await file.arrayBuffer()));
  const response = await fetchWithTimeout(`${API_BASE_URL}/portfolio/import/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, content_type: file.type || null, data_base64: dataBase64 }),
  }, 90_000);
  return readResponse<PortfolioPreview>(response, "Could not preview this file.");
}

export async function savePortfolioSnapshot(
  sourceFormat: PortfolioSourceFormat,
  holdings: PortfolioHoldingDraft[],
): Promise<PortfolioSnapshot> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/portfolio/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_format: sourceFormat,
      holdings: holdings.map(({ symbol, quantity, average_price }) => ({ symbol, quantity, average_price })),
    }),
  });
  return readResponse<PortfolioSnapshot>(response, "Could not save this portfolio snapshot.");
}

export async function getPortfolioSnapshots(): Promise<PortfolioSnapshot[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/portfolio/snapshots?limit=20`);
  const payload = await readResponse<{ snapshots: PortfolioSnapshot[] }>(response, "Could not load saved portfolios.");
  if (!Array.isArray(payload.snapshots)) throw new Error("The saved portfolio response was not valid.");
  return payload.snapshots;
}

export async function getPortfolioAnalysis(snapshotId: string): Promise<PortfolioAnalysis> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/portfolio/snapshots/${encodeURIComponent(snapshotId)}/analysis`, {}, 120_000);
  return readResponse<PortfolioAnalysis>(response, "Could not analyze this portfolio with local daily data.");
}
