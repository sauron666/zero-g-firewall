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
export type ScenarioId = "clean" | "fire" | "fire_fans_off" | "pyrolysis" | "dust" | "stuck" | "spoof" | "replay" | "timeshift";
export interface Scenario { id: ScenarioId; name: string; truth: Truth; fire: boolean; tampering: boolean; about: string; sparta?: { id: string; name: string } }
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
    about: "A fire burns while old, validly signed quiet readings of the duct detector are replayed in place of the new ones.", sparta: { id: "EX-0001.02", name: "Replay: Bus Traffic" } },
  { id: "timeshift", name: "A real fire with a manipulated sensor clock", truth: "fire", fire: true, tampering: true,
    about: "A fire burns while the duct detector's clock is pushed back by 90 s to defeat freshness checks.", sparta: { id: "EX-0014.01", name: "Spoofing: Time Spoof" } },
];

export interface Frame { sid: SensorId; seq: number; t: number; v: number; kid: string; sig: string; rx: number; note?: "injected" | "replayed" | "clock shifted" }
export interface Run { scenario: Scenario; seed: number; frames: Frame[]; fansOffAt: number | null; alg: string }
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
  const burning = id === "fire" || id === "fire_fans_off" || id === "replay" || id === "timeshift";
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
  if (id === "stuck") { const from = Math.round((50 + Math.floor(rnd() * 10)) / STEP); for (let k = from; k < n; k++) s.smoke_duct[k] = 1.42; }
  return { series: s, fansOffAt };
}

/** Sensors sign what they measure; the scenario then tampers with the stream on its way to the receiver. */
export async function generate(id: ScenarioId, seed: number, keys: Keys): Promise<Run> {
  const scenario = SCENARIOS.find((x) => x.id === id)!;
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
    if (sid === "smoke_duct" && id === "timeshift") {
      for (let k = 12; k < own.length; k++) {      // the sensor itself is compromised: it signs with the right key and the wrong clock
        const body = { sid, seq: k, t: own[k].t - 90_000, v: own[k].v, kid: own[k].kid };
        own[k] = { ...body, sig: await sign(body), rx: own[k].rx, note: "clock shifted" };
      }
    }
    frames.push(...own);
  }
  frames.sort((a, b) => a.rx - b.rx);
  return { scenario, seed, frames, fansOffAt, alg: keys.alg };
}

export const MAX_SKEW_MS = 5000;
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
  at: number; state: State; latchedAt: number | null; headline: string; integrity: { rejected: number; badSig: number; replays: number; skewed: number; gaps: number; anomaly: boolean; silent: SensorId[] };
  signals: Signal[]; hypotheses: Hypothesis[]; leading: Truth | "inconclusive"; notes: string[];
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
/** What the receiver may conclude at lab time `at` (seconds), from accepted frames only. */
export function assess(checked: Checked[], at: number, fansOffAt: number | null = null, latchedAt: number | null = null): Verdict {
  const t0 = checked.length ? Math.min(...checked.map((f) => f.rx)) : 0;
  const upto = checked.filter((f) => (f.rx - t0) / 1000 <= at);
  const acc = upto.filter((f) => f.ok);
  const by = (sid: SensorId) => acc.filter((f) => f.sid === sid).map((f) => f.v);
  const rej = upto.filter((f) => !f.ok);
  const integrity = {
    rejected: rej.length, badSig: rej.filter((f) => !f.sigOk).length, replays: rej.filter((f) => f.why.some((w) => w.includes("replay"))).length,
    skewed: rej.filter((f) => f.why.some((w) => w.includes("timestamp"))).length, gaps: rej.filter((f) => f.why.some((w) => w.includes("gap") || w.includes("backwards"))).length,
    anomaly: rej.length > 0, silent: SENSOR_IDS.filter((sid) => { const mine = upto.filter((f) => f.sid === sid); return mine.length >= 8 && mine.slice(-8).every((f) => !f.ok); }),
  };
  const sustained = (v: number[], th: number, k = 3) => v.length >= k && v.slice(-k).every((x) => x >= th);
  const ever = (v: number[], th: number, k = 3) => { let run = 0; for (const x of v) { run = x >= th ? run + 1 : 0; if (run >= k) return true; } return false; };
  const duct = by("smoke_duct"), cabin = by("smoke_cabin"), co = by("co"), temp = by("temp");
  const coBase = mean(co.slice(0, 6)), tBase = mean(temp.slice(0, 6));
  const smokeNow = sustained(duct, SENSORS.smoke_duct.threshold) || sustained(cabin, SENSORS.smoke_cabin.threshold);
  const smokeEver = ever(duct, 1) || ever(cabin, 1);
  const coUp = co.length > 10 && mean(co.slice(-4)) - coBase >= 6 && mean(co.slice(-4)) > mean(co.slice(-12, -8)) - 0.2;
  const tempUp = temp.length > 10 && mean(temp.slice(-4)) - tBase >= 0.6;
  const flat = (v: number[]) => v.length >= 12 && v.slice(-12).every((x) => Math.abs(x - v[v.length - 1]) < 1e-9);
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
  ];
  const on = (id: string) => signals.find((s) => s.id === id)!.on;
  const H = (id: Truth, label: string, plus: [boolean, string][], minus: [boolean, string][]): Hypothesis => {
    const f = plus.filter((x) => x[0]).map((x) => x[1]), a = minus.filter((x) => x[0]).map((x) => x[1]);
    return { id, label, for: f, against: a, score: f.length - a.length };
  };
  const hypotheses = [
    H("fire", "Fire", [[on("smoke"), "sustained smoke"], [coUp, "carbon monoxide rising"], [tempUp, "temperature rising"]], [[transient && !coUp, "the smoke signal came and went too fast"], [stuck && !coUp, "the only smoke signal is a frozen value"], [!on("smoke") && !coUp && !tempUp, "no physical sign in accepted frames"]]),
    H("pyrolysis", "Overheating without flame", [[coUp && lowSmoke, "carbon monoxide rising with little smoke"], [coUp && !tempUp, "no temperature rise"]], [[tempUp, "temperature rising"], [on("smoke") && !lowSmoke, "smoke above the alarm level"], [!coUp, "no carbon monoxide"]]),
    H("dust", "Dust", [[transient, "a fast transient on a smoke detector"], [both, "two separated detectors at once"], [on("smoke") && !coUp && !tempUp, "smoke signal with no combustion gas and no heat"]], [[coUp, "carbon monoxide rising"], [tempUp, "temperature rising"], [!on("smoke") && !transient, "no smoke signal"]]),
    H("sensor fault", "Sensor fault", [[stuck, "a value frozen to the last digit"], [stuck && !coUp && !tempUp, "no other sensor agrees"]], [[!stuck, "every detector still shows noise"]]),
    H("tampering", "Tampering with the data", [[on("sig"), "signatures that do not verify"], [on("replay"), "replayed or out-of-order sequence numbers"], [on("skew"), "timestamps far from the receive time"], [on("silent"), "a sensor silenced: none of its frames is acceptable"]], [[!integrity.anomaly, "every frame passed signature, sequence and clock checks"]]),
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
  if (state === "CHECK" && leading === "pyrolysis") notes.push("Something is overheating: carbon monoxide without flame signs. Find the source before it lights.");
  const headline = state === "FIRE ALARM" ? "Fire alarm" : state === "CLEAR" ? "Nothing to report" : leading === "inconclusive" ? "Alert: inconclusive, check" : `Alert: ${hypotheses.find((h) => h.id === leading)?.label.toLowerCase()} is the best fit, check`;
  return { at, state, latchedAt: latch, headline, integrity, signals, hypotheses, leading, notes };
}

/** Replays a run second by second, as the receiver would live it, and returns the verdict at every step. */
export function timeline(checked: Checked[], fansOffAt: number | null): Verdict[] {
  const out: Verdict[] = [];
  let latched: number | null = null;
  for (let at = 0; at <= DURATION; at += STEP) { const v = assess(checked, at, fansOffAt, latched); latched = v.latchedAt; out.push(v); }
  return out;
}

export interface Score { scenario: Scenario; runs: number; fireAlarms: number; alerts: number; clear: number; leading: Record<string, number>; medianAlarmAt: number | null; correct: number }
/** The same scenarios over many seeds: how often the lab reaches the declared truth, and whether tampering ever lowered an alarm. */
export async function scorecard(keys: Keys, seeds: number[], onProgress?: (done: number, total: number) => void): Promise<{ rows: Score[]; suppressed: number; fireRuns: number }> {
  const rows: Score[] = [];
  let suppressed = 0, fireRuns = 0, done = 0;
  for (const sc of SCENARIOS) {
    const r: Score = { scenario: sc, runs: 0, fireAlarms: 0, alerts: 0, clear: 0, leading: {}, medianAlarmAt: null, correct: 0 };
    const times: number[] = [];
    for (const seed of seeds) {
      const run = await generate(sc.id, seed, keys);
      const tl = timeline(await checkFrames(run, keys), run.fansOffAt);
      const end = tl[tl.length - 1];
      r.runs++;
      if (end.state === "FIRE ALARM") { r.fireAlarms++; times.push(end.latchedAt ?? DURATION); } else if (end.state === "CHECK") r.alerts++; else r.clear++;
      r.leading[end.leading] = (r.leading[end.leading] ?? 0) + 1;
      const right = sc.fire ? end.state === "FIRE ALARM" : sc.truth === "nothing" ? end.state === "CLEAR" : end.state === "CHECK" && (end.leading === sc.truth || (sc.truth === "tampering" && end.integrity.anomaly));
      if (right) r.correct++;
      if (sc.fire) { fireRuns++; if (sc.tampering && end.state !== "FIRE ALARM") suppressed++; }
      onProgress?.(++done, SCENARIOS.length * seeds.length);
    }
    times.sort((a, b) => a - b);
    r.medianAlarmAt = times.length ? times[Math.floor(times.length / 2)] : null;
    rows.push(r);
  }
  return { rows, suppressed, fireRuns };
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
