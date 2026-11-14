import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nearestCsv, nearestRows } from "./nearest";
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
  it("writes one line for each row, with the source file and its hash", () => {
    const r = nearestRows(env, { x: 0.34, p: 56.54, kind: null }, 3);
    const files = new Map(r.rows.map((x) => [x.pt.t, { file: "a file, with a comma.csv", sha256: "abc", ledger_seq: 7 }]));
    const csv = nearestCsv(r.rows, { x: 0.34, p: 56.54, kind: null }, files).trim().split("\n");
    expect(csv.length).toBe(2 + 3);
    expect(csv[1].split(",").length).toBe(12);
    expect(csv[2]).toContain('"a file, with a comma.csv"');
    expect(csv[2].endsWith(",abc,7")).toBe(true);
  });
});
