/**
 * Shared contracts of the laboratory (docs/CONTRACTS.md, "Laboratory contracts").
 * SI inside: metres, seconds, m/s, kPa, O2 as a mole fraction, gravity as a fraction of g0.
 * One ScenarioState drives the 2-D chart, the 3-D scene, the brief and XR; ViewState never changes science.
 */
import type { Klass } from "./klass";

export const SCENARIO_VERSION = 1;

export type Material = "PMMA" | "Methanol" | "Heptane" | "unknown";
export type FuelForm = "sheet" | "rod" | "sphere" | "droplet" | "unknown";
export type MissionPreset = "iss" | "lunar_habitat" | "flex_lab" | "saffire_vi" | "custom";

export interface ScenarioState {
  v: number;
  material: Material;
  form: FuelForm;
  /** characteristic size in metres (thickness of a sheet, diameter of a rod or droplet); null when unknown */
  size_m: number | null;
  o2: number | null;          // mole fraction
  p_kpa: number | null;
  u_m_s: number | null;       // forced airflow
  g: number | null;           // fraction of standard gravity
  preset: MissionPreset;
  evidence: string[];         // selected evidence IDs
  layers: string[];
  seed: number;
  t_s: number;                // simulation time shown
}

export type MatchStatus = "match" | "near" | "different" | "not_reported";
export interface ConditionCheck {
  dim: "material" | "form" | "o2" | "p_kpa" | "u_m_s" | "g";
  asked: string;              // formatted with unit
  recorded: string;           // as recorded, formatted with unit, or "not reported"
  status: MatchStatus;
  why: string;
  tolerance?: string;         // shown for "near": our heuristic
}
export type EvidenceRole = "direct" | "analogous" | "mechanistic" | "context";
export interface EvidenceMatch {
  id: string;                 // test/row identity, e.g. "Saffire VI-3" or "PSI-25 row 12"
  title: string;
  checks: ConditionCheck[];
  missing: ConditionCheck["dim"][];
  similarity: number;         // 0..1 ordering score: our heuristic, not applicability
  role: EvidenceRole;
  joint: boolean;             // every condition matches in this one test
  klass: Klass;
  source: { label: string; ref?: unknown };
  observed: { label: string; value: string }[];
}

export interface ModelResult {
  task: string;
  model_id: string;
  target: string;
  unit: string;
  input: Record<string, number | string | null>;
  estimate: number | null;            // null when the model abstains
  status: "supported" | "abstain";
  reasons: string[];
  uncertainty: { kind: string; p50: number; p80: number } | null;
  nearest: { row: number; test: string; d: number }[];
  artifact_sha256?: string;
}

export interface LabRun {
  kind: "LabRun";                     // a synthetic or model run; a NASA record never has this type
  model: string;
  params: Record<string, number | string>;
  seed: number;
  t: number[];
  series: Record<string, number[]>;
  labels: Record<string, string>;
}

export interface ViewState { camera: "front" | "side" | "top" | "free"; selected: string | null; speed: number; quality: "high" | "low" }

export const PRESETS: Record<Exclude<MissionPreset, "custom">, { label: string; set: Partial<ScenarioState>; note: string }> = {
  saffire_vi: { label: "Saffire VI-3 (recorded)", set: { material: "PMMA", form: "sheet", o2: 0.303, p_kpa: 54.6, u_m_s: 0.2, g: 0 }, note: "Conditions as NASA reported them for test VI-3." },
  iss: { label: "ISS cabin", set: { o2: 0.2095, p_kpa: 101.325, u_m_s: 0.2, g: 0 }, note: "Sea-level air in free fall; airflow is our choice of a typical ventilation speed." },
  lunar_habitat: { label: "Lunar habitat (34% O2, 56.5 kPa)", set: { o2: 0.34, p_kpa: 56.5, u_m_s: 0.1, g: 0.165 }, note: "Changes oxygen, pressure, airflow and gravity at once." },
  flex_lab: { label: "FLEX droplet, air", set: { material: "Methanol", form: "droplet", size_m: 0.002, o2: 0.21, p_kpa: 101.3, u_m_s: 0, g: 0 }, note: "A supported FLEX case: methanol in air at 1 atm." },
};

export function defaultScenario(): ScenarioState {
  return { v: SCENARIO_VERSION, material: "PMMA", form: "sheet", size_m: null, o2: 0.303, p_kpa: 54.6, u_m_s: 0.2, g: 0, preset: "saffire_vi", evidence: ["Saffire VI-3"], layers: ["flow", "sensors", "evidence"], seed: 1, t_s: 0 };
}

const MATERIALS: Material[] = ["PMMA", "Methanol", "Heptane", "unknown"];
const FORMS: FuelForm[] = ["sheet", "rod", "sphere", "droplet", "unknown"];
const PRESET_IDS: MissionPreset[] = ["iss", "lunar_habitat", "flex_lab", "saffire_vi", "custom"];

export interface Problem { field: string; why: string }
/** Physical sanity: NaN, negative pressure, a fraction outside 0..1. Unknown (null) is allowed and stays unknown. */
export function validate(s: ScenarioState): Problem[] {
  const out: Problem[] = [];
  const fin = (k: keyof ScenarioState, v: number | null, lo: number, hi: number, unit: string) => {
    if (v == null) return;
    if (!Number.isFinite(v)) out.push({ field: k, why: "not a number" });
    else if (v < lo || v > hi) out.push({ field: k, why: `outside ${lo} to ${hi} ${unit}` });
  };
  fin("o2", s.o2, 0, 1, "(mole fraction)");
  fin("p_kpa", s.p_kpa, 0.1, 1000, "kPa");
  fin("u_m_s", s.u_m_s, 0, 10, "m/s");
  fin("g", s.g, 0, 3, "g");
  fin("size_m", s.size_m, 1e-6, 1, "m");
  if (!MATERIALS.includes(s.material)) out.push({ field: "material", why: "unknown material" });
  if (!FORMS.includes(s.form)) out.push({ field: "form", why: "unknown form" });
  return out;
}

const num = (q: URLSearchParams, k: string): number | null => {
  if (!q.has(k)) return null;
  const raw = q.get(k) ?? "";
  if (raw === "" || raw === "na") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : NaN;
};
const r = (v: number | null, d: number) => (v == null ? "na" : String(+v.toFixed(d)));

/** Into URL parameters (readable, versioned). Unknown stays "na" rather than taking a default. */
export function toQuery(s: ScenarioState): URLSearchParams {
  const q = new URLSearchParams();
  q.set("v", String(s.v)); q.set("m", s.material); q.set("f", s.form); q.set("size", r(s.size_m, 6));
  q.set("o2", r(s.o2, 4)); q.set("p", r(s.p_kpa, 2)); q.set("u", r(s.u_m_s, 3)); q.set("g", r(s.g, 3));
  q.set("pre", s.preset); if (s.evidence.length) q.set("ev", s.evidence.join(",")); q.set("lay", s.layers.join(",")); q.set("seed", String(s.seed)); q.set("t", String(+s.t_s.toFixed(2)));
  return q;
}

/** From URL parameters. Returns the state and any problems; with problems the caller keeps the previous state. */
export function fromQuery(q: URLSearchParams, base: ScenarioState = defaultScenario()): { state: ScenarioState; problems: Problem[] } {
  if (!q.has("v")) return { state: base, problems: [] };
  const problems: Problem[] = [];
  const v = Number(q.get("v"));
  if (v !== SCENARIO_VERSION) problems.push({ field: "v", why: `version ${q.get("v")} is not ${SCENARIO_VERSION}` });
  const m = (q.get("m") ?? base.material) as Material;
  const f = (q.get("f") ?? base.form) as FuelForm;
  const pre = (q.get("pre") ?? "custom") as MissionPreset;
  if (!PRESET_IDS.includes(pre)) problems.push({ field: "preset", why: "unknown preset" });
  const pick = (k: string, fallback: number | null) => (q.has(k) ? num(q, k) : fallback);
  const state: ScenarioState = {
    v: SCENARIO_VERSION, material: m, form: f, size_m: pick("size", base.size_m), o2: pick("o2", base.o2), p_kpa: pick("p", base.p_kpa), u_m_s: pick("u", base.u_m_s), g: pick("g", base.g),
    preset: PRESET_IDS.includes(pre) ? pre : "custom",
    evidence: (q.get("ev") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8),
    layers: (q.get("lay") ?? base.layers.join(",")).split(",").filter(Boolean).slice(0, 10),
    seed: Number.isInteger(Number(q.get("seed"))) ? Number(q.get("seed")) : base.seed,
    t_s: Number.isFinite(Number(q.get("t"))) ? Math.max(0, Number(q.get("t"))) : 0,
  };
  problems.push(...validate(state));
  return { state, problems };
}

/** JSON export with a version and the same validation on import. */
export const toJson = (s: ScenarioState) => JSON.stringify({ schema: "zgf-scenario/1", ...s }, null, 1);
export function fromJson(text: string): { state: ScenarioState | null; problems: Problem[] } {
  let o: Record<string, unknown>;
  try { o = JSON.parse(text); } catch { return { state: null, problems: [{ field: "json", why: "not valid JSON" }] }; }
  if (o.schema !== "zgf-scenario/1") return { state: null, problems: [{ field: "schema", why: "not a zgf-scenario/1 document" }] };
  const q = new URLSearchParams();
  const s = o as unknown as ScenarioState;
  const base = defaultScenario();
  const merged: ScenarioState = { ...base, ...s, v: s.v };
  toQuery(merged).forEach((v, k) => q.set(k, v));
  q.set("v", String(s.v));
  const res = fromQuery(q);
  return { state: res.problems.length ? null : res.state, problems: res.problems };
}

/** Unit conversions used by every view. */
export const U = {
  pct: (x: number | null) => (x == null ? "unknown" : `${(x * 100).toFixed(1)}%`),
  kpa: (p: number | null) => (p == null ? "unknown" : `${p.toFixed(1)} kPa`),
  cms: (u: number | null) => (u == null ? "unknown" : `${(u * 100).toFixed(0)} cm/s`),
  g: (g: number | null) => (g == null ? "unknown" : g === 0 ? "free fall (0 g)" : `${g.toFixed(3)} g`),
  mm: (m: number | null) => (m == null ? "unknown" : `${(m * 1000).toFixed(2)} mm`),
};
