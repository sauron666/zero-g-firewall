import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { briefCsv, briefMarkdown, collect, match, o2Range, parseGeometry, rankEvidence } from "./pmma";
import { defaultScenario, ScenarioState } from "./scenario";

const load = (n: string) => JSON.parse(readFileSync(new URL(`../../public/data/v1/${n}`, import.meta.url), "utf8"));
const rep = load("reported.json");
const bass2 = load("tables/PSI-25__PSI_25_Experimental_table_BASS_II.json");
const saffire2 = load("tables/PSI-99__PSI_99_Experimental_table_SAFFIRE_2.json");
const bass = load("tables/PSI-26__PSI_26_Experimental_table_BASS.json");
const cands = collect({ bass2, saffire2, bass }, rep);
const vi3: ScenarioState = { ...defaultScenario(), material: "PMMA", form: "sheet", o2: 0.303, p_kpa: 54.6, u_m_s: 0.2, g: 0 };

describe("PMMA evidence from the shipped artifacts", () => {
  it("reads Saffire VI-3 and VI-4 from reported.json, not typed values", () => {
    const v3 = cands.find((c) => c.id === "Saffire VI-3")!, v4 = cands.find((c) => c.id === "Saffire VI-4")!;
    expect(v3.cond.o2?.lo).toBeCloseTo(0.303, 6); expect(v3.cond.p_kpa).toBe(54.6); expect(v3.cond.u_m_s).toBeCloseTo(0.2, 6);
    expect(v4.cond.o2?.lo).toBeCloseTo(0.288, 6); expect(v4.cond.p_kpa).toBe(55.2);
    expect(v3.cond.sides).toBe("2-sided"); expect(v4.cond.sides).toBe("1-sided");
    expect((v3.source.ref as { page_pdf: number }).page_pdf).toBe(3);
  });
  it("finds BASS-II, Saffire-II and LUCI PMMA records", () => {
    expect(cands.filter((c) => c.record === "PSI-25 BASS-II").length).toBeGreaterThan(30);
    expect(cands.some((c) => c.id === "LUCI acrylic rod")).toBe(true);
    expect(cands.some((c) => c.id.startsWith("Saffire-II"))).toBe(true);
  });
  it("AC02: Saffire VI-3's own conditions give a joint match with VI-3 first", () => {
    const r = rankEvidence(cands, vi3);
    expect(r[0].id).toBe("Saffire VI-3");
    expect(r[0].joint).toBe(true);
    expect(r[0].role).toBe("direct");
  });
  it("changing a condition changes the comparison", () => {
    const a = rankEvidence(cands, vi3), b = rankEvidence(cands, { ...vi3, o2: 0.21 });
    expect(b[0].joint).toBe(false);
    expect(a.map((m) => m.id).slice(0, 3)).not.toEqual(b.map((m) => m.id).slice(0, 3));
  });
});

describe("AC03: no false joint match", () => {
  it("an unreported pressure is never a match", () => {
    const m = match(cands.find((c) => c.record === "PSI-25 BASS-II")!, { ...vi3, o2: 0.222 });
    const p = m.checks.find((c) => c.dim === "p_kpa")!;
    expect(p.status).toBe("not_reported");
    expect(m.joint).toBe(false);
  });
  it("oxygen that fell during a test is at best near", () => {
    const luci = cands.find((c) => c.id === "LUCI acrylic rod")!;
    expect(luci.cond.o2?.varying).toBe(true);
    const m = match(luci, { ...vi3, form: "rod", o2: 0.17, g: 0.165 });
    expect(m.checks.find((c) => c.dim === "o2")!.status).toBe("near");
    expect(m.joint).toBe(false);
  });
  it("conditions met by two different tests do not combine into one", () => {
    // VI-3 has the pressure, BASS-II rows have 22.2% oxygen: asking both together matches neither jointly
    const r = rankEvidence(cands, { ...vi3, o2: 0.222 });
    expect(r.every((m) => !m.joint)).toBe(true);
  });
});

describe("AC04: a lunar target", () => {
  it("shows differences and no joint match; the lunar record is mechanistic, not direct", () => {
    const r = rankEvidence(cands, { ...vi3, o2: 0.34, p_kpa: 56.5, u_m_s: 0.1, g: 0.165 });
    expect(r.some((m) => m.joint)).toBe(false);
    const luci = r.find((m) => m.id === "LUCI acrylic rod")!;
    expect(luci.checks.find((c) => c.dim === "g")!.status).toBe("match");
    expect(luci.checks.find((c) => c.dim === "form")!.status).toBe("different");
    expect(r.find((m) => m.id === "Saffire VI-3")!.checks.find((c) => c.dim === "g")!.status).toBe("different");
  });
});

describe("parsers and exports", () => {
  it("parses geometry from NASA's free text", () => {
    expect(parseGeometry("100 micron PMMA film   2 cm wide")).toEqual({ form: "sheet", thickness_mm: 0.1, sides: null });
    expect(parseGeometry('1/2" clear PMMA rod').form).toBe("rod");
    expect(parseGeometry('1/2" clear PMMA rod').thickness_mm).toBeCloseTo(12.7, 6);
    expect(parseGeometry("PMMA sphere 2 cm").form).toBe("sphere");
    expect(parseGeometry("PMMA 2 cm").form).toBe("unknown");
    expect(parseGeometry("3 mm thick PMMA   2 sided").sides).toBe("2-sided");
  });
  it("treats a final oxygen of zero or none as not stated", () => {
    expect(o2Range(22.2, null)?.varying).toBe(false);
    expect(o2Range(21, 20.5)).toEqual({ lo: 0.205, hi: 0.21, varying: true });
  });
  it("AC18: the brief and CSV carry the same values as the match", () => {
    const r = rankEvidence(cands, vi3);
    const md = briefMarkdown(vi3, r, { url: "x", ledger_head: "abc" });
    expect(md).toContain("Saffire VI-3");
    expect(md).toContain("30.3%");
    expect(md).toContain("54.6 kPa");
    expect(md).toContain("ICES-2024-365");
    const csv = briefCsv(vi3, r);
    expect(csv.split("\n")[2]).toMatch(/^Saffire VI-3,literature,direct,true/);
  });
});
