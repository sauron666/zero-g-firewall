import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { materialWords, names, nearestCsv, nearestRows } from "./nearest";
import type { EnvelopeDoc } from "./types";

const env: EnvelopeDoc = JSON.parse(readFileSync("public/data/v1/envelope.json", "utf8"));

describe("nearest tests to a design point", () => {
  it("agrees with the atmosphere map on how many rows are near each crew atmosphere", () => {
    for (const n of env.near_presets) expect(nearestRows(env, { x: n.x_o2, p: n.p_kpa, kind: null }).within).toBe(n.n_near);
  });
  it("orders by distance and never returns a row without pressure when a pressure is asked for", () => {
    const r = nearestRows(env, { x: 0.3, p: 70.33, kind: null }, 20);
    expect(r.rows.length).toBe(20);
    expect(r.rows.every((x) => x.pt.p != null)).toBe(true);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i].d).toBeGreaterThanOrEqual(r.rows[i - 1].d);
  });
  it("with oxygen alone, solid materials can be compared too", () => {
    const r = nearestRows(env, { x: 0.21, p: null, kind: "solid" }, 5);
    expect(r.pool).toBe(env.series.filter((s) => s.kind === "solid").reduce((a, s) => a + s.n, 0));
    expect(r.rows.every((x) => x.kind === "solid" && x.dp === null)).toBe(true);
  });
  it("finds rows by the material as NASA wrote it, and lists rows without pressure by oxygen alone, never as near", () => {
    const pmma = env.points.filter((p) => /pmma/i.test(p.f));
    const r = nearestRows(env, { x: 0.34, p: 56.54, kind: "solid", material: "PMMA" }, 500);
    expect(r.rows.length).toBe(pmma.length);
    expect(r.rows.every((x) => /pmma/i.test(x.pt.f) && x.byOxygen && x.dp === null)).toBe(true);
    expect([r.pool, r.within, r.byOxygen]).toEqual([0, 0, pmma.length]);
    for (let i = 1; i < r.rows.length; i++) expect(r.rows[i].d).toBeGreaterThanOrEqual(r.rows[i - 1].d);
    expect(nearestRows(env, { x: 0.34, p: 56.54, kind: null, material: "acrylic" }, 500).rows.length).toBe(pmma.length);       // the same material under its other name
    expect(names("PMMA & Nomex", materialWords("nomex"))).toBe(true);
    expect(names("Nomex natural", materialWords("PMMA"))).toBe(false);
    expect(names("anything", materialWords(""))).toBe(true);
  });
  it("carries the air flow of a row as NASA wrote it, and a speed only where the column states one", () => {
    const bass = env.points.find((p) => p.a === "PSI-25" && p.w)!;
    expect(bass.w).toMatch(/Fan display: /);
    expect(bass.v).toBeUndefined();
    const saffire = env.points.filter((p) => p.a === "PSI-99");
    expect(saffire.every((p) => p.v === 20 && /20 cm\/s/.test(p.w ?? ""))).toBe(true);
    expect(env.points.filter((p) => p.v != null).every((p) => p.w)).toBe(true);
    expect(env.unplaced!.rows.every((u) => u.f.trim() !== "" && !env.points.some((p) => p.t === u.t && p.r === u.r))).toBe(true);
  });
  it("writes one line for each row, with the source file and its hash", () => {
    const r = nearestRows(env, { x: 0.34, p: 56.54, kind: null }, 3);
    const files = new Map(r.rows.map((x) => [x.pt.t, { file: "a file, with a comma.csv", sha256: "abc", ledger_seq: 7 }]));
    const csv = nearestCsv(r.rows, { x: 0.34, p: 56.54, kind: null }, files).trim().split("\n");
    expect(csv.length).toBe(2 + 3);
    expect(csv[1].split(",").length).toBe(15);
    expect(csv[1]).toContain("air_flow_as_written,air_flow_cm_s,compared_by");
    expect(csv[2]).toContain('"a file, with a comma.csv"');
    expect(csv[2].endsWith(",abc,7")).toBe(true);
  });
});
