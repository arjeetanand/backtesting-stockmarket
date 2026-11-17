import { fetchWithTimeout } from "./api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type TrackedPrediction = {
  prediction_id: string;
  source_run_id: string;
  symbol: string;
  recorded_at: string;
  data_as_of: string;
  tracking_start_after: string;
  horizon_sessions: number;
  setup_status: "watch" | "triggered";
  signal_close: number;
  entry_trigger: number;
  entry_trigger_state: "triggered_at_signal" | "reached_after_signal" | "not_reached_yet" | "not_reached_in_window";
  entry_trigger_date: string | null;
  stop_loss: number;
  target_2r: number;
  reasons: string[];
  validation_status: "passed" | "failed" | "not_evaluable";
  validation_reasons: string[];
  status: "pending" | "completed";
  observed_sessions: number;
  evaluated_through: string | null;
  forward_return_pct: number | null;
  max_favorable_move_pct: number | null;
  max_adverse_move_pct: number | null;
  touch_state: "no_touch" | "target_hit" | "stop_hit" | "ambiguous_touch";
  touch_date: string | null;
  path_summary: string;
};

export async function getTrackedPredictions(): Promise<TrackedPrediction[]> {
  const response = await fetchWithTimeout(`${API_BASE_URL}/stock-research/predictions?limit=50`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Could not load saved setup tracking.");
  if (body === null || typeof body !== "object" || !Array.isArray((body as { predictions?: unknown }).predictions)) {
    throw new Error("The local API returned an invalid setup-tracking response.");
  }
  return (body as { predictions: TrackedPrediction[] }).predictions;
}
