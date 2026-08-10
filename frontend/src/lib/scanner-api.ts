import { fetchWithTimeout } from "./api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type ScannerParameter = {
  id: string;
  label: string;
  type?: "number" | "text" | "select" | "boolean";
  default?: string | number | boolean;
  min?: number;
  max?: number;
  options?: Array<{ label: string; value: string | number }>;
};

export type ScannerFormula = {
  id: string;
  name: string;
  category: string;
  description: string;
  requiredFields: string[];
  parameters: ScannerParameter[];
  timeframe: string;
  status: string;
  strategyType?: string;
};

export type ScannerUniverse = {
  id: string;
  label: string;
  description: string;
  constituentCount: number | null;
  asOf: string | null;
};

export type ScannerMatch = {
  symbol: string;
  companyName: string;
  sector: string;
  score: number | null;
  reason: string;
  close: number | null;
  dataAsOf: string | null;
};

export type ScreenerRunResponse = {
  universe: string;
  formulaId: string;
  resultStatus: string;
  dataAsOf: string | null;
  coverageStatus: string;
  availableSymbols: number;
  missingSymbols: string[];
  matches: ScannerMatch[];
  totalMatches: number;
  raw: Record<string, unknown>;
};

export type HistoricalScanResponse = {
  universe: string;
  strategy_type: string;
  total_scanned: number;
  sectors_count: number;
  sector_heatmap: Array<{
    sector: string;
    stock_count: number;
    avg_strategy_return: number;
    avg_buy_hold_return: number;
    avg_win_rate: number;
    avg_max_drawdown: number;
    outperforming_count: number;
  }>;
  leaderboard: Array<{
    symbol: string;
    company_name: string;
    sector: string;
    bars: number;
    strategy_return: number;
    buy_hold_return: number;
    win_rate: number;
    max_drawdown: number;
    sharpe_ratio: number;
    trade_count: number;
  }>;
  data_as_of?: string | null;
  coverage_status?: string;
};

export type ScannerCatalogResponse = {
  formulas: ScannerFormula[];
  universes: ScannerUniverse[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  const record = asRecord(payload);
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeParameter(value: unknown, index: number): ScannerParameter {
  const item = asRecord(value);
  const rawType = String(item.type ?? "");
  const options = asArray(item.options).flatMap((option) => {
    const record = asRecord(option);
    const optionValue = record.value ?? record.id;
    if (typeof optionValue !== "string" && typeof optionValue !== "number") return [];
    return [{ label: asString(record.label, String(optionValue)), value: optionValue }];
  });
  return {
    id: asString(item.id ?? item.name, `parameter_${index + 1}`),
    label: asString(item.label ?? item.name, `Parameter ${index + 1}`),
    type: rawType === "integer" ? "number" : ["number", "text", "select", "boolean"].includes(rawType) ? rawType as ScannerParameter["type"] : undefined,
    default: typeof item.default === "string" || typeof item.default === "number" || typeof item.default === "boolean" ? item.default : undefined,
    min: asNumber(item.min ?? item.minimum) ?? undefined,
    max: asNumber(item.max ?? item.maximum) ?? undefined,
    options,
  };
}

export function normalizeScannerCatalog(payload: unknown): ScannerCatalogResponse {
  const record = asRecord(payload);
  const formulas = firstArray(payload, ["formulas", "screeners", "catalog", "items"]).map((value, index) => {
    const item = asRecord(value);
    return {
      id: asString(item.id ?? item.formula_id ?? item.strategy_type, `formula_${index + 1}`),
      name: asString(item.name ?? item.title ?? item.label, `Formula ${index + 1}`),
      category: asString(item.category ?? item.family, "Technical").replaceAll("_", " "),
      description: asString(item.description ?? item.summary, "Technical formula from the local screener catalog."),
      requiredFields: asArray(item.required_fields ?? item.requiredFields).filter((field): field is string => typeof field === "string"),
      parameters: asArray(item.parameters).map(normalizeParameter),
      timeframe: asString(item.timeframe ?? item.supported_timeframe, "1day"),
      status: asString(item.status ?? item.implementation_status, "supported"),
      strategyType: typeof item.strategy_type === "string" ? item.strategy_type : undefined,
    } satisfies ScannerFormula;
  });
  const universes = firstArray(record.universes ?? payload, ["universes", "indices", "items"]).map((value, index) => {
    const item = asRecord(value);
    const id = asString(item.id ?? item.key ?? item.universe ?? item.universe_id, `universe_${index + 1}`);
    return {
      id,
      label: asString(item.label ?? item.name, id.toUpperCase()),
      description: asString(item.description, "Configured local market universe."),
      constituentCount: asNumber(item.constituent_count ?? item.constituentCount ?? item.count),
      asOf: typeof (item.as_of ?? item.asOf) === "string" ? String(item.as_of ?? item.asOf) : null,
    } satisfies ScannerUniverse;
  });
  return { formulas, universes };
}

function normalizeMatch(value: unknown): ScannerMatch | null {
  const item = asRecord(value);
  const symbol = asString(item.symbol ?? item.ticker, "");
  if (!symbol) return null;
  return {
    symbol,
    companyName: asString(item.company_name ?? item.companyName ?? item.name, symbol),
    sector: asString(item.sector ?? item.industry, "Unclassified"),
    score: asNumber(item.score ?? item.conviction_score ?? item.rank_score),
    reason: asString(item.reason ?? item.explanation ?? item.description, "Matched the selected formula."),
    close: asNumber(item.close ?? item.latest_close ?? item.price),
    dataAsOf: typeof (item.data_as_of ?? item.dataAsOf ?? item.date) === "string" ? String(item.data_as_of ?? item.dataAsOf ?? item.date) : null,
  };
}

export function normalizeScreenerRun(payload: unknown, fallback: { universe: string; formulaId: string }): ScreenerRunResponse {
  const record = asRecord(payload);
  const matches = firstArray(payload, ["matches", "results", "signals", "candidates"])
    .map(normalizeMatch)
    .filter((item): item is ScannerMatch => item !== null);
  const missing = asArray(record.missing_symbols ?? record.missingSymbols).filter((symbol): symbol is string => typeof symbol === "string");
  const availableValue = record.available_symbols ?? record.availableSymbols;
  const availableSymbols = Array.isArray(availableValue) ? availableValue.length : asNumber(availableValue ?? record.total_scanned) ?? matches.length;
  return {
    universe: asString(record.universe, fallback.universe),
    formulaId: asString(record.formula_id ?? record.formulaId, fallback.formulaId),
    resultStatus: asString(record.result_status ?? record.status, matches.length ? "complete" : "empty"),
    dataAsOf: typeof (record.data_as_of ?? record.dataAsOf ?? record.latest_data_date) === "string" ? String(record.data_as_of ?? record.dataAsOf ?? record.latest_data_date) : null,
    coverageStatus: asString(record.coverage_status ?? record.coverage, missing.length ? "partial" : "complete"),
    availableSymbols,
    missingSymbols: missing,
    matches,
    totalMatches: asNumber(record.total_matches ?? record.totalMatches ?? record.total_candidates) ?? matches.length,
    raw: record,
  };
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function assertOk(response: Response, fallback: string): Promise<unknown> {
  const payload = await readJson(response);
  if (!response.ok) {
    const detail = asRecord(payload).detail;
    throw new Error(typeof detail === "string" ? detail : fallback);
  }
  return payload;
}

export async function getScannerCatalog(): Promise<ScannerCatalogResponse> {
  const [catalogResponse, universeResponse] = await Promise.all([
    fetchWithTimeout(`${API_BASE_URL}/screeners/catalog`),
    fetchWithTimeout(`${API_BASE_URL}/screeners/universes`),
  ]);
  const catalogPayload = await assertOk(catalogResponse, "Could not load the screener formula catalog.");
  const universePayload = await assertOk(universeResponse, "Could not load the configured market universes.");
  const catalog = normalizeScannerCatalog(catalogPayload);
  const universes = normalizeScannerCatalog({ universes: firstArray(universePayload, ["universes", "indices", "items"]) }).universes;
  return { formulas: catalog.formulas, universes };
}

export async function runScreenerScan(config: { universe: string; formulaId: string; parameters?: Record<string, string | number | boolean>; start?: string; end?: string }): Promise<ScreenerRunResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/screeners/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      universe: config.universe,
      formula_id: config.formulaId,
      parameters: config.parameters ?? {},
      ...(config.start ? { start: `${config.start}T00:00:00` } : {}),
      ...(config.end ? { as_of: config.end } : {}),
    }),
  }, 60_000);
  return normalizeScreenerRun(await assertOk(response, "Could not run the selected screener formula."), { universe: config.universe, formulaId: config.formulaId });
}

export async function runHistoricalScan(config: { universe: string; strategyType: string; start: string; end: string }): Promise<HistoricalScanResponse> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/market-scanner/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ universe: config.universe, strategy_type: config.strategyType, start: `${config.start}T00:00:00`, end: `${config.end}T23:59:59` }),
  }, 60_000);
  return await assertOk(response, "Could not run the historical research scan.") as HistoricalScanResponse;
}

export async function runBreakoutScan(config: { minConviction: number }): Promise<{ total_candidates: number; setups: Array<Record<string, unknown>> }> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/breakout-scanner/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ min_conviction: config.minConviction, limit: 60 }),
  }, 60_000);
  return await assertOk(response, "Could not scan breakout setups.") as { total_candidates: number; setups: Array<Record<string, unknown>> };
}

export function scannerApiErrorMessage(error: unknown, timeoutMessage: string, fallback: string): string {
  if (error instanceof DOMException && error.name === "AbortError") return timeoutMessage;
  if (error instanceof TypeError && error.message === "Failed to fetch") return "Local Backtrack API is unavailable. Start the backend on port 8000, then retry.";
  return error instanceof Error ? error.message : fallback;
}
