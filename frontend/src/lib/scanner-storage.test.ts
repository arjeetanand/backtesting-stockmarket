import { describe, expect, it } from "vitest";
import {
  addScannerRecentRun,
  readScannerStorage,
  removeScannerPreset,
  SCANNER_STORAGE_KEY,
  upsertScannerPreset,
  writeScannerStorage,
} from "./scanner-storage";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

describe("scanner storage", () => {
  it("uses a versioned schema and ignores malformed or old data", () => {
    const target = storage();
    target.values.set(SCANNER_STORAGE_KEY, JSON.stringify({ version: 0, presets: [{ id: "old" }] }));
    expect(readScannerStorage(target)).toEqual({ version: 1, presets: [], recentRuns: [] });
  });

  it("upserts presets and keeps recent runs newest first", () => {
    const target = storage();
    let state = readScannerStorage(target);
    state = upsertScannerPreset(state, { id: "p1", name: "Trend", universe: "nifty50", formulaId: "sma", parameters: {}, start: "2024-01-01", end: "2024-02-01", updatedAt: "2024-02-02" });
    state = upsertScannerPreset(state, { id: "p1", name: "Renamed", universe: "nifty50", formulaId: "sma", parameters: {}, start: "2024-01-01", end: "2024-02-01", updatedAt: "2024-02-03" });
    state = addScannerRecentRun(state, { id: "r1", universe: "nifty50", formulaId: "sma", parameters: {}, matchCount: 2, dataAsOf: "2024-02-01", coverageStatus: "complete", start: "2024-01-01", end: "2024-02-01", createdAt: "2024-02-03" });
    writeScannerStorage(state, target);
    expect(readScannerStorage(target).presets[0].name).toBe("Renamed");
    expect(readScannerStorage(target).recentRuns[0].id).toBe("r1");
    expect(removeScannerPreset(state, "p1").presets).toHaveLength(0);
  });
});
