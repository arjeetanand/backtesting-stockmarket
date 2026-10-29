import { describe, expect, it } from "vitest";
import { buildInsightPaperPlan, normalizeInsightsPayload, summarizeInsightVolume } from "./insights-api";

describe("normalizeInsightsPayload", () => {
  it("normalizes the scanner contract without inventing unavailable members", () => {
    const result = normalizeInsightsPayload({
      data_as_of: "2026-07-24",
      coverage_status: "partial",
      available_symbols: 2,
      missing_symbols: 1,
      total_symbols: 3,
      breadth: { gainers: 1, losers: 1, unchanged: 0, advances: 1, declines: 1 },
      members: [
        { symbol: "ABC", company_name: "ABC Ltd", sector: "Industrials", return_fraction: 0.025, data_as_of: "2026-07-24" },
        { symbol: "XYZ", company_name: "XYZ Ltd", sector: "Banks", return_fraction: -0.01, data_as_of: "2026-07-24" },
      ],
      sectors: [{ sector: "Industrials", return_fraction: 0.025, stock_count: 1, gainers: 1, losers: 0, unchanged: 0 }],
    }, "nifty50", "1D");

    expect(result.universe).toBe("nifty50");
    expect(result.period).toBe("1D");
    expect(result.coverageStatus).toBe("partial");
    expect(result.availableSymbols).toBe(2);
    expect(result.missingSymbols).toBe(1);
    expect(result.members[0]).toMatchObject({ symbol: "ABC", returnFraction: 0.025, available: true });
    expect(result.topMovers.map((item) => item.symbol)).toEqual(["ABC", "XYZ"]);
  });

  it("accepts percentage-shaped returns and reports empty data explicitly", () => {
    const result = normalizeInsightsPayload({
      universe: "sensex",
      period: "1M",
      return_status: "empty",
      members: [],
      missing_symbols: 30,
    });

    expect(result.universe).toBe("sensex");
    expect(result.period).toBe("1M");
    expect(result.coverageStatus).toBe("empty");
    expect(result.members).toEqual([]);
    expect(normalizeInsightsPayload({ members: [{ symbol: "ABC", return_pct: 2.5 }] }).members[0].returnFraction).toBe(0.025);
  });

  it("adapts the backend stocks response and list-shaped coverage fields", () => {
    const result = normalizeInsightsPayload({
      universe: "banknifty",
      period: "1d",
      result_status: "complete",
      coverage_status: "complete",
      freshness_status: "fresh",
      requested_members: 2,
      available_symbols: ["ABC", "XYZ"],
      missing_symbols: [],
      advancing: 1,
      declining: 1,
      unchanged: 0,
      stocks: [{ symbol: "ABC", company_name: "ABC Ltd", sector: "Banks", return_pct: 1.25, data_as_of: "2026-07-24" }],
      sectors: [{ sector: "Banks", stock_count: 1, average_return_pct: 1.25, advancing: 1, declining: 0, unchanged: 0 }],
    }, "banknifty", "1D");

    expect(result.coverageStatus).toBe("ready");
    expect(result.availableSymbols).toBe(2);
    expect(result.totalSymbols).toBe(2);
    expect(result.breadth).toMatchObject({ gainers: 1, losers: 1, advances: 1, declines: 1 });
    expect(result.members[0].returnFraction).toBe(0.0125);
    expect(result.sectors[0].returnFraction).toBe(0.0125);
  });

  it("treats backend *_pct fields as percentages even below one percent", () => {
    const result = normalizeInsightsPayload({ stocks: [{ symbol: "ITC", return_pct: 0.764 }] });
    expect(result.members[0].returnFraction).toBeCloseTo(0.00764);
  });
});

describe("selected stock volume and paper plan", () => {
  it("summarizes the latest five sessions and compares latest volume with the prior twenty", () => {
    const bars = Array.from({ length: 21 }, (_, index) => ({
      timestamp: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      symbol: "ABC",
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: index + 1,
    }));

    expect(summarizeInsightVolume(bars)).toEqual({
      latestVolume: 21,
      lastFiveVolume: 95,
      lastFiveSessions: 5,
      priorTwentyAverage: 10.5,
      relativeVolume: 2,
    });
  });

  it("uses the cached bar high and low for a conditional 2R plan and rejects a zero range", () => {
    const bar = {
      timestamp: "2026-10-29T00:00:00Z",
      symbol: "ABC",
      open: 109,
      high: 110.13,
      low: 108.1,
      close: 109.5,
      volume: 1_000,
    };

    expect(buildInsightPaperPlan(bar)).toEqual({
      dataAsOf: "2026-10-29",
      entryTrigger: 110.13,
      stopLevel: 108.1,
      target2R: 114.19,
      riskPerShare: 2.03,
    });
    expect(buildInsightPaperPlan({ ...bar, high: bar.low })).toBeNull();
  });
});
