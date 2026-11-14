import { beforeAll, describe, expect, it } from "vitest";
import { auditLog, canonical, checkFrames, generate, Keys, makeKeys, scorecard, SCENARIOS, timeline, truthSeries } from "./lab";

let keys: Keys;
beforeAll(async () => { keys = await makeKeys(); });
const play = async (id: Parameters<typeof generate>[0], seed = 3) => { const run = await generate(id, seed, keys); const checked = await checkFrames(run, keys); return { run, checked, tl: timeline(checked, run.fansOffAt) }; };

describe("alarm trust lab (synthetic)", () => {
  it("is deterministic for a seed and signs a fixed byte string", () => {
    expect(truthSeries("fire", 5).series.co).toEqual(truthSeries("fire", 5).series.co);
    expect(new TextDecoder().decode(canonical({ sid: "co", seq: 7, t: 1000, v: 1.5, kid: "k" }))).toBe("k|co|7|1000|1.5000");
  });
  it("a quiet cabin stays clear and every frame is accepted", async () => {
    const { checked, tl } = await play("clean");
    expect(checked.every((f) => f.ok)).toBe(true);
    expect(tl[tl.length - 1].state).toBe("CLEAR");
  });
  it("a fire raises the alarm from physical signs, and the alarm latches", async () => {
    const { tl } = await play("fire");
    const first = tl.findIndex((v) => v.state === "FIRE ALARM");
    expect(first).toBeGreaterThan(0);
    expect(tl.slice(first).every((v) => v.state === "FIRE ALARM")).toBe(true);
  });
  it("stopping the fans silences the duct detector but not the alarm", async () => {
    const { tl } = await play("fire_fans_off");
    const end = tl[tl.length - 1];
    expect(end.state).toBe("FIRE ALARM");
    expect(end.notes.join(" ")).toMatch(/does not show the fire is out/);
  });
  it("dust, a hot wire and a stuck detector are alerts, not fire alarms, with the right best fit", async () => {
    for (const [id, truth] of [["dust", "dust"], ["pyrolysis", "pyrolysis"], ["stuck", "sensor fault"]] as const) {
      const end = (await play(id)).tl.slice(-1)[0];
      expect([id, end.state, end.leading]).toEqual([id, "CHECK", truth]);
    }
  });
  it("forged readings are rejected by signature and never used", async () => {
    const { checked, tl } = await play("spoof");
    const forged = checked.filter((f) => f.note === "injected");
    expect(forged.length).toBeGreaterThan(20);
    expect(forged.every((f) => !f.ok && !f.sigOk)).toBe(true);
    const end = tl[tl.length - 1];
    expect(end.state).toBe("CHECK");
    expect(end.integrity.badSig).toBe(forged.length);
    expect(end.hypotheses[0].id).toBe("tampering");
  });
  it("replayed and clock-shifted frames are rejected although their signatures verify, and the fire alarm still stands", async () => {
    for (const [id, note] of [["replay", "replayed"], ["timeshift", "clock shifted"]] as const) {
      const { checked, tl } = await play(id);
      const bad = checked.filter((f) => f.note === note);
      expect(bad.every((f) => f.sigOk && !f.ok)).toBe(true);
      const end = tl[tl.length - 1];
      expect([id, end.state, end.integrity.anomaly]).toEqual([id, "FIRE ALARM", true]);
      expect(end.notes.join(" ")).toMatch(/The alarm stands/);
    }
  });
  it("over seeded runs no tampering ever lowers a fire alarm, and every scenario is mostly judged right", async () => {
    const s = await scorecard(keys, [1, 2, 3, 4, 5, 6]);
    expect(s.suppressed).toBe(0);
    expect(s.fireRuns).toBe(4 * 6);
    for (const r of s.rows) expect([r.scenario.id, r.correct >= 5]).toEqual([r.scenario.id, true]);
    expect(SCENARIOS.filter((x) => x.sparta).map((x) => x.sparta!.id)).toEqual(["EX-0014.03", "EX-0001.02", "EX-0014.01"]);
  }, 60000);
  it("the audit log is a hash chain", async () => {
    const { checked, tl } = await play("replay");
    const log = await auditLog(tl, checked);
    expect(log.length).toBeGreaterThan(2);
    for (let i = 1; i < log.length; i++) expect(log[i].prev).toBe(log[i - 1].hash);
  });
});
