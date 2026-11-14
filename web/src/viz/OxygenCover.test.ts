import { describe, expect, it } from "vitest";
import type { CoverageBlock } from "../lib/types";
import { coverColumns, coverStep, pc } from "./OxygenCover";

const block = (cells: CoverageBlock["cells"]): CoverageBlock => ({
  klass: "derived", rule: "", axis: { lo: 10, hi: 42, unit: "oxygen, percent by volume" }, kinds: [], cells, regimes: [], atmospheres: [], placed: 0, total: 0, top: 0, not_placed: [],
});

describe("oxygen coverage", () => {
  it("draws zero as its own state, never as the palest step", () => {
    expect([0, 1, 4, 5, 19, 20, 49, 50, 117].map(coverStep)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("keeps one column for each whole percent of the axis", () => {
    const c = coverColumns(block({ solid: { "14": { n: 3, records: { "PSI-25": 3 } } } }));
    expect([c.cols[0], c.cols[c.cols.length - 1], c.cols.length]).toEqual([10, 42, 33]);
    expect(c.above("solid")).toBe(0);
  });
  it("widens downward for a row below the axis and counts rows above it in the last stretch", () => {
    const c = coverColumns(block({ gas: { "8": { n: 1, records: { A: 1 } }, "60": { n: 2, records: { A: 2 } }, "85": { n: 1, records: { B: 1 } } } }));
    expect(c.lo).toBe(8);
    expect(c.above("gas")).toBe(3);
  });
  it("writes a fraction as a percent without a trailing zero", () => {
    expect([pc(0.222), pc(0.4), pc(0.136), pc(null)]).toEqual(["22.2%", "40%", "13.6%", ""]);
  });
});
