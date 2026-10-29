const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type FiiDiiSource = "nse" | "tapetide";
export type FiiDiiScope = "combined" | "nse_only";
export type FiiDiiSegment = "equity" | "index_future" | "index_option" | "stock_future" | "stock_option";

export type FiiDiiRow = {
  date: string;
  participant: "FII" | "DII";
  scope: FiiDiiScope | "tapetide";
  segment: FiiDiiSegment;
  buy_value: number;
  sell_value: number;
  net_value: number;
  source: string;
};

export type FiiDiiSummary = {
  period: "daily" | "weekly" | "monthly";
  label: string;
  start: string;
  end: string;
  fii_net: number;
  dii_net: number;
};

export type FiiDiiChartPoint = {
  date: string;
  label: string;
  fii_net: number | null;
  dii_net: number | null;
};

export type FiiDiiIndexPoint = {
  date: string;
  close: number;
};

export type FiiDiiResponse = {
  scope: FiiDiiScope | "tapetide";
  segment: FiiDiiSegment;
  start: string;
  end: string;
  rows: FiiDiiRow[];
  summaries: FiiDiiSummary[];
  chart: FiiDiiChartPoint[];
  nifty50: FiiDiiIndexPoint[];
  coverage_start: string | null;
  coverage_end: string | null;
  coverage_days: number;
  coverage_note: string | null;
  source_url: string;
  provisional: boolean;
};

export type FiiDiiImportStatus = {
  job_id: string;
  status: "queued" | "running" | "complete" | "failed";
  message: string;
  scope?: FiiDiiScope;
  stored_rows?: number;
  available_start?: string | null;
  available_end?: string | null;
  stage?: string;
};

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null) as T | { detail?: string } | null;
  if (!response.ok) {
    throw new Error(payload && typeof payload === "object" && payload !== null && "detail" in payload
      ? payload.detail ?? `Request failed (${response.status}).`
      : `Request failed (${response.status}).`);
  }
  return payload as T;
}

export async function getFiiDiiData(start: string, end: string, scope: FiiDiiScope, segment: FiiDiiSegment, source: FiiDiiSource): Promise<FiiDiiResponse> {
  const params = new URLSearchParams({ start, end, scope, segment, source });
  return jsonRequest<FiiDiiResponse>(`${API_BASE_URL}/insights/fii-dii?${params.toString()}`);
}

export async function startFiiDiiImport(start: string, end: string, scope: FiiDiiScope): Promise<{ job_id: string }> {
  return jsonRequest<{ job_id: string }>(`${API_BASE_URL}/insights/fii-dii/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end, scope }),
  });
}

export async function getFiiDiiImportStatus(jobId: string): Promise<FiiDiiImportStatus> {
  return jsonRequest<FiiDiiImportStatus>(`${API_BASE_URL}/insights/fii-dii/import/${encodeURIComponent(jobId)}`);
}
