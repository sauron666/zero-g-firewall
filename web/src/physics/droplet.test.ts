import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DropletDoc, DropletPoint } from "../lib/types";
import { d2Time, diameterAt, ratesNear, testedLevels } from "./droplet";

const pt = (over: Partial<DropletPoint>): DropletPoint => ({ r: 0, f: "Methanol", x: 0.21, p: 101.3, dil: "", d0: 2, de: 1, k: 0.5, tb: 6, end: "Extinction", ...over });

describe("d-squared law", () => {
  it("the squared diameter falls in a straight line and never below zero", () => {
    expect(diameterAt(2, 0.5, 0)).toBe(2);
    expect(diameterAt(2, 0.5, 6) ** 2).toBeCloseTo(1, 12);
    expect(diameterAt(2, 0.5, 8)).toBe(0);
    expect(diameterAt(2, 0.5, 99)).toBe(0);
    expect(d2Time(2, 1, 0.5)).toBeCloseTo(6, 12);
  });
  it("takes rates only from tests of that fuel, near that oxygen, in oxygen and nitrogen", () => {
    const pts = [pt({ r: 1, k: 0.4 }), pt({ r: 2, k: 0.6, x: 0.22 }), pt({ r: 3, k: 0.9, dil: "helium" }), pt({ r: 4, k: 0.8, f: "Heptane" }), pt({ r: 5, k: 0.7, x: 0.3 }), pt({ r: 6, k: null })];
    expect(ratesNear(pts, "Methanol", 21)).toEqual({ n: 2, lo: 0.4, hi: 0.6, median: 0.5, rows: [1, 2] });
    expect(ratesNear(pts, "Methanol", 26)).toBeNull();
    expect(testedLevels(pts, "Methanol")).toEqual([21, 22, 30]);
  });
});

describe("droplet check on the shipped artifact", () => {
  const d: DropletDoc = JSON.parse(readFileSync("public/data/v1/droplets.json", "utf8"));
  it("every checked row follows from its own four cells", () => {
    const checked = d.points.filter((p) => p.td != null);
    expect(checked.length).toBe(d.n_usable);
    for (const p of checked) expect(d2Time(p.d0 as number, p.de as number, p.k as number)).toBeCloseTo(p.td as number, 2);
  });
  it("counts add up to every row of NASA's table", () => {
    expect(d.points.length).toBe(d.n_rows);
    expect(d.n_usable + d.not_usable.reduce((a, x) => a + x.rows, 0)).toBe(d.n_rows);
    expect(d.within["10"]).toBeLessThanOrEqual(d.within["20"]);
    expect(d.by_fuel.reduce((a, g) => a + g.n, 0)).toBe(d.n_usable);
  });
});
