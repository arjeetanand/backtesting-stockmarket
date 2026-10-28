import { fetchWithTimeout } from "./api";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type StockResearchMetrics = {
  trades: number;
  signal_occurrences: number;
  wins: number;
  losses: number;
  flats: number;
  win_rate_pct: number;
  expectancy_pct: number;
  profit_factor: number | null;
  total_return_pct: number;
  max_drawdown_pct: number;
  active_bars: number;
  period_start: string | null;
  period_end: string | null;
  bars: number;
};

export type StockResearchResult = {
  run_id: string;
  symbol: string;
  company_name: string | null;
  run_status: "completed" | "insufficient_data" | "failed";
  message: string;
  data_source: string;
  data_as_of: string | null;
  history_start: string | null;
  bar_count: number;
  history_years: number;
  data_age_days: number | null;
  technical: {
    close: number;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    macd: number | null;
    macd_signal: number | null;
    macd_histogram: number | null;
    atr14: number | null;
    atr14_pct: number | null;
    prior20_high: number | null;
    prior20_low: number | null;
    high_52w: number;
    low_52w: number;
    volume_ratio_20: number | null;
    return_1m_pct: number | null;
    return_3m_pct: number | null;
    return_1y_pct: number | null;
    return_3y_pct: number | null;
  } | null;
  technical_reasons: string[];
  growth_note: string;
  setup: {
    status: "stale_data" | "triggered" | "watch" | "no_long_setup";
    direction: "long_only";
    signal_close: number;
    entry_trigger: number | null;
    stop_loss: number | null;
    target_1r: number | null;
    target_2r: number | null;
    risk_per_share: number | null;
    reasons: string[];
    exit_rules: string[];
    level_note: string;
  } | null;
  training_metrics: StockResearchMetrics | null;
  out_of_sample_metrics: StockResearchMetrics | null;
  validation_gate: {
    status: "passed" | "failed" | "not_evaluable";
    minimum_history_years: number;
    minimum_oos_trades: number;
    minimum_win_rate_pct: number;
    reasons: string[];
  };
  trades: Array<{
    signal_date: string;
    entry_date: string;
    exit_date: string;
    entry_price: number;
    exit_price: number;
    net_pnl: number;
    net_pnl_per_share: number;
    net_return_pct: number;
    outcome: "win" | "loss" | "flat";
    exit_reason: string;
    bars_held: number;
  }>;
  chart: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
  }>;
  cost_assumptions: {
    entry_slippage_pct: number;
    exit_slippage_pct: number;
    stt_pct_per_side: number;
    stamp_duty_pct_buy_side: number;
    sebi_turnover_fee_pct_per_side: number;
    excluded: string[];
  } | null;
  run_log: {
    run_id: string;
    status: "completed" | "insufficient_data" | "failed";
    started_at: string;
    finished_at: string;
    failure_reason: string | null;
  };
};

export type StockResearchHistory = {
  total_runs: number;
  completed_runs: number;
  failed_attempts: number;
  insufficient_data_runs: number;
  qualified_runs: number;
  failed_gates: number;
  not_evaluable_runs: number;
  runs: Array<{
    run_id: string;
    symbol: string;
    run_status: "completed" | "insufficient_data" | "failed";
    logged_at: string | null;
    data_as_of: string | null;
    signal_occurrences: number | null;
    trades: number;
    wins: number;
    losses: number;
    validation_status: "passed" | "failed" | "not_evaluable";
    failure_reason: string | null;
  }>;
};

export type StockResearchMorningScan = {
  scan_id: string;
  status: "completed";
  started_at: string;
  finished_at: string;
  universe: "NIFTY 50";
  universe_as_of: string;
  data_source: string;
  data_as_of: string | null;
  symbols_scanned: number;
  symbols_with_data: number;
  completed_runs: number;
  analysis_errors: number;
  insufficient_history: number;
  missing_data: number;
  passed_backtests: number;
  failed_backtests: number;
  not_evaluable: number;
  fresh_signals: number;
  qualifying_setups: number;
  candidates: Array<{
    run_id: string;
    symbol: string;
    company_name: string;
    data_as_of: string;
    history_years: number;
    technical: NonNullable<StockResearchResult["technical"]>;
    setup: NonNullable<StockResearchResult["setup"]>;
    out_of_sample_metrics: StockResearchMetrics;
  }>;
};

async function request<T>(path: string, init?: RequestInit, timeoutMs = 30_000): Promise<T> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, init, timeoutMs);
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const record = payload !== null && typeof payload === "object" ? payload as Record<string, unknown> : {};
    const detail = record.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status}).`);
  }
  return payload as T;
}

export function runStockResearch(symbol: string): Promise<StockResearchResult> {
  return request<StockResearchResult>("/stock-research/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol }),
  });
}

export function scanMorningStockResearch(): Promise<StockResearchMorningScan> {
  return request<StockResearchMorningScan>("/stock-research/morning-scan", { method: "POST" }, 120_000);
}

export function getStockResearchHistory(): Promise<StockResearchHistory> {
  return request<StockResearchHistory>("/stock-research/runs?limit=100");
}
