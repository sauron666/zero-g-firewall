import { beforeAll, describe, expect, it } from "vitest";
import { canonicalPolicy, DEFAULT_POLICY, policyHash, validatePolicy, withChange } from "./policy";
import { ALL_SCENARIOS, assess, checkFrames, compareReceivers, delivery, DURATION, EXTRA_SCENARIOS, generate, Keys, makeKeys, scorecard, timeline, exportRun, auditLog } from "./lab";

let keys: Keys;
beforeAll(async () => { keys = await makeKeys(); });
const play = async (id: Parameters<typeof generate>[0], seed = 3, verify = true) => {
  const run = await generate(id, seed, keys); const checked = await checkFrames(run, keys);
  return { run, checked, tl: timeline(checked, run.fansOffAt, { policyEvents: run.policyEvents, verifyPolicy: verify }) };
};

describe("versioned alarm policy", () => {
  it("validates its own schema and rejects unknown rule types and fields", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual([]);
    expect(validatePolicy({ ...DEFAULT_POLICY, rules: [...DEFAULT_POLICY.rules, { ...DEFAULT_POLICY.rules[0], id: "x", op: "eval" }] }).join(" ")).toMatch(/unknown rule type/);
    expect(validatePolicy({ ...DEFAULT_POLICY, rules: DEFAULT_POLICY.rules.map((r, i) => (i ? r : { ...r, code: "alert(1)" })) }).join(" ")).toMatch(/unknown field code/);
    expect(validatePolicy({ ...DEFAULT_POLICY, rules: DEFAULT_POLICY.rules.slice(1) }).join(" ")).toMatch(/missing rule smoke_sustained/);
  });
  it("a change of one threshold changes the executed verdict", async () => {
    const { checked } = await play("fire");
    expect(assess(checked, DURATION).state).toBe("FIRE ALARM");
    const blind = withChange(DEFAULT_POLICY, { smoke_sustained: 50, co_rise: 500, temp_rise: 50 });
    expect(assess(checked, DURATION, null, null, { policy: blind }).state).not.toBe("FIRE ALARM");
  });
  it("has a stable canonical hash that changes with any number", async () => {
    expect(await policyHash(DEFAULT_POLICY)).toBe(await policyHash(JSON.parse(JSON.stringify(DEFAULT_POLICY))));
    expect(canonicalPolicy(withChange(DEFAULT_POLICY, { co_rise: 7 }))).not.toBe(canonicalPolicy(DEFAULT_POLICY));
  });
});

describe("added scenarios (synthetic)", () => {
  it("threshold tampering is detected and the verified policy keeps the fire alarm; without the check the fire is missed", async () => {
    const a = (await play("threshold_tamper")).tl.slice(-1)[0];
    expect([a.state, a.integrity.policy, a.policy]).toEqual(["FIRE ALARM", true, "1.0.0"]);
    expect(a.notes.join(" ")).toMatch(/pinned hash/);
    const b = (await play("threshold_tamper", 3, false)).tl.slice(-1)[0];
    expect(b.state).not.toBe("FIRE ALARM");
  });
  it("alarm suppression: the decision is FIRE ALARM, the output is not acknowledged, and the two are reported apart", async () => {
    const { run, tl } = await play("suppression");
    expect(tl.slice(-1)[0].state).toBe("FIRE ALARM");
    expect(delivery(tl, run.outputDropAt, DURATION).status).toBe("not acknowledged");
    const ok = await play("fire");
    expect(delivery(ok.tl, ok.run.outputDropAt, DURATION).status).toBe("delivered");
  });
  it("a coordinated replay of every sensor leaves no trustworthy evidence, and the lab says so instead of 'all clear'", async () => {
    const end = (await play("coordinated")).tl.slice(-1)[0];
    expect(end.state).not.toBe("CLEAR");
    expect(end.integrity.anomaly).toBe(true);
    expect(end.integrity.silent.length).toBe(4);
    expect(end.notes.join(" ")).toMatch(/not enough trustworthy physical evidence/);
  });
  it("a drifting detector and a silent feed are sensor faults, not fires", async () => {
    for (const id of ["drift", "silent"] as const) {
      const end = (await play(id)).tl.slice(-1)[0];
      expect([id, end.state, end.leading]).toEqual([id, "CHECK", "sensor fault"]);
    }
    const s = (await play("silent")).tl.slice(-1)[0];
    expect(s.integrity.stale).toEqual(["smoke_duct"]);
  });
  it("decision code never sees the truth: the generator's truth is not a field of any frame", async () => {
    const { run } = await play("drift");
    for (const f of run.frames) expect(Object.keys(f).sort()).toEqual(expect.arrayContaining(["kid", "rx", "seq", "sid", "sig", "t", "v"]));
    expect(run.frames.some((f) => "truth" in f)).toBe(false);
  });
  it("scorecard over seeds: added scenarios are mostly judged right and no tampering lowers a decided alarm", async () => {
    const s = await scorecard(keys, [1, 2, 3, 4], undefined, EXTRA_SCENARIOS);
    expect(s.suppressed).toBe(0);
    for (const r of s.rows) expect([r.scenario.id, r.correct >= 3]).toEqual([r.scenario.id, true]);
    expect(s.deliveryFailed).toBe(4);
  }, 60000);
  it("the receiver comparison uses the same runs for all three and shows where the simple ones fail", async () => {
    const rows = await compareReceivers(keys, [5, 6], ALL_SCENARIOS.filter((x) => ["spoof", "threshold_tamper", "fire"].includes(x.id)));
    const by = Object.fromEntries(rows.map((r) => [r.scenario.id, r.out]));
    expect(by.fire.single_threshold.fire + by.fire.corroboration.fire + by.fire.integrity_aware.fire).toBe(6);  // a plain fire: all three raise it
    expect(by.spoof.single_threshold.fire).toBe(2);                     // forged smoke fools the single threshold
    expect(by.spoof.integrity_aware.fire).toBe(0);
    expect(by.threshold_tamper.corroboration.fire).toBe(0);             // raised thresholds blind a receiver without the policy check
    expect(by.threshold_tamper.integrity_aware.fire).toBe(2);
  }, 60000);
  it("the export carries seed, policy, frames, decisions and the audit chain", async () => {
    const { run, checked, tl } = await play("replay");
    const doc = JSON.parse(await exportRun(run, checked, tl, await auditLog(tl, checked), await policyHash(DEFAULT_POLICY)));
    expect(doc.seed).toBe(3); expect(doc.policy.version).toBe("1.0.0"); expect(doc.frames.length).toBe(run.frames.length);
    expect(doc.decisions.length).toBe(tl.length); expect(doc.audit.entries.length).toBeGreaterThan(2);
    expect(JSON.stringify(doc)).not.toMatch(/privateKey|"d":/);
  });
});
