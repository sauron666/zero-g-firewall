import { describe, expect, it } from "vitest";
import { elongation, OUT_AFTER, shape } from "./flame";

describe("the companion's flame", () => {
  it("CQ3: stretches with the cube root of gravity", () => {
    expect(elongation(0)).toBe(0);
    expect(elongation(1)).toBe(1);
    expect(elongation(0.1654)).toBeCloseTo(0.548, 2);          // Moon
    expect(elongation(0.3794)).toBeCloseTo(0.724, 2);          // Mars
  });

  it("CQ1: free fall, fans off: at least one oscillation, then out within the set time", () => {
    const samples = Array.from({ length: 200 }, (_, i) => shape(0, (i / 200) * OUT_AFTER));
    const signs = samples.map((s) => Math.sign(s.wobble)).filter((v) => v !== 0);
    const turns = signs.filter((v, i) => i > 0 && v !== signs[i - 1]).length;
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(samples.every((s) => !s.out)).toBe(true);
    expect(shape(0, OUT_AFTER)).toMatchObject({ out: true, strength: 0, halo: false });
    expect(shape(0, OUT_AFTER + 30).out).toBe(true);
  });

  it("CQ2: lunar gravity, fans off: stays alive under a question mark, however long", () => {
    for (const t of [0, 1, 5, 600]) {
      const s = shape(0.1654, t);
      expect(s.out).toBe(false);
      expect(s.strength).toBeGreaterThanOrEqual(0.6);
      expect(s.halo).toBe(true);
    }
  });

  it("partial gravity always carries the question mark, with the fans on too", () => {
    expect(shape(0.1654, null).halo).toBe(true);
    expect(shape(0.3794, null).halo).toBe(true);
    expect(shape(0, null).halo).toBe(false);
    expect(shape(1, null).halo).toBe(false);
  });
});
