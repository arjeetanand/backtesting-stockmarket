import { describe, expect, it } from "vitest";
import { canRunHistoricalTest, type ResearchReadiness } from "./research-flow";

const ready: ResearchReadiness = {
  hasProposal: true,
  reviewConfirmed: true,
  hasLocalData: true,
  supportedTimeframe: true,
  isBusy: false,
  importComplete: true,
};

describe("historical test review gate", () => {
  it("allows a run only after a reviewed proposal has local data", () => {
    expect(canRunHistoricalTest(ready)).toBe(true);
    expect(canRunHistoricalTest({ ...ready, reviewConfirmed: false })).toBe(false);
    expect(canRunHistoricalTest({ ...ready, hasProposal: false })).toBe(false);
    expect(canRunHistoricalTest({ ...ready, hasLocalData: false })).toBe(false);
  });

  it("blocks unsupported, busy, and incomplete import states", () => {
    expect(canRunHistoricalTest({ ...ready, supportedTimeframe: false })).toBe(false);
    expect(canRunHistoricalTest({ ...ready, isBusy: true })).toBe(false);
    expect(canRunHistoricalTest({ ...ready, importComplete: false })).toBe(false);
  });
});
