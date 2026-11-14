import { describe, expect, it } from "vitest";
import { BODIES, buoyantRatio, buoyantSpeedRange, cabinBound, centripetal, coriolisFraction, d2BurnTime, diffusionTime, advectionTime, G0, normoxicFraction, PSI_TO_KPA } from "./scaling";

describe("closed-form physics check values", () => {
  it("11 rpm at 1.22 m gives lunar gravity", () => {
    expect(centripetal(11, 1.22)).toBeCloseTo(1.619, 3);
    expect(centripetal(11, 1.22) / G0).toBeCloseTo(0.165, 3);
  });
  it("buoyant speed ratios", () => {
    expect(buoyantRatio(BODIES.moon.g)).toBeCloseTo(0.548, 3);
    expect(buoyantRatio(BODIES.mars.g)).toBeCloseTo(0.724, 3);
  });
  it("buoyant flow ranges in cm/s", () => {
    const cm = (g: number) => buoyantSpeedRange(g).map((v) => +(v * 100).toFixed(1));
    expect(cm(1)).toEqual([10.3, 19.4]);
    expect(cm(0.38)).toEqual([7.4, 14.1]);
    expect(cm(0.165)).toEqual([5.6, 10.7]);
    expect(cm(0)).toEqual([0, 0]);
  });
  it("Coriolis fractions on the LUCI platform", () => {
    const f = (v: number) => +coriolisFraction(11, 1.22, v).toFixed(2);
    expect([0.05, 0.1, 0.2, 0.3, 0.5].map(f)).toEqual([0.07, 0.14, 0.28, 0.43, 0.71]);
  });
  it("normoxic curve", () => {
    expect(normoxicFraction(10.2 * PSI_TO_KPA)).toBeCloseTo(0.301, 3);
    expect(normoxicFraction(8.2 * PSI_TO_KPA)).toBeCloseTo(0.375, 3);
  });
  it("cabin bounds for a Saffire-scale fire", () => {
    const b = cabinBound(3.2, 60, 18);
    expect(b.o2Grams).toBeCloseTo(14.7, 1);
    expect(b.dT).toBeCloseTo(12.4, 1);
    expect(b.dPfrac).toBeCloseTo(0.042, 3);
  });
  it("transport time scales", () => {
    expect(advectionTime(3, 0.15)).toBeCloseTo(20, 6);
    expect(diffusionTime(1, 2e-5) / 3600).toBeCloseTo(6.94, 2);
    expect(diffusionTime(1, 1e-5) / 3600).toBeCloseTo(13.89, 2);
  });
  it("d-squared law", () => {
    expect(d2BurnTime(3, 0.5)).toBe(18);
    expect(d2BurnTime(4, 0.5)).toBe(32);
  });
});
