import { fetchWithTimeout } from "@/lib/api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type TimeMachineRequest = {
  symbol: string;
  entry_price?: number | null;
  risk_pct: number;
  target_r: number;
  max_hold_sessions: number;
  lookback_sessions: number;
  seed: number;
};

export type ScenarioOutcomes = {
  samples: number;
  stop_loss: number;
  target: number;
  time_exit: number;
  average_r: number;
  median_r: number;
  p05_exit_price: number;
  median_exit_price: number;
  p95_exit_price: number;
};

export type TimeMachineResult = {
  symbol: string;
  as_of_date: string;
  entry_price: number;
  stop_price: number;
  target_price: number;
  risk_per_share: number;
  risk_pct: number;
  target_r: number;
  max_hold_sessions: number;
  lookback_sessions: number;
  simulations: number;
  seed: number;
  source_sessions: number;
  data_start: string;
  data_end: string;
  monte_carlo: ScenarioOutcomes;
  historical_outcomes: ScenarioOutcomes;
};

export class TimeMachineApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "TimeMachineApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScenarioOutcomes(value: unknown): value is ScenarioOutcomes {
  if (!isRecord(value)) return false;
  return [
    "samples", "stop_loss", "target", "time_exit", "average_r", "median_r",
    "p05_exit_price", "median_exit_price", "p95_exit_price",
  ].every((field) => typeof value[field] === "number" && Number.isFinite(value[field]));
}

function isTimeMachineResult(value: unknown): value is TimeMachineResult {
  if (!isRecord(value)) return false;
  const textFields = ["symbol", "as_of_date", "data_start", "data_end"];
  const numberFields = [
    "entry_price", "stop_price", "target_price", "risk_per_share", "risk_pct", "target_r",
    "max_hold_sessions", "lookback_sessions", "simulations", "seed", "source_sessions",
  ];
  return textFields.every((field) => typeof value[field] === "string")
    && numberFields.every((field) => typeof value[field] === "number" && Number.isFinite(value[field]))
    && isScenarioOutcomes(value.monte_carlo)
    && isScenarioOutcomes(value.historical_outcomes);
}

function errorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const detail = payload.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item) => isRecord(item) && typeof item.msg === "string" ? [item.msg] : []);
    return messages.length ? messages.join("; ") : null;
  }
  return null;
}

export async function runTimeMachineScenario(request: TimeMachineRequest): Promise<TimeMachineResult> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/scenario-simulator/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }, 60_000);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TimeMachineApiError(errorMessage(payload) ?? "The local scenario simulator could not run.", response.status);
  }
  if (!isTimeMachineResult(payload)) {
    throw new TimeMachineApiError("The local scenario simulator returned an unexpected response.", response.status);
  }
  return payload;
}
