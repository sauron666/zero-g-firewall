import { describe, expect, it } from "vitest";
import { defaultParams, runEnsemble, simulate } from "./paradox";

describe("the fan paradox scenarios", () => {
  it("with the fans off nothing leaves the cabin: emitted = airborne", () => {
    const p = { ...defaultParams(0), branch: "selffed" as const, horizon: 120, coarse: true };
    const r = simulate(p, 0);
    const last = r.t.length - 1;
    expect(r.airborne[last]).toBeCloseTo(r.emitted[last], 3);
    expect(r.removed[last]).toBeCloseTo(0, 3);
  });
  it("free fall: fans on carries smoke to the duct detector; fans off does not within ten minutes", () => {
    const p = defaultParams(0);
    const a = simulate(p, Infinity), b = simulate({ ...p, branch: "selffed" }, 0);
    console.log("ISS  A alarms", a.alarm, "peak", a.peak.toFixed(1), "| B(selffed, off from 0) alarms", b.alarm, "peak", b.peak.toFixed(1), "dose A/B", a.crewDose.toFixed(1), b.crewDose.toFixed(1));
    expect(a.alarm.duct).not.toBeNull();
    expect(a.alarm.duct!).toBeGreaterThan(15);
    expect(a.alarm.duct!).toBeLessThan(180);
    expect(b.alarm.duct).toBeNull();
  });
  it("Moon: with the fans off a buoyant plume still reaches the overhead detector", () => {
    const p = defaultParams(0.165);
    const a = simulate(p, Infinity), b = simulate(p, 0);
    console.log("Moon A alarms", a.alarm, "| B(buoyant, off from 0) alarms", b.alarm, "plume", p.plumeSpeed.toFixed(3));
    expect(b.alarm.overhead).not.toBeNull();
    expect(b.alarm.overhead!).toBeLessThan(120);
  });
  it("a starved flame stops emitting", () => {
    const p = { ...defaultParams(0), branch: "starved" as const, horizon: 200, coarse: true };
    const b = simulate(p, 20);
    expect(b.sourceRate[19]).toBe(1);
    expect(b.sourceRate[199]).toBeLessThan(1e-6);
  });
  it("the ensemble reports ranges and the share that never alarms", () => {
    const t0 = Date.now();
    const e = runEnsemble({ ...defaultParams(0), switchTime: 60 });
    console.log("ensemble ISS:", e.members.length, "members in", Date.now() - t0, "ms", JSON.stringify(e.summary));
    expect(e.members.length).toBeGreaterThan(20);
    expect(e.summary.duct.never).toBeGreaterThanOrEqual(0);
    const em = runEnsemble({ ...defaultParams(0.165), switchTime: 60 });
    console.log("ensemble Moon:", em.members.length, JSON.stringify(em.summary), JSON.stringify(em.byBranch));
  });
});
