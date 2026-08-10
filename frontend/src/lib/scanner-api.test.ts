import { describe, expect, it } from "vitest";
import { normalizeScannerCatalog, normalizeScreenerRun } from "./scanner-api";

describe("scanner API adapters", () => {
  it("accepts catalog and universe payloads from the planned contract", () => {
    const catalog = normalizeScannerCatalog({
      formulas: [{ formula_id: "rsi_oversold", title: "RSI oversold", category: "momentum", parameters: [{ name: "threshold", type: "number", default: 30, minimum: 5, maximum: 50 }] }],
      universes: [{ universe_id: "banknifty", name: "Bank Nifty", constituent_count: 12, as_of: "2026-07-24" }],
    });
    expect(catalog.formulas[0].name).toBe("RSI oversold");
    expect(catalog.formulas[0].parameters[0].default).toBe(30);
    expect(catalog.formulas[0].parameters[0].min).toBe(5);
    expect(catalog.universes[0].label).toBe("Bank Nifty");
    expect(catalog.universes[0].constituentCount).toBe(12);
  });

  it("normalizes matches and makes missing local data explicit", () => {
    const result = normalizeScreenerRun({
      formula_id: "rsi_oversold",
      universe: "nifty50",
      result_status: "partial",
      data_as_of: "2026-07-24",
      coverage_status: "partial",
      available_symbols: 42,
      missing_symbols: ["MISSING"],
      matches: [{ symbol: "TCS", company_name: "Tata Consultancy Services", sector: "IT", score: 88.5, reason: "RSI below threshold", close: 3500 }],
    }, { universe: "nifty50", formulaId: "rsi_oversold" });
    expect(result.matches[0]).toMatchObject({ symbol: "TCS", score: 88.5, close: 3500 });
    expect(result.missingSymbols).toEqual(["MISSING"]);
    expect(result.coverageStatus).toBe("partial");
  });
});
