const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type InsightUniverse = "nifty50" | "sensex" | "banknifty" | "nifty500";
export type InsightPeriod = "1D" | "1W" | "1M" | "3M";
export type InsightView = "stock" | "sector";
export type InsightCoverageStatus = "ready" | "partial" | "stale" | "unavailable" | "empty";

export type InsightBreadth = {
  gainers: number;
  losers: number;
  unchanged: number;
  advances: number;
  declines: number;
};

export type InsightMember = {
  symbol: string;
  companyName: string;
  sector: string;
  returnFraction: number | null;
  dataAsOf: string | null;
  available: boolean;
};

export type InsightSector = {
  sector: string;
  returnFraction: number | null;
  stockCount: number;
  gainers: number;
  losers: number;
  unchanged: number;
};

export type InsightsResponse = {
  universe: InsightUniverse;
  period: InsightPeriod;
  dataAsOf: string | null;
  coverageStatus: InsightCoverageStatus;
  availableSymbols: number;
  missingSymbols: number;
  totalSymbols: number;
  breadth: InsightBreadth;
  members: InsightMember[];
  sectors: InsightSector[];
  topMovers: InsightMember[];
  message?: string;
};

type UnknownRecord = Record<string, unknown>;

const UNIVERSES: InsightUniverse[] = ["nifty50", "sensex", "banknifty", "nifty500"];
const PERIODS: InsightPeriod[] = ["1D", "1W", "1M", "3M"];

function record(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : {};
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function countValue(value: unknown, fallback = 0): number {
  if (Array.isArray(value)) return value.length;
  return numberValue(value, fallback);
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function returnValue(item: UnknownRecord): number | null {
  const percentageValue = item.return_pct ?? item.average_return_pct;
  if (typeof percentageValue === "number" && Number.isFinite(percentageValue)) return percentageValue / 100;
  const value = item.return_fraction ?? item.return ?? item.price_return ?? item.change_pct;
  const parsed = nullableNumber(value);
  if (parsed === null) return null;
  // API contracts use fractions for returns. Accept percentage-shaped values
  // from an early backend response without turning missing values into prices.
  return Math.abs(parsed) > 1 ? parsed / 100 : parsed;
}

function dateValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeUniverse(value: unknown): InsightUniverse {
  const candidate = stringValue(value, "nifty50").toLowerCase().replace(/[-_ ]/g, "");
  if (candidate === "sensex" || candidate === "banknifty" || candidate === "nifty500") return candidate;
  return "nifty50";
}

function normalizePeriod(value: unknown): InsightPeriod {
  const candidate = stringValue(value, "1D").toUpperCase();
  return PERIODS.includes(candidate as InsightPeriod) ? candidate as InsightPeriod : "1D";
}

function normalizeMember(value: unknown): InsightMember {
  const item = record(value);
  return {
    symbol: stringValue(item.symbol ?? item.ticker, "Unknown"),
    companyName: stringValue(item.company_name ?? item.companyName ?? item.name, "Local NSE symbol"),
    sector: stringValue(item.sector, "Unclassified"),
    returnFraction: returnValue(item),
    dataAsOf: dateValue(item.data_as_of ?? item.dataAsOf ?? item.date),
    available: item.available !== false && item.status !== "unavailable",
  };
}

function normalizeSector(value: unknown): InsightSector {
  const item = record(value);
  return {
    sector: stringValue(item.sector ?? item.name, "Unclassified"),
    returnFraction: returnValue({ ...item, return: item.return ?? item.average_return_pct }),
    stockCount: numberValue(item.stock_count ?? item.stockCount ?? item.member_count),
    gainers: numberValue(item.gainers ?? item.advances),
    losers: numberValue(item.losers ?? item.declines),
    unchanged: numberValue(item.unchanged),
  };
}

function normalizeStatus(payload: UnknownRecord, members: InsightMember[], missingSymbols: number): InsightCoverageStatus {
  const candidate = stringValue(payload.coverage_status ?? payload.coverageStatus ?? payload.result_status ?? payload.status).toLowerCase();
  const freshness = stringValue(payload.freshness_status ?? payload.freshnessStatus).toLowerCase();
  if (["ready", "partial", "stale", "unavailable", "empty"].includes(candidate)) return candidate as InsightCoverageStatus;
  if (!members.length) return "empty";
  if (freshness === "stale") return "stale";
  if (candidate === "complete") return missingSymbols > 0 ? "partial" : "ready";
  if (candidate === "error") return "unavailable";
  if (missingSymbols > 0) return "partial";
  return "ready";
}

export function normalizeInsightsPayload(payload: unknown, requestedUniverse?: InsightUniverse, requestedPeriod?: InsightPeriod): InsightsResponse {
  const root = record(payload);
  const breadth = record(root.breadth);
  const members = Array.isArray(root.members)
    ? root.members.map(normalizeMember)
    : Array.isArray(root.stocks)
      ? root.stocks.map(normalizeMember)
    : Array.isArray(root.constituents)
      ? root.constituents.map(normalizeMember)
      : [];
  const sectors = Array.isArray(root.sectors)
    ? root.sectors.map(normalizeSector)
    : Array.isArray(root.sector_breakdown)
      ? root.sector_breakdown.map(normalizeSector)
      : [];
  const missingSymbols = countValue(root.missing_symbols ?? root.missingSymbols);
  const availableSymbols = countValue(root.available_symbols ?? root.availableSymbols ?? root.available_members, members.filter((item) => item.available).length);
  const totalSymbols = countValue(root.total_symbols ?? root.totalSymbols ?? root.requested_members, availableSymbols + missingSymbols);

  return {
    universe: requestedUniverse ?? normalizeUniverse(root.universe ?? root.requested_universe),
    period: requestedPeriod ?? normalizePeriod(root.period),
    dataAsOf: dateValue(root.data_as_of ?? root.dataAsOf ?? root.latest_date),
    coverageStatus: normalizeStatus(root, members, missingSymbols),
    availableSymbols,
    missingSymbols,
    totalSymbols,
    breadth: {
      gainers: numberValue(breadth.gainers ?? root.gainers ?? root.advancing),
      losers: numberValue(breadth.losers ?? root.losers ?? root.declining),
      unchanged: numberValue(breadth.unchanged ?? root.unchanged),
      advances: numberValue(breadth.advances ?? root.advances ?? root.advancing),
      declines: numberValue(breadth.declines ?? root.declines ?? root.declining),
    },
    members,
    sectors,
    topMovers: Array.isArray(root.top_movers)
      ? root.top_movers.map(normalizeMember)
      : Array.isArray(root.topMovers)
        ? root.topMovers.map(normalizeMember)
        : [...members].sort((left, right) => Math.abs(right.returnFraction ?? 0) - Math.abs(left.returnFraction ?? 0)).slice(0, 10),
    message: stringValue(root.message) || undefined,
  };
}

async function jsonRequest<T>(url: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const payload = await response.json().catch(() => null) as UnknownRecord | null;
    if (!response.ok) {
      const detail = payload && typeof payload.detail === "string" ? payload.detail : `Request failed (${response.status}).`;
      throw new Error(detail);
    }
    return payload as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getInsights(universe: InsightUniverse, period: InsightPeriod): Promise<InsightsResponse> {
  const params = new URLSearchParams({ period: period.toLowerCase() });
  const payload = await jsonRequest<unknown>(`${API_BASE_URL}/insights/${encodeURIComponent(universe)}?${params.toString()}`);
  return normalizeInsightsPayload(payload, universe, period);
}

export function isInsightUniverse(value: string): value is InsightUniverse {
  return UNIVERSES.includes(value as InsightUniverse);
}
