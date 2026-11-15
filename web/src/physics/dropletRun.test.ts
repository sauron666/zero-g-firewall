import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dropletAt, dropletRun, lawTime } from "./dropletRun";
import { createClock } from "../lab/clock";

const drops = JSON.parse(readFileSync(new URL("../../public/data/v1/droplets.json", import.meta.url), "utf8"));

describe("droplet case for the Fire Lab", () => {
  it("ends the visible flame at (D0² − Dext²)/K for a recorded case, not at D0²/K", () => {
    const p = drops.points.find((x: { td?: number }) => x.td != null);
    const c = { id: "r", label: "", fuel: p.f, d0: p.d0, k: p.k, de: p.de, tb: p.tb, klass: "observed" as const };
    const s = dropletAt(c, 0);
    expect(s.tFlameEnd).toBeCloseTo(lawTime(p.d0, p.de, p.k), 9);
    expect(s.tFlameEnd).toBeCloseTo(p.td, 2);                               // the same number droplets.json stores
    expect(s.tLawZero).toBeCloseTo((p.d0 * p.d0) / p.k, 9);
    const after = dropletAt(c, s.tFlameEnd + 0.01);
    expect(after.phase).toBe("extinct_recorded");
    expect(after.d).toBe(p.de);
    expect(after.flame).toBe(false);
  });
  it("a model case without Dext ends at the mathematical zero and says so", () => {
    const c = { id: "m", label: "", fuel: "Methanol", d0: 2, k: 0.5, de: null, tb: null, klass: "model" as const };
    expect(dropletAt(c, 7.99).flame).toBe(true);
    expect(dropletAt(c, 8.01).phase).toBe("law_zero");
    expect(dropletAt(c, 8.01).d).toBe(0);
  });
  it("the run, the scene and the chart read the same state", () => {
    const c = { id: "m", label: "", fuel: "Methanol", d0: 2, k: 0.5, de: 0.8, tb: 7, klass: "observed" as const };
    const run = dropletRun(c, 40);
    run.t.forEach((t, i) => expect(run.series.d2_mm2[i]).toBeCloseTo(dropletAt(c, t).d2, 12));
    expect(run.kind).toBe("LabRun");
  });
  it("rejects K or D0 that cannot be a droplet", () => {
    expect(() => dropletAt({ id: "x", label: "", fuel: "", d0: 2, k: 0, de: null, tb: null, klass: "model" }, 1)).toThrow();
  });
});

describe("lab clock", () => {
  it("advances only while playing, clamps to its span and resets to zero", () => {
    const c = createClock(10);
    c.tick(1); expect(c.get()).toBe(0);
    c.play(); c.tick(2.5); expect(c.get()).toBe(2.5);
    c.tick(100); expect(c.get()).toBe(10); expect(c.playing()).toBe(false);
    c.reset(); expect(c.get()).toBe(0);
    let seen = -1; const off = c.on((t) => (seen = t)); c.set(4); expect(seen).toBe(4); off();
  });
});
