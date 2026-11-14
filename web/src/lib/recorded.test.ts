import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lastAt, momentAt, moments, nearest, signed, stepPath, utcAt } from "./recorded";
import type { RecordedDoc } from "./types";

const doc = JSON.parse(readFileSync(new URL("../../public/data/v1/recorded.json", import.meta.url), "utf8")) as RecordedDoc;

describe("the Saffire-III recording", () => {
  it("is on one clock that starts at the ignition of sample S1", () => {
    expect(doc.events.find((e) => e.id === "S1")?.t).toBe(0);
    expect(doc.series.t.length).toBe(doc.series.radiometers[0].length);
    expect(doc.series.t[0]).toBe(doc.window.from_t);
    expect(utcAt(doc, 0)).toBe(doc.zero.utc.slice(11, 19));
  });

  it("states peaks that are the highest readings it draws", () => {
    const sc = doc.detector.scatter, D = doc.derived.scatter;
    expect(Math.max(...sc.filter(([t]) => t >= 0).map(([, v]) => v))).toBe(D.fire.peak);
    const s2 = doc.events.find((e) => e.id === "S2")!.t;
    expect(Math.max(...sc.filter(([t]) => t >= D.wire.t && t < s2).map(([, v]) => v))).toBe(D.wire.peak);
    expect(D.fire.above_mark_s).toBeGreaterThan(D.wire.above_mark_s);
    for (const [k, r] of doc.derived.radiometers.entries()) {
      const after = doc.series.radiometers[k].filter((_, i) => doc.series.t[i] >= 0);
      expect(Math.max(...after)).toBe(r.peak);
    }
  });

  it("finds the reading that holds at a time", () => {
    const r: [number, number][] = [[0, 1], [10, 2], [20, 3]];
    expect(lastAt(r, -1)).toBe(-1);
    expect(lastAt(r, 0)).toBe(0);
    expect(lastAt(r, 19.9)).toBe(1);
    expect(lastAt(r, 99)).toBe(2);
    expect(nearest([0, 10, 20], 14)).toBe(1);
    expect(nearest([0, 10, 20], 16)).toBe(2);
    expect(signed(-322)).toBe("−322 s");
    expect(signed(72.4)).toBe("+72 s");
  });

  it("draws a step line that stops at the cursor", () => {
    const r: [number, number][] = [[0, 1], [10, 2], [20, 3]];
    const id = (x: number) => x;
    expect(stepPath(r, id, id, 15)).toBe("M0.0 1.0H10.0V2.0H15.0");
    expect(stepPath(r, id, id, -5)).toBe("");
  });

  it("tells the recording in order, with numbers from the file", () => {
    const ms = moments(doc);
    expect(ms.map((m) => m.t)).toEqual([...ms.map((m) => m.t)].sort((a, b) => a - b));
    expect(ms.filter((m) => m.kind === "event").length).toBe(doc.events.length);
    expect(ms.some((m) => m.text.includes(String(doc.derived.scatter.fire.peak)) && m.text.includes(String(doc.derived.scatter.wire.peak)))).toBe(true);
    expect(momentAt(ms, doc.window.from_t - 1)).toBeNull();
    expect(momentAt(ms, 0)?.text).toContain("sample S1");
    expect(ms.find((m) => m.text.includes("sample S1"))?.text).toContain("with the airflow");      // NASA's table: S1 concurrent, S2 opposed
    expect(ms.find((m) => m.text.includes("sample S2"))?.text).toContain("against the airflow");
  });
});
