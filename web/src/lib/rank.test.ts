import { describe, expect, it } from "vitest";
import { comparability, normalise, rankAll, stability } from "./rank";
import type { RankDoc, RankItem } from "./types";

const item = (accession: string, a: number, b: number, lensA = 0): RankItem => ({
  accession, acronym: "", title: accession, gravity: "micro", kind: "solid", rows: 1, facets: { pillars: [], oxygen: false, pressure: false, flow: false, outcome: false },
  shared: { a: { score: a, why: "" }, b: { score: b, why: "" } }, by_lens: { L: { c: { score: lensA, why: "" } }, M: { c: { score: 1 - lensA, why: "" } } },
});
const doc: RankDoc = {
  klass: "derived", note: "", near_rule: "", facet_rules: { pillars: {}, oxygen: "", pressure: "", flow: "", outcome: "" }, factors: [{ id: "a", label: "A", rule: "" }, { id: "b", label: "B", rule: "" }, { id: "c", label: "C", rule: "" }],
  lenses: [], items: [item("PSI-1", 1, 1, 1), item("PSI-2", 0.5, 0.5, 0.5), item("PSI-3", 0.9, 0.1, 0), item("PSI-4", 0.1, 0.9, 0)],
};

describe("ranking", () => {
  it("normalises weights and ignores negative ones", () => {
    expect(normalise({ a: 2, b: 2, c: -1 })).toEqual({ a: 0.5, b: 0.5, c: 0 });
  });
  it("scores are weighted sums between 0 and 1, and contributions add up to the total", () => {
    const r = rankAll(doc, "L", { a: 1, b: 1, c: 2 });
    for (const x of r) {
      expect(x.total).toBeGreaterThanOrEqual(0);
      expect(x.total).toBeLessThanOrEqual(1);
      expect(x.parts.reduce((s, p) => s + p.contribution, 0)).toBeCloseTo(x.total, 12);
    }
    expect(r.map((x) => x.item.accession)).toEqual(["PSI-1", "PSI-2", "PSI-3", "PSI-4"]);
  });
  it("the mission changes the order through the factors that depend on it", () => {
    expect(rankAll(doc, "M", { a: 0, b: 0, c: 1 })[0].item.accession).toBe("PSI-3");
  });
  it("a record that is at least as good on every factor is never ranked below, under any weights", () => {
    const s = stability(doc, "L", { a: 1, b: 1, c: 1 }, 300, 1);
    expect(s.get("PSI-1")!.top).toBe(1);
    expect(s.get("PSI-1")!.worst).toBe(1);
    expect(s.get("PSI-2")!.best).toBeGreaterThan(1);
  });
  it("is reproducible from its seed, and shows when the order depends on the weights", () => {
    const a = stability(doc, "L", { a: 1, b: 1, c: 0 }, 400, 3, 7);
    const b = stability(doc, "L", { a: 1, b: 1, c: 0 }, 400, 3, 7);
    expect(a.get("PSI-3")).toEqual(b.get("PSI-3"));
    expect(a.get("PSI-3")!.top + a.get("PSI-4")!.top).toBeCloseTo(1, 12);      // they trade the third place
    expect(a.get("PSI-3")!.top).toBeGreaterThan(0.2);
    expect(a.get("PSI-3")!.top).toBeLessThan(0.8);
  });
});

describe("comparability", () => {
  const rec = (acronym: string, over: Partial<RankItem> = {}): RankItem => ({ ...item(acronym, 0, 0), acronym, family: "MSG", hardware: "Microgravity Science Glovebox", ...over });
  const on = { pillars: [], oxygen: true, pressure: true, flow: true, outcome: true };
  it("says nothing about one record and nothing alarming about two of a kind", () => {
    expect(comparability([rec("A")])).toEqual([]);
    const c = comparability([rec("A"), rec("B")]);
    expect(c.filter((x) => x.level === "warn")).toEqual([]);
    expect(c[0].text).toMatch(/^Same hardware family \(Microgravity Science Glovebox\)/);
  });
  it("names each difference that makes numbers incomparable", () => {
    const c = comparability([rec("BASS-II", { facets: on }), rec("FLEX", { kind: "droplet", family: "CIR_MDCA" }), rec("Tower", { gravity: "ground", rows: 0, family: "GROUND" })]).map((x) => x.text);
    expect(c[0]).toBe("Different things burn: BASS-II and Tower (solid materials); FLEX (liquid droplets). A value of one is not on the scale of the other.");
    expect(c[1]).toMatch(/^Tower is ground work at 1 g; BASS-II and FLEX were taken in free fall\./);
    expect(c).toContain("The table of FLEX and Tower does not state oxygen; BASS-II does.");
    expect(c).toContain("Tower has no experimental table in PSI, so its factors rest on the record's text alone.");
    expect(c[c.length - 1]).toMatch(/^Different hardware/);
  });
});
