const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export type SensitivityCell = { lookback: number; threshold: number; sharpe_ratio: number; cagr: number; max_drawdown: number };
export type MonteCarloResult = { num_simulations: number; mean_return: number; percentile_5th: number; percentile_50th: number; percentile_95th: number; distribution_bins: Array<{ bin_start: number; bin_end: number; count: number }> };
export type StressScenario = { scenario: string; base_cagr: number; stressed_cagr: number; base_max_dd: number; stressed_max_dd: number; status: "PASS" | "FAIL" };
export type WalkForwardPoint = { period: number; in_sample_cagr: number; out_of_sample_cagr: number };
export type RobustnessReport = { run_id: string; aggregate_score: number; parameter_stability_score: number; oos_degradation_score: number; stress_resilience_score: number; sensitivity_grid: SensitivityCell[]; monte_carlo: MonteCarloResult; stress_tests: StressScenario[]; walk_forward: WalkForwardPoint[] };

export async function analyzeRobustness(input: { symbol: string; start: string; end: string; lookbackRange: number[]; thresholdRange: number[] }): Promise<RobustnessReport> {
  const response = await fetch(`${API_BASE_URL}/robustness/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: input.symbol, timeframe: "1day", start: `${input.start}T00:00:00`, end: `${input.end}T23:59:59`, lookback_range: input.lookbackRange, threshold_range: input.thresholdRange }),
  });
  const payload = await response.json().catch(() => null) as RobustnessReport | { detail?: string } | null;
  if (!response.ok) throw new Error(payload && "detail" in payload ? payload.detail ?? "Could not run robustness analysis." : "Could not run robustness analysis.");
  return payload as RobustnessReport;
}
