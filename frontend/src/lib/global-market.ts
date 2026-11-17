import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type GlobalMarketTopic = "global" | "equities" | "rates" | "commodities";
export type GlobalMarketBriefData = {
  brief_id: string;
  topic: GlobalMarketTopic;
  symbol: string | null;
  created_at: string;
  requested_at: string;
  model: string;
  text: string;
  citations: Array<{ title: string; url: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, init, 90_000);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(typeof payload?.detail === "string" ? payload.detail : "The market brief request could not complete.");
  }
  return payload as T;
}

export function createGlobalMarketBrief(topic: GlobalMarketTopic, symbol?: string): Promise<GlobalMarketBriefData> {
  return request("/global-market/briefs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, symbol: symbol || null }),
  });
}

export function loadGlobalMarketBriefs(topic: GlobalMarketTopic, symbol?: string): Promise<{ briefs: GlobalMarketBriefData[] }> {
  const params = new URLSearchParams({ topic });
  if (symbol) params.set("symbol", symbol);
  return request(`/global-market/briefs?${params.toString()}`);
}
