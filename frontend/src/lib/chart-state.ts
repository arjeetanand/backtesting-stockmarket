export type ChartViewState = "loading" | "error" | "unavailable" | "empty" | "ready";

export type ChartViewStateInput = {
  loading?: boolean;
  error?: string | Error | null;
  unavailable?: boolean;
  empty?: boolean;
  hasCandles: boolean;
};

/** Keeps chart state precedence explicit and consistent across research surfaces. */
export function getChartViewState(input: ChartViewStateInput): ChartViewState {
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (input.unavailable) return "unavailable";
  if (input.empty || !input.hasCandles) return "empty";
  return "ready";
}
