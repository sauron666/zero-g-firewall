/**
 * Alarm trust lab. Everything here is SYNTHETIC: generated in the browser from the site's own smoke-transport
 * model plus seeded noise, with the ground truth declared. It reads no real sensor and controls nothing.
 *
 * One question is tested: can you trust the alarm that shuts off your air? Each reading travels in a signed
 * envelope. A reading is used only if its signature, its sequence number and its clock all hold. Triage then
 * weighs fire against pyrolysis, dust, a failed sensor and tampering, without ever giving a probability.
 * Rule under test: an integrity anomaly may raise an alert; it can never lower a fire alarm.
 */
import { mulberry32 } from "../lib/rank";
import { defaultParams, simulate } from "../physics/paradox";
import { canonicalPolicy, DEFAULT_POLICY, Policy, rule, withChange } from "./policy";

export type SensorId = "smoke_duct" | "smoke_cabin" | "co" | "temp";
export const SENSORS: Record<SensorId, { name: string; unit: string; threshold: number; noise: number; base: number }> = {
  smoke_duct: { name: "Smoke, return-duct detector", unit: "relative", threshold: 1, noise: 0.025, base: 0.02 },
  smoke_cabin: { name: "Smoke, overhead detector", unit: "relative", threshold: 1, noise: 0.025, base: 0.02 },
  co: { name: "Carbon monoxide", unit: "ppm", threshold: 10, noise: 0.25, base: 1.5 },
  temp: { name: "Cabin temperature rise", unit: "°C", threshold: 1, noise: 0.04, base: 0 },
};
export const SENSOR_IDS = Object.keys(SENSORS) as SensorId[];
export const STEP = 2;          // seconds between readings
export const DURATION = 240;    // seconds

export type Truth = "nothing" | "fire" | "pyrolysis" | "dust" | "sensor fault" | "tampering";
export type ScenarioId = "clean" | "fire" | "fire_fans_off" | "pyrolysis" | "dust" | "stuck" | "spoof" | "replay" | "timeshift" | "drift" | "silent" | "threshold_tamper" | "suppression" | "coordinated";
export interface Scenario { id: ScenarioId; name: string; truth: Truth; fire: boolean; tampering: boolean; about: string; sparta?: { id: string; name: string }; expect?: "degraded" | "delivery" }
export const SCENARIOS: Scenario[] = [
  { id: "clean", name: "Quiet cabin", truth: "nothing", fire: false, tampering: false, about: "Nothing happens. The baseline every other scenario is judged against." },
  { id: "fire", name: "Fire, fans running", truth: "fire", fire: true, tampering: false, about: "A flame starts at 20 s. The fans carry its smoke to the return duct." },
  { id: "fire_fans_off", name: "Fire, then the fans are stopped", truth: "fire", fire: true, tampering: false, about: "The same fire, but ventilation stops at 70 s and the flame keeps burning. The duct detector goes quiet. Is the fire out?" },
  { id: "pyrolysis", name: "Overheated wire", truth: "pyrolysis", fire: false, tampering: false, about: "Insulation cooks without a flame: carbon monoxide climbs slowly, with little smoke and no heat." },
  { id: "dust", name: "Dust stirred up", truth: "dust", fire: false, tampering: false, about: "Crew activity throws dust at both detectors at once. No combustion gas, no heat." },
  { id: "stuck", name: "Detector stuck high", truth: "sensor fault", fire: false, tampering: false, about: "The duct detector freezes above its alarm level. Nothing else moves." },
  { id: "spoof", name: "Fake smoke readings injected", truth: "tampering", fire: false, tampering: true, about: "Someone on the data bus injects high smoke readings without the sensor's key. The cabin is quiet.",
    sparta: { id: "EX-0014.03", name: "Spoofing: Sensor Data" } },
  { id: "replay", name: "A real fire hidden by replayed 'all clear' frames", truth: "fire", fire: true, tampering: true,
    about: "A fire burns while old, validly signed quiet readings of the duct detector are replayed in place of the new ones.", sparta: { id: "EX-0001.02", name: "Replay: Bus Traffic Replay" } },
  { id: "timeshift", name: "A real fire with a manipulated sensor clock", truth: "fire", fire: true, tampering: true,
    about: "A fire burns while the duct detector's clock is pushed back by 90 s to defeat freshness checks.", sparta: { id: "EX-0014.01", name: "Spoofing: Time Spoof" } },
];

/** Added on 15 November: each is a separate attack or failure transform on the local generator, with its truth declared. */
export const EXTRA_SCENARIOS: Scenario[] = [
  { id: "drift", name: "Overhead detector drifting", truth: "sensor fault", fire: false, tampering: false, about: "The overhead detector's reading creeps up from 30 s, validly signed. The duct detector, the gas and the heat sensors stay quiet." },
  { id: "silent", name: "Duct detector feed goes silent", truth: "sensor fault", fire: false, tampering: false, about: "From 60 s no frame of the duct detector arrives at all. Nothing else changes." },
  { id: "threshold_tamper", name: "A real fire, alarm thresholds raised in memory", truth: "fire", fire: true, tampering: true,
    about: "A fire burns while, at 30 s, the receiver's alarm policy is changed in memory so that no reading would ever reach an alarm level.", sparta: { id: "EX-0012.13", name: "Modify On-Board Values: Configuration" } },
  { id: "suppression", name: "A real fire, alarm output never acknowledged", truth: "fire", fire: true, tampering: true, expect: "delivery",
    about: "A fire burns and the receiver decides FIRE ALARM, but from 30 s the output channel to the crew's annunciator drops every message. Deciding and delivering are judged apart." },
  { id: "coordinated", name: "A real fire behind replays of every sensor", truth: "fire", fire: true, tampering: true, expect: "degraded",
    about: "A fire burns while all four sensors' quiet, validly signed frames are replayed in place of the live ones. No independent physical evidence is left.", sparta: { id: "EX-0001.02", name: "Replay: Bus Traffic Replay" } },
];
export const ALL_SCENARIOS: Scenario[] = [...SCENARIOS, ...EXTRA_SCENARIOS];
export const POLICY_TAMPER = { at: 30, change: { smoke_sustained: 50, co_rise: 500, temp_rise: 50 } };
export const OUTPUT_DROP_AT = 30;

export interface Frame { sid: SensorId; seq: number; t: number; v: number; kid: string; sig: string; rx: number; note?: "injected" | "replayed" | "clock shifted" }
export interface Run { scenario: Scenario; seed: number; frames: Frame[]; fansOffAt: number | null; alg: string; policyEvents: { at: number; change: Record<string, number> }[]; outputDropAt: number | null }
export interface Checked extends Frame { sigOk: boolean; seqOk: boolean; fresh: boolean; ok: boolean; why: string[] }

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));
/** The exact bytes that are signed: fixed order, fixed precision. */
export const canonical = (f: Pick<Frame, "sid" | "seq" | "t" | "v" | "kid">) => new TextEncoder().encode(`${f.kid}|${f.sid}|${f.seq}|${f.t}|${f.v.toFixed(4)}`);

export interface Keys { alg: string; sign: Record<SensorId, CryptoKey>; verify: Record<SensorId, CryptoKey> }
export async function makeKeys(): Promise<Keys> {
  const out = { alg: "", sign: {} as Record<SensorId, CryptoKey>, verify: {} as Record<SensorId, CryptoKey> };
  for (const sid of SENSOR_IDS) {
    let pair: CryptoKeyPair;
    try { pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, false, ["sign", "verify"])) as CryptoKeyPair; out.alg = "Ed25519"; }
    catch { pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]); out.alg = "ECDSA P-256"; }
    out.sign[sid] = pair.privateKey; out.verify[sid] = pair.publicKey;
  }
  return out;
}
const algOf = (k: Keys) => (k.alg === "Ed25519" ? { name: "Ed25519" } : { name: "ECDSA", hash: "SHA-256" });

/** The physical story of a scenario: one value per sensor every STEP seconds. Deterministic for a seed. */
export function truthSeries(id: ScenarioId, seed: number): { series: Record<SensorId, number[]>; fansOffAt: number | null } {
  const rnd = mulberry32(seed * 7919 + 13);
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) / 0.7071; };
  const n = DURATION / STEP + 1;
  const s: Record<SensorId, number[]> = { smoke_duct: [], smoke_cabin: [], co: [], temp: [] };
  const burning = id === "fire" || id === "fire_fans_off" || id === "replay" || id === "timeshift" || id === "threshold_tamper" || id === "suppression" || id === "coordinated";
  const fansOffAt = id === "fire_fans_off" ? 70 : null;
  const start = 20 + Math.floor(rnd() * 8);
  let sim: ReturnType<typeof simulate> | null = null;
  if (burning) {
    const p = { ...defaultParams(0), horizon: DURATION, coarse: true, dOn: 8e-4 * (0.85 + 0.3 * rnd()), branch: "selffed" as const };
    sim = simulate(p, fansOffAt == null ? Infinity : fansOffAt - start);
  }
  const dustAt = 40 + Math.floor(rnd() * 20), dustAmp = 2.2 + rnd();
  for (let k = 0; k < n; k++) {
    const t = k * STEP;
    let duct = 0, cabin = 0, co = 0, temp = 0;
    if (sim && t >= start) {
      const i = Math.min(sim.t.length - 1, Math.round(t - start));
      duct = sim.series.duct[i]; cabin = sim.series.overhead[i];
      const burned = sim.emitted[i];
      co = 0.16 * burned; temp = 0.016 * burned;
    }
    if (id === "pyrolysis" && t >= start) { co = 0.085 * (t - start); duct = 0.12 * (1 - Math.exp(-(t - start) / 90)); cabin = 0.05 * (1 - Math.exp(-(t - start) / 90)); }
    if (id === "dust" && t >= dustAt) { const d = dustAmp * Math.exp(-(t - dustAt) / 38); duct = d * (t - dustAt < 4 ? 0.6 : 1); cabin = 0.85 * d; }
    s.smoke_duct.push(Math.max(0, SENSORS.smoke_duct.base + duct + SENSORS.smoke_duct.noise * gauss()));
    s.smoke_cabin.push(Math.max(0, SENSORS.smoke_cabin.base + cabin + SENSORS.smoke_cabin.noise * gauss()));
    s.co.push(Math.max(0, SENSORS.co.base + co + SENSORS.co.noise * gauss()));
    s.temp.push(SENSORS.temp.base + temp + SENSORS.temp.noise * gauss());
  }
  if (id === "drift") { const from = 30 / STEP; for (let k = from; k < n; k++) s.smoke_cabin[k] += 0.0062 * (k - from) * STEP; }
  if (id === "stuck") { const from = Math.round((50 + Math.floor(rnd() * 10)) / STEP); for (let k = from; k < n; k++) s.smoke_duct[k] = 1.42; }
  return { series: s, fansOffAt };
}

/** Sensors sign what they measure; the scenario then tampers with the stream on its way to the receiver. */
export async function generate(id: ScenarioId, seed: number, keys: Keys): Promise<Run> {
  const scenario = ALL_SCENARIOS.find((x) => x.id === id)!;
  const { series, fansOffAt } = truthSeries(id, seed);
  const rnd = mulberry32(seed * 104729 + 7);
  const t0 = 1_800_000_000_000;                 // an arbitrary epoch for the lab clock, ms
  const frames: Frame[] = [];
  const sign = async (f: Omit<Frame, "sig" | "rx">) => hex(await crypto.subtle.sign(algOf(keys), keys.sign[f.sid], canonical(f)));
  for (const sid of SENSOR_IDS) {
    const own: Frame[] = [];
    for (let k = 0; k < series[sid].length; k++) {
      const t = t0 + k * STEP * 1000;
      const body = { sid, seq: k, t, v: series[sid][k], kid: `${sid}-key-1` };
      own.push({ ...body, sig: await sign(body), rx: t + 60 + Math.floor(rnd() * 140) });
    }
    if (sid === "smoke_duct" && id === "spoof") {
      for (let k = 30; k < 62; k++) {              // forged readings, no access to the key
        const t = t0 + k * STEP * 1000 + 400;
        own.push({ sid, seq: k, t, v: 1.6 + 0.5 * rnd(), kid: `${sid}-key-1`, sig: hex(crypto.getRandomValues(new Uint8Array(64)).buffer), rx: t + 90, note: "injected" });
      }
    }
    if (sid === "smoke_duct" && id === "replay") {
      const from = 14;                             // from 28 s on, the receiver gets copies of frames 0..13 instead of the live ones
      for (let k = from; k < own.length; k++) { const old = own[(k - from) % from]; own[k] = { ...old, rx: t0 + k * STEP * 1000 + 80, note: "replayed" }; }
    }
    if (sid === "smoke_duct" && id === "silent") own.splice(60 / STEP);   // the feed stops: no frame after 60 s
    if (id === "coordinated") {
      const from = 14;                             // every sensor: quiet frames 0..13 replayed from 28 s on
      for (let k = from; k < own.length; k++) { const old = own[(k - from) % from]; own[k] = { ...old, rx: t0 + k * STEP * 1000 + 80, note: "replayed" }; }
    }
    if (sid === "smoke_duct" && id === "timeshift") {
      for (let k = 12; k < own.length; k++) {      // the sensor itself is compromised: it signs with the right key and the wrong clock
        const body = { sid, seq: k, t: own[k].t - 90_000, v: own[k].v, kid: own[k].kid };
        own[k] = { ...body, sig: await sign(body), rx: own[k].rx, note: "clock shifted" };
      }
    }
    frames.push(...own);
  }
  frames.sort((a, b) => a.rx - b.rx);
  return { scenario, seed, frames, fansOffAt, alg: keys.alg, policyEvents: id === "threshold_tamper" ? [POLICY_TAMPER] : [], outputDropAt: id === "suppression" ? OUTPUT_DROP_AT : null };
}

export const MAX_SKEW_MS = rule(DEFAULT_POLICY, "skew").threshold;
/** Signature, sequence and freshness for every frame, in arrival order. Only frames that pass all three are used. */
export async function checkFrames(run: Run, keys: Keys): Promise<Checked[]> {
  const last: Partial<Record<SensorId, { seq: number; t: number }>> = {};
  const seen = new Set<string>();
  const out: Checked[] = [];
  for (const f of run.frames) {
    const why: string[] = [];
    let sigOk = false;
    try { sigOk = await crypto.subtle.verify(algOf(keys), keys.verify[f.sid], unhex(f.sig), canonical(f)); } catch { sigOk = false; }
    if (!sigOk) why.push("signature does not verify");
    const l = last[f.sid];
    const dup = seen.has(`${f.sid}|${f.seq}`);
    const seqOk = sigOk ? (!dup && (l ? f.seq === l.seq + 1 : true)) : !dup;
    if (dup) why.push("sequence number already seen (replay)"); else if (sigOk && l && f.seq !== l.seq + 1) why.push(f.seq <= l.seq ? "sequence number goes backwards" : "sequence gap");
    const fresh = Math.abs(f.rx - f.t) <= MAX_SKEW_MS && (!l || f.t > l.t || !sigOk);
    if (Math.abs(f.rx - f.t) > MAX_SKEW_MS) why.push(`timestamp ${Math.round((f.rx - f.t) / 1000)} s away from the receive time`);
    const ok = sigOk && seqOk && fresh;
    if (sigOk) seen.add(`${f.sid}|${f.seq}`);
    if (ok || (sigOk && !dup && f.seq > (l?.seq ?? -1))) last[f.sid] = { seq: f.seq, t: Math.max(f.t, l?.t ?? 0) };
    out.push({ ...f, sigOk, seqOk, fresh, ok, why });
  }
  return out;
}

export type State = "CLEAR" | "CHECK" | "FIRE ALARM";
export interface Signal { id: string; text: string; on: boolean }
export interface Hypothesis { id: Truth; label: string; for: string[]; against: string[]; score: number }
export interface Verdict {
  at: number; state: State; latchedAt: number | null; headline: string; integrity: { rejected: number; badSig: number; replays: number; skewed: number; gaps: number; anomaly: boolean; silent: SensorId[]; stale: SensorId[]; policy: boolean };
  policy: string;
  signals: Signal[]; hypotheses: Hypothesis[]; leading: Truth | "inconclusive"; notes: string[];
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** What the receiver may conclude at lab time `at` (seconds), from accepted frames only. */
export interface AssessOpts { policy?: Policy; policyTampered?: boolean }
export function assess(checked: Checked[], at: number, fansOffAt: number | null = null, latchedAt: number | null = null, opts: AssessOpts = {}): Verdict {
  const P = opts.policy ?? DEFAULT_POLICY;
  const rS = rule(P, "smoke_sustained"), rCo = rule(P, "co_rise"), rT = rule(P, "temp_rise"), rF = rule(P, "frozen"), rSil = rule(P, "silent"), rD = rule(P, "drift");
  const t0 = checked.length ? Math.min(...checked.map((f) => f.rx)) : 0;
  const upto = checked.filter((f) => (f.rx - t0) / 1000 <= at);
  const acc = upto.filter((f) => f.ok);
  const by = (sid: SensorId) => acc.filter((f) => f.sid === sid).map((f) => f.v);
  const rej = upto.filter((f) => !f.ok);
  const integrity = {
    rejected: rej.length, badSig: rej.filter((f) => !f.sigOk).length, replays: rej.filter((f) => f.why.some((w) => w.includes("replay"))).length,
    skewed: rej.filter((f) => f.why.some((w) => w.includes("timestamp"))).length, gaps: rej.filter((f) => f.why.some((w) => w.includes("gap") || w.includes("backwards"))).length,
    anomaly: rej.length > 0 || !!opts.policyTampered, silent: SENSOR_IDS.filter((sid) => { const mine = upto.filter((f) => f.sid === sid); return mine.length >= 8 && mine.slice(-8).every((f) => !f.ok); }),
    stale: SENSOR_IDS.filter((sid) => { const mine = upto.filter((f) => f.sid === sid); const lastRx = mine.length ? mine[mine.length - 1].rx : t0; return at - (lastRx - t0) / 1000 > rSil.threshold; }),
    policy: !!opts.policyTampered,
  };
  if (integrity.stale.length) integrity.anomaly = true;
  const sustained = (v: number[], th: number, k = 3) => v.length >= k && v.slice(-k).every((x) => x >= th);
  const ever = (v: number[], th: number, k = 3) => { let run = 0; for (const x of v) { run = x >= th ? run + 1 : 0; if (run >= k) return true; } return false; };
  const duct = by("smoke_duct"), cabin = by("smoke_cabin"), co = by("co"), temp = by("temp");
  const coBase = mean(co.slice(0, 6)), tBase = mean(temp.slice(0, 6));
  const smokeNow = sustained(duct, rS.threshold, rS.window) || sustained(cabin, rS.threshold, rS.window);
  const smokeEver = ever(duct, rS.threshold, rS.window) || ever(cabin, rS.threshold, rS.window);
  const coUp = co.length > 10 && mean(co.slice(-rCo.window)) - coBase >= rCo.threshold && mean(co.slice(-rCo.window)) > mean(co.slice(-12, -8)) - 0.2;
  const tempUp = temp.length > 10 && mean(temp.slice(-rT.window)) - tBase >= rT.threshold;
  const flat = (v: number[]) => v.length >= rF.window && v.slice(-rF.window).every((x) => Math.abs(x - v[v.length - 1]) < 1e-9);
  const drifting = (a: number[], b: number[]) => { const w = rD.window; if (a.length < w) return false; const seg = a.slice(-w); const rises = seg.filter((x, i) => i > 0 && x >= seg[i - 1] - 0.08).length; return seg[w - 1] - seg[0] >= rD.threshold && rises >= 0.8 * (w - 1) && Math.max(...b.slice(-w)) < rS.threshold / 3; };
  const drift = drifting(duct, cabin) || drifting(cabin, duct);
  const stuck = flat(duct) || flat(cabin);
  const peak = (v: number[]) => (v.length ? Math.max(...v) : 0);
  const fastDecay = (v: number[]) => { const p = peak(v); const i = v.indexOf(p); return p >= 1 && i >= 0 && v.length - i >= 12 && v[v.length - 1] < 0.55 * p; };
  const jump = (v: number[]) => v.some((x, i) => i > 0 && x - v[i - 1] > 0.9);
  const transient = fastDecay(duct) || fastDecay(cabin) || ((jump(duct) || jump(cabin)) && !stuck);
  const both = ever(duct, 1, 1) && ever(cabin, 1, 1) && Math.abs(duct.findIndex((x) => x >= 1) - cabin.findIndex((x) => x >= 1)) <= 2;
  const lowSmoke = peak(duct) < 0.6 && peak(cabin) < 0.6;
  const signals: Signal[] = [
    { id: "smoke", text: "Smoke above the alarm level for three readings in a row, in accepted frames", on: smokeNow || smokeEver },
    { id: "co", text: "Carbon monoxide at least 6 ppm above its baseline and not falling", on: coUp },
    { id: "temp", text: "Cabin temperature at least 0.6 °C above its baseline", on: tempUp },
    { id: "transient", text: "Smoke rose faster than transport allows, or fell by half within a minute", on: transient },
    { id: "both", text: "Two detectors far apart crossed the alarm level within four seconds of each other", on: both },
    { id: "flat", text: "A detector repeats exactly the same value for 24 s", on: stuck },
    { id: "sig", text: "Frames whose signature does not verify", on: integrity.badSig > 0 },
    { id: "replay", text: "Sequence numbers seen before, or going backwards", on: integrity.replays + integrity.gaps > 0 },
    { id: "skew", text: "Timestamps more than 5 s from the receive time", on: integrity.skewed > 0 },
    { id: "silent", text: "A sensor with no accepted frame for 16 s", on: integrity.silent.length > 0 },
    { id: "stale", text: `A sensor whose feed stopped: no frame at all for ${rSil.threshold} s`, on: integrity.stale.length > 0 },
    { id: "drift", text: "One detector rising slowly and steadily while the other stays low", on: drift },
    { id: "policy", text: "The alarm policy in memory differs from its pinned version", on: integrity.policy },
  ];
  const on = (id: string) => signals.find((s) => s.id === id)!.on;
  const H = (id: Truth, label: string, plus: [boolean, string][], minus: [boolean, string][]): Hypothesis => {
    const f = plus.filter((x) => x[0]).map((x) => x[1]), a = minus.filter((x) => x[0]).map((x) => x[1]);
    return { id, label, for: f, against: a, score: f.length - a.length };
  };
  const hypotheses = [
    H("fire", "Fire", [[on("smoke"), "sustained smoke"], [coUp, "carbon monoxide rising"], [tempUp, "temperature rising"]], [[transient && !coUp, "the smoke signal came and went too fast"], [stuck && !coUp, "the only smoke signal is a frozen value"], [!on("smoke") && !coUp && !tempUp, "no physical sign in accepted frames"]]),
    H("pyrolysis", "Overheating without flame", [[coUp && lowSmoke, "carbon monoxide rising with little smoke"], [coUp && !tempUp, "no temperature rise"]], [[tempUp, "temperature rising"], [on("smoke") && !lowSmoke, "smoke above the alarm level"], [!coUp, "no carbon monoxide"]]),
    H("dust", "Dust", [[transient, "a fast transient on a smoke detector"], [both, "two separated detectors at once"], [on("smoke") && !coUp && !tempUp, "smoke signal with no combustion gas and no heat"]], [[coUp, "carbon monoxide rising"], [tempUp, "temperature rising"], [!on("smoke") && !transient, "no smoke signal"], [drift, "a slow steady rise in one detector, not a cloud"]]),
    H("sensor fault", "Sensor fault", [[stuck, "a value frozen to the last digit"], [drift, "a slow drift in a single detector"], [(stuck || drift) && !coUp && !tempUp, "no other sensor agrees"], [integrity.stale.length > 0, "a sensor's feed stopped"]], [[!stuck && !drift && integrity.stale.length === 0, "every detector still shows noise"]]),
    H("tampering", "Tampering with the data", [[on("sig"), "signatures that do not verify"], [on("replay"), "replayed or out-of-order sequence numbers"], [on("skew"), "timestamps far from the receive time"], [on("silent"), "a sensor silenced: none of its frames is acceptable"], [integrity.policy, "the alarm policy was changed in memory"]], [[!integrity.anomaly, "every frame passed signature, sequence and clock checks"]]),
  ].sort((x, y) => y.score - x.score);
  const physicalFire = (on("smoke") && (coUp || tempUp) && !stuck) || (coUp && tempUp);
  const fireNow: State = physicalFire ? "FIRE ALARM" : on("smoke") || coUp || tempUp || stuck || integrity.anomaly ? "CHECK" : "CLEAR";
  const latch = latchedAt ?? (fireNow === "FIRE ALARM" ? at : null);
  const state: State = latch != null ? "FIRE ALARM" : fireNow;       // a fire alarm latches: nothing in the data stream can lower it
  const phys = hypotheses.filter((h) => h.id !== "tampering" && h.score > 0);
  const leading: Verdict["leading"] = state === "CLEAR" ? "inconclusive" : state === "FIRE ALARM" ? "fire"
    : phys.length === 0 ? (integrity.anomaly ? "tampering" : "inconclusive") : phys.length > 1 && phys[0].score === phys[1].score ? "inconclusive" : phys[0].id;
  const notes: string[] = [];
  if (state === "FIRE ALARM" && integrity.anomaly) notes.push("Data integrity anomaly at the same time as physical signs of fire. The alarm stands; the tampering is reported separately.");
  if (state === "FIRE ALARM" && fansOffAt != null && at > fansOffAt + 20 && !sustained(duct, 1)) notes.push("The duct detector went quiet after ventilation stopped. That shows smoke no longer reaches it. It does not show the fire is out.");
  if (state === "CHECK" && integrity.anomaly && !on("smoke") && !coUp) notes.push("The only alarming readings fail their checks and were not used. No accepted frame shows fire. Confirm by a second channel.");
  if (state === "CHECK" && leading === "dust") notes.push("Dust fits better than fire: no combustion gas, no heat. A look by the crew settles it.");
  if (state === "CHECK" && leading === "sensor fault") notes.push("One detector is frozen and nothing else agrees with it.");
  if (integrity.policy) notes.push(`The alarm policy in memory no longer matches its pinned hash. The verified version ${P.version} stays in force; the change is reported, not applied.`);
  if (integrity.silent.length === SENSOR_IDS.length && state !== "FIRE ALARM") notes.push("Every sensor's frames fail their checks. There is not enough trustworthy physical evidence to confirm or rule out a fire: the cabin state is unknown. Send someone to look.");
  if (state === "CHECK" && leading === "sensor fault" && integrity.stale.length) notes.push(`No frame from ${integrity.stale.map((x) => SENSORS[x].name.toLowerCase()).join(", ")} for ${rSil.threshold} s. Silence is not an all-clear.`);
  if (state === "CHECK" && leading === "pyrolysis") notes.push("Something is overheating: carbon monoxide without flame signs. Find the source before it lights.");
  const headline = state === "FIRE ALARM" ? "Fire alarm" : state === "CLEAR" ? "Nothing to report" : leading === "inconclusive" ? "Alert: inconclusive, check" : `Alert: ${hypotheses.find((h) => h.id === leading)?.label.toLowerCase()} is the best fit, check`;
  return { at, state, latchedAt: latch, headline, integrity, signals, hypotheses, leading, notes, policy: P.version };
}

/** Replays a run second by second, as the receiver would live it, and returns the verdict at every step. */
export interface TimelineOpts { policyEvents?: Run["policyEvents"]; verifyPolicy?: boolean; policy?: Policy }
export function timeline(checked: Checked[], fansOffAt: number | null, opts: TimelineOpts = {}): Verdict[] {
  const out: Verdict[] = [];
  let latched: number | null = null;
  const pinned = opts.policy ?? DEFAULT_POLICY;
  const pinnedBytes = canonicalPolicy(pinned);
  for (let at = 0; at <= DURATION; at += STEP) {
    let effective = pinned;
    for (const e of opts.policyEvents ?? []) if (e.at <= at) effective = withChange(effective, e.change);
    const tampered = canonicalPolicy(effective) !== pinnedBytes;
    const use = tampered && opts.verifyPolicy !== false ? pinned : effective;
    const v = assess(checked, at, fansOffAt, latched, { policy: use, policyTampered: tampered && opts.verifyPolicy !== false });
    latched = v.latchedAt; out.push(v);
  }
  return out;
}

/** The alarm output, judged apart from the decision: sent when the decision first becomes FIRE ALARM, acknowledged unless the channel drops it. */
export interface Delivery { sentAt: number | null; ackAt: number | null; status: "none" | "delivered" | "awaiting" | "not acknowledged" }
export function delivery(tl: Verdict[], dropAt: number | null, at: number, policy: Policy = DEFAULT_POLICY): Delivery {
  const ackWithin = rule(policy, "ack").threshold;
  const first = tl.find((v) => v.state === "FIRE ALARM");
  if (!first || first.at > at) return { sentAt: null, ackAt: null, status: "none" };
  const sentAt = first.at;
  const dropped = dropAt != null && sentAt >= dropAt;
  const ackAt = dropped ? null : sentAt + 1;
  if (ackAt != null && ackAt <= at) return { sentAt, ackAt, status: "delivered" };
  return { sentAt, ackAt: null, status: at - sentAt > ackWithin ? "not acknowledged" : "awaiting" };
}

export interface Score { scenario: Scenario; runs: number; fireAlarms: number; alerts: number; clear: number; leading: Record<string, number>; medianAlarmAt: number | null; correct: number }
/** The same scenarios over many seeds: how often the lab reaches the declared truth, and whether tampering ever lowered an alarm. */
/** The seeds of the scorecard on the page. */
export const SCORE_SEEDS = [11, 12, 13, 14, 15, 16, 17, 18];
export async function scorecard(keys: Keys, seeds: number[], onProgress?: (done: number, total: number) => void, list: Scenario[] = SCENARIOS): Promise<{ rows: Score[]; suppressed: number; fireRuns: number; frames: number; deliveryFailed: number }> {
  const rows: Score[] = [];
  let suppressed = 0, fireRuns = 0, done = 0, frames = 0, deliveryFailed = 0;
  for (const sc of list) {
    const r: Score = { scenario: sc, runs: 0, fireAlarms: 0, alerts: 0, clear: 0, leading: {}, medianAlarmAt: null, correct: 0 };
    const times: number[] = [];
    for (const seed of seeds) {
      const run = await generate(sc.id, seed, keys);
      const tl = timeline(await checkFrames(run, keys), run.fansOffAt, { policyEvents: run.policyEvents });
      const end = tl[tl.length - 1];
      const out = delivery(tl, run.outputDropAt, DURATION);
      r.runs++;
      frames += run.frames.length;
      if (end.state === "FIRE ALARM") { r.fireAlarms++; times.push(end.latchedAt ?? DURATION); } else if (end.state === "CHECK") r.alerts++; else r.clear++;
      r.leading[end.leading] = (r.leading[end.leading] ?? 0) + 1;
      const right = sc.expect === "degraded" ? end.state !== "CLEAR" && end.integrity.anomaly && (end.state === "FIRE ALARM" || end.leading === "inconclusive" || end.leading === "tampering")
        : sc.expect === "delivery" ? end.state === "FIRE ALARM" && out.status === "not acknowledged"
        : sc.fire ? end.state === "FIRE ALARM" : sc.truth === "nothing" ? end.state === "CLEAR" : end.state === "CHECK" && (end.leading === sc.truth || (sc.truth === "tampering" && end.integrity.anomaly));
      if (sc.fire && out.status === "not acknowledged") deliveryFailed++;
      if (right) r.correct++;
      if (sc.fire) { fireRuns++; if (sc.tampering && sc.expect !== "degraded" && end.state !== "FIRE ALARM") suppressed++; }
      onProgress?.(++done, list.length * seeds.length);
    }
    times.sort((a, b) => a - b);
    r.medianAlarmAt = times.length ? times[Math.floor(times.length / 2)] : null;
    rows.push(r);
  }
  return { rows, suppressed, fireRuns, frames, deliveryFailed };
}

/** A hash-chained audit log of what the receiver decided, so that the record of an alarm cannot be quietly rewritten. */
export interface LogEntry { n: number; at: number; event: string; prev: string; hash: string }
export async function auditLog(tl: Verdict[], checked: Checked[]): Promise<LogEntry[]> {
  const events: { at: number; event: string }[] = [];
  const t0 = checked.length ? Math.min(...checked.map((f) => f.rx)) : 0;
  let state: State = "CLEAR";
  const seen = new Set<string>();
  for (const v of tl) {
    for (const f of checked) {
      const at = (f.rx - t0) / 1000;
      if (!f.ok && at <= v.at && at > v.at - STEP) { const key = `${f.sid}|${f.why[0]}`; if (!seen.has(key)) { seen.add(key); events.push({ at: Math.round(at), event: `Frame rejected from ${SENSORS[f.sid].name}: ${f.why[0]}` }); } }
    }
    if (v.state !== state) { events.push({ at: v.at, event: `State ${state} -> ${v.state}: ${v.headline}` }); state = v.state; }
    for (const n of v.notes) if (!seen.has(n)) { seen.add(n); events.push({ at: v.at, event: n }); }
  }
  const out: LogEntry[] = [];
  let prev = "0".repeat(64);
  for (let n = 0; n < events.length; n++) {
    const body = `${prev}|${n}|${events[n].at}|${events[n].event}`;
    const hash = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
    out.push({ n, at: events[n].at, event: events[n].event, prev, hash });
    prev = hash;
  }
  return out;
}

/**
 * Three receivers on the same frames, noise, source and physical rules, differing in one thing each:
 *  single_threshold : any frame of the duct detector at the alarm level raises a fire alarm; no signature, sequence, clock or policy check
 *  corroboration    : this lab's physical rules (smoke with gas or heat), but every frame is believed and the policy in memory is used as it is
 *  integrity_aware  : this lab, with signature, sequence, clock, feed and policy checks
 * Outcomes are counted per run against the declared truth. If a simpler receiver does as well, the table shows it.
 */
export type Receiver = "single_threshold" | "corroboration" | "integrity_aware";
export interface CompareRow { scenario: Scenario; runs: number; out: Record<Receiver, { fire: number; alert: number; clear: number; anomaly: number; firstAlarm: number[] }> }
export function receiverEnd(rcv: Receiver, run: Run, checked: Checked[]): Verdict {
  if (rcv === "integrity_aware") { const tl = timeline(checked, run.fansOffAt, { policyEvents: run.policyEvents }); return tl[tl.length - 1]; }
  const trusting: Checked[] = run.frames.map((f) => ({ ...f, sigOk: true, seqOk: true, fresh: true, ok: true, why: [] }));
  if (rcv === "corroboration") { const tl = timeline(trusting, run.fansOffAt, { policyEvents: run.policyEvents, verifyPolicy: false }); return tl[tl.length - 1]; }
  // single threshold: the duct detector alone, through whatever policy is in memory
  let policy = DEFAULT_POLICY, latched: number | null = null;
  const t0 = Math.min(...trusting.map((f) => f.rx));
  for (const f of trusting) {
    const at = (f.rx - t0) / 1000;
    for (const e of run.policyEvents) if (e.at <= at) policy = withChange(DEFAULT_POLICY, e.change);
    if (f.sid === "smoke_duct" && f.v >= rule(policy, "smoke_sustained").threshold) { latched = Math.round(at); break; }
  }
  const base = assess([], 0);
  return { ...base, at: DURATION, state: latched != null ? "FIRE ALARM" : "CLEAR", latchedAt: latched, headline: latched != null ? "Fire alarm" : "Nothing to report", leading: latched != null ? "fire" : "inconclusive", notes: [] };
}
export async function compareReceivers(keys: Keys, seeds: number[], list: Scenario[] = ALL_SCENARIOS, onProgress?: (d: number, t: number) => void): Promise<CompareRow[]> {
  const rows: CompareRow[] = [];
  let done = 0;
  for (const sc of list) {
    const z = () => ({ fire: 0, alert: 0, clear: 0, anomaly: 0, firstAlarm: [] as number[] });
    const row: CompareRow = { scenario: sc, runs: 0, out: { single_threshold: z(), corroboration: z(), integrity_aware: z() } };
    for (const seed of seeds) {
      const run = await generate(sc.id, seed, keys);
      const checked = await checkFrames(run, keys);
      row.runs++;
      for (const rcv of ["single_threshold", "corroboration", "integrity_aware"] as Receiver[]) {
        const end = receiverEnd(rcv, run, checked);
        const o = row.out[rcv];
        if (end.state === "FIRE ALARM") { o.fire++; if (end.latchedAt != null) o.firstAlarm.push(end.latchedAt); } else if (end.state === "CHECK") o.alert++; else o.clear++;
        if (rcv === "integrity_aware" && end.integrity.anomaly) o.anomaly++;
      }
      onProgress?.(++done, list.length * seeds.length);
    }
    rows.push(row);
  }
  return rows;
}

/** Everything needed to re-run and re-check one run: seed, policy and its hash, every frame with its checks, every decision, the audit chain. */
export async function exportRun(run: Run, checked: Checked[], tl: Verdict[], log: LogEntry[], policyHashHex: string): Promise<string> {
  return JSON.stringify({
    klass: "SYNTHETIC_SCENARIO", schema: "zgf-alarm-run/1", scenario: run.scenario.id, truth: run.scenario.truth, seed: run.seed, signature_alg: run.alg,
    canonical_frame: "kid|sid|seq|t|v(4 decimals)", policy: { id: DEFAULT_POLICY.id, version: DEFAULT_POLICY.version, sha256: policyHashHex, events: run.policyEvents },
    output_drop_at_s: run.outputDropAt, frames: checked.map((f) => ({ sid: f.sid, seq: f.seq, t: f.t, rx: f.rx, v: +f.v.toFixed(4), kid: f.kid, sig: f.sig, note: f.note ?? null, sig_ok: f.sigOk, seq_ok: f.seqOk, fresh: f.fresh, accepted: f.ok, why: f.why })),
    decisions: tl.map((v) => ({ at: v.at, state: v.state, leading: v.leading, policy: v.policy, anomaly: v.integrity.anomaly })),
    audit: { rule: "hash = SHA-256 of prev|n|at|event; the first prev is 64 zeros", entries: log },
    note: "Public verification keys are not exported: the keys were made in this browser for this session and never leave it. Private keys are never exported.",
  }, null, 1);
}
