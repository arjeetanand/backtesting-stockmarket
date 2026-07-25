import { describe, expect, it } from "vitest";
import { getChartViewState } from "./chart-state";

describe("chart state precedence", () => {
  it.each([
    [{ loading: true, error: "late error", unavailable: true, empty: true, hasCandles: false }, "loading"],
    [{ error: "API unavailable", unavailable: true, hasCandles: true }, "error"],
    [{ unavailable: true, hasCandles: false }, "unavailable"],
    [{ empty: true, hasCandles: false }, "empty"],
    [{ hasCandles: true }, "ready"],
  ] as const)("returns %s for the supplied UI inputs", (input, expected) => {
    expect(getChartViewState(input)).toBe(expected);
  });
});

