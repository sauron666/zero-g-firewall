/**
 * The alarm policy as readable, versioned data. The receiver executes these numbers; it accepts only the rule types
 * listed in OPS and only the fields of each, so a policy file cannot carry code. Changing a number changes the verdict
 * (tested in policy.test.ts). The policy's SHA-256 is pinned when a run starts; a later in-memory change that does not
 * match the pinned hash is reported and the last verified version stays in force.
 */
export type Op = "sustained_above" | "delta_above_baseline" | "frozen" | "max_clock_skew" | "silent_for" | "single_detector_drift" | "ack_within";
export interface Rule {
  id: string; op: Op; purpose: string; inputs: string[]; threshold: number; unit: string; window: number; window_unit: "readings" | "s";
  severity: "alarm" | "alert" | "integrity"; evidence: string; limitations: string;
}
export interface Policy { schema: "zgf-alarm-policy/1"; id: string; version: string; purpose: string; rules: Rule[] }

export const OPS: Record<Op, string> = {
  sustained_above: "the sensor's last `window` accepted readings are all at or above `threshold`",
  delta_above_baseline: "the mean of the last 4 accepted readings exceeds the mean of the first 6 by at least `threshold`",
  frozen: "the sensor repeats exactly one value for `window` readings",
  max_clock_skew: "a frame's own timestamp differs from its receive time by more than `threshold` ms",
  silent_for: "no frame of the sensor arrived for `threshold` seconds",
  single_detector_drift: "one detector rose steadily over `window` readings by at least `threshold` while the other stayed below a third of the alarm level",
  ack_within: "the alarm output was acknowledged within `threshold` seconds",
};

export const DEFAULT_POLICY: Policy = {
  schema: "zgf-alarm-policy/1", id: "zgf-alarm-lab", version: "1.0.0",
  purpose: "Rules of the synthetic alarm receiver of Zero-G Firewall. Units of the lab; not a flight policy.",
  rules: [
    { id: "smoke_sustained", op: "sustained_above", purpose: "smoke at a detector", inputs: ["smoke_duct", "smoke_cabin"], threshold: 1, unit: "relative", window: 3, window_unit: "readings", severity: "alert",
      evidence: "lab alarm level of the site's smoke model", limitations: "relative units; no physical calibration" },
    { id: "co_rise", op: "delta_above_baseline", purpose: "combustion gas", inputs: ["co"], threshold: 6, unit: "ppm", window: 4, window_unit: "readings", severity: "alert",
      evidence: "Saffire IV to VI reported CO rises of 80 to 320 ppm at far sensors (NTRS 20240002981, Table 2)", limitations: "lab threshold, chosen well below those rises" },
    { id: "temp_rise", op: "delta_above_baseline", purpose: "heat", inputs: ["temp"], threshold: 0.6, unit: "°C", window: 4, window_unit: "readings", severity: "alert",
      evidence: "lab choice", limitations: "a cabin of 17 m³ warms little from a small fire: Saffire VI far sensors rose by 0 to 3 °C" },
    { id: "frozen", op: "frozen", purpose: "a stuck detector", inputs: ["smoke_duct", "smoke_cabin"], threshold: 0, unit: "", window: 12, window_unit: "readings", severity: "alert", evidence: "lab choice", limitations: "a frozen but true value would also match" },
    { id: "skew", op: "max_clock_skew", purpose: "freshness", inputs: ["*"], threshold: 5000, unit: "ms", window: 1, window_unit: "readings", severity: "integrity", evidence: "lab choice", limitations: "assumes synchronised clocks within 5 s" },
    { id: "silent", op: "silent_for", purpose: "a feed that stopped", inputs: ["*"], threshold: 16, unit: "s", window: 1, window_unit: "s", severity: "integrity", evidence: "lab choice: eight reading intervals", limitations: "cannot tell a dead sensor from a cut link" },
    { id: "drift", op: "single_detector_drift", purpose: "a detector drifting on its own", inputs: ["smoke_duct", "smoke_cabin"], threshold: 0.3, unit: "relative", window: 30, window_unit: "readings", severity: "alert", evidence: "lab choice", limitations: "a slow, real smoulder seen by one detector only would also match" },
    { id: "ack", op: "ack_within", purpose: "the alarm reached the crew", inputs: ["output"], threshold: 4, unit: "s", window: 1, window_unit: "s", severity: "integrity", evidence: "lab choice", limitations: "simulated annunciator; no real output" },
  ],
};

const FIELDS = ["id", "op", "purpose", "inputs", "threshold", "unit", "window", "window_unit", "severity", "evidence", "limitations"];
/** Schema check: known rule types and fields only, finite numbers, one rule per id. */
export function validatePolicy(p: unknown): string[] {
  const out: string[] = [];
  const o = p as Policy;
  if (!o || o.schema !== "zgf-alarm-policy/1") return ["not a zgf-alarm-policy/1 document"];
  if (!/^\d+\.\d+\.\d+$/.test(o.version ?? "")) out.push("version must be MAJOR.MINOR.PATCH");
  const ids = new Set<string>();
  for (const r of o.rules ?? []) {
    if (!(r.op in OPS)) out.push(`${r.id}: unknown rule type ${String(r.op)}`);
    for (const k of Object.keys(r)) if (!FIELDS.includes(k)) out.push(`${r.id}: unknown field ${k}`);
    if (!Number.isFinite(r.threshold) || !Number.isFinite(r.window) || r.window <= 0) out.push(`${r.id}: threshold and window must be finite, window above zero`);
    if (ids.has(r.id)) out.push(`${r.id}: defined twice`);
    ids.add(r.id);
  }
  for (const need of DEFAULT_POLICY.rules.map((r) => r.id)) if (!ids.has(need)) out.push(`missing rule ${need}`);
  return out;
}

export const rule = (p: Policy, id: string) => { const r = p.rules.find((x) => x.id === id); if (!r) throw new Error(`policy ${p.version} has no rule ${id}`); return r; };

/** Canonical JSON (sorted keys) and its SHA-256: the identity of a policy. */
export function canonicalPolicy(p: Policy): string {
  const sort = (v: unknown): unknown => (Array.isArray(v) ? v.map(sort) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v);
  return JSON.stringify(sort(p));
}
export async function policyHash(p: Policy): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalPolicy(p)));
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Apply a change to a copy of a policy, as the threshold-tampering scenario does in memory. */
export function withChange(p: Policy, change: Record<string, number>, version?: string): Policy {
  return { ...p, version: version ?? p.version, rules: p.rules.map((r) => (r.id in change ? { ...r, threshold: change[r.id] } : r)) };
}
