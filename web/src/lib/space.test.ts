import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLOORS, HALF_D, HALF_W, floorY, layoutSpace, xOf, zOf } from "./space";
import type { EnvelopeDoc, ReportedDoc } from "./types";

const load = <T,>(n: string) => JSON.parse(readFileSync(`public/data/v1/${n}`, "utf8")) as T;
const env = load<EnvelopeDoc>("envelope.json"), rep = load<ReportedDoc>("reported.json");

describe("the atmosphere map in three dimensions", () => {
  const s = layoutSpace(env, rep);
  it("draws every row once, on the free-fall floor, and none on the Moon or Mars", () => {
    expect(s.placed.length / 3 + s.rail.length / 3).toBe(env.points.length);
    expect(s.placed.length / 3).toBe(env.points.filter((p) => p.p != null).length);
    for (let i = 1; i < s.placed.length; i += 3) expect(s.placed[i]).toBe(floorY("micro"));
    expect(s.counts).toEqual({ micro: env.gravity_counts.micro, lunar: env.gravity_counts.partial, mars: env.gravity_counts.partial });
    expect(env.gravity_counts.micro).toBe(env.points.length);
  });
  it("keeps every mark inside its floor, and the planned Moon tests as marks apart from the rows", () => {
    for (let i = 0; i < s.placed.length; i += 3) { expect(Math.abs(s.placed[i])).toBeLessThanOrEqual(HALF_W + 1e-9); expect(Math.abs(s.placed[i + 2])).toBeLessThanOrEqual(HALF_D + 1e-9); }
    expect(s.planned.length).toBe(rep.fm2.tests.length);
    expect(s.planned.every((p) => p.y === floorY("lunar"))).toBe(true);
    expect(s.poles.map((p) => p.label)).toEqual(env.near_presets.map((n) => n.label));
    expect(FLOORS.map(floorY)).toEqual([...FLOORS.map(floorY)].sort((a, b) => a - b));
    expect(xOf(0.1)).toBeCloseTo(-HALF_W); expect(xOf(1)).toBeCloseTo(HALF_W); expect(zOf(0)).toBeCloseTo(HALF_D);
  });
});
