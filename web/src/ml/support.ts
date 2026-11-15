/**
 * The support gate. A number is shown only when the query lies where the model was trained; otherwise the model
 * abstains with every reason that applies, and no fallback number is produced.
 */
import type { ModelResult } from "../lib/scenario";
import { FlexInput, FlexModelDoc, predictK } from "./inference";

export interface Query extends Partial<FlexInput> {
  material: string;          // "Methanol", "Heptane", "PMMA", ...
  form: string;              // "droplet", "sheet", ...
  g: number | null;          // fraction of g0
  u_m_s: number | null;      // forced airflow
}

const band = (p: number, bands: number[]) => { const atm = p / 101.325; return bands.reduce((b, x) => (Math.abs(x - atm) < Math.abs(b - atm) ? x : b), bands[0]); };
const diluent = (co2: number, he: number) => (he > 0 ? "He" : co2 > 0 ? "CO2" : "N2");

export function supportCheck(doc: FlexModelDoc, q: Query): { ok: boolean; reasons: string[]; distance: number | null; nearest: { row: number; test: string; d: number }[] } {
  const s = doc.support;
  const reasons: string[] = [];
  const solid = /pmma|acrylic|sheet|rod|fabric|sibal|nomex/i.test(q.material) || ["sheet", "rod", "sphere"].includes(q.form);
  if (solid) reasons.push(`${q.material} as a ${q.form} is a solid; this model was trained only on liquid FLEX droplets`);
  else if (!(q.material in s.fuels)) reasons.push(`fuel "${q.material}" is not in the training data (methanol, heptane)`);
  if (q.form !== s.form && !solid) reasons.push(`form "${q.form}" is not a droplet`);
  if (q.g == null) reasons.push("gravity is unknown; every FLEX row was taken in free fall");
  else if (q.g > 1e-3) reasons.push(`gravity ${q.g.toFixed(3)} g is outside the data: every FLEX row was taken in free fall (0 g)${q.g > 0.1 && q.g < 0.2 ? "; lunar gravity has no FLEX row" : ""}`);
  if (q.u_m_s == null) reasons.push("airflow is unknown; FLEX atmospheres were quiescent");
  else if (q.u_m_s > 1e-3) reasons.push(`forced airflow ${(q.u_m_s * 100).toFixed(0)} cm/s is not a model input: FLEX atmospheres were quiescent, so the dependence is not established`);
  const need: (keyof FlexInput)[] = ["x_o2", "p_kpa", "x_n2", "x_co2", "x_he", "d0_mm"];
  for (const k of need) {
    const v = q[k] as number | undefined;
    if (v == null || !Number.isFinite(v)) reasons.push(`${k} is unknown`);
  }
  if (reasons.length) return { ok: false, reasons, distance: null, nearest: [] };
  const fs = s.fuels[q.material];
  const x = q as Required<Query>;
  const sum = x.x_o2 + x.x_n2 + x.x_co2 + x.x_he;
  if (Math.abs(sum - 1) > 0.02) reasons.push(`mole fractions add up to ${sum.toFixed(3)}, not 1`);
  if ([x.x_o2, x.x_n2, x.x_co2, x.x_he].some((v) => v < 0)) reasons.push("a negative mole fraction");
  if (x.p_kpa <= 0) reasons.push("pressure must be above zero");
  for (const k of s.distance_features) {
    const [lo, hi] = fs.range[k];
    const v = x[k as keyof FlexInput] as number;
    if (v < lo - 1e-9 || v > hi + 1e-9) reasons.push(`${k} = ${+v.toFixed(4)} is outside the ${q.material} training range ${lo} to ${hi}`);
  }
  const reg = `${q.material}|${diluent(x.x_co2, x.x_he)}|${band(x.p_kpa, s.pressure_bands_atm).toFixed(1)}`;
  if (!s.regimes.includes(reg)) reasons.push(`no ${q.material} test with ${diluent(x.x_co2, x.x_he)} as diluent near ${band(x.p_kpa, s.pressure_bands_atm)} atm`);
  // distance to the nearest training row of the same fuel, in units of that fuel's spread
  const names = s.distance_features;
  const mine = doc.train.filter((r) => r.fuel === q.material);
  const d = mine.map((r) => ({ r, d: Math.hypot(...names.map((n) => ((x[n as keyof FlexInput] as number) - (r[n as keyof FlexInput] as number)) / fs.scale[n])) }))
    .sort((a, b) => a.d - b.d || a.r.row - b.r.row);
  const nearest = d.slice(0, 3).map(({ r, d }) => ({ row: r.row, test: r.test, d: +d.toFixed(4) }));
  const distance = d.length ? d[0].d : null;
  if (distance != null && distance > fs.max_distance) reasons.push(`the nearest training row is ${distance.toFixed(2)} spread units away; support ends at ${fs.max_distance.toFixed(2)} (1.5 × the 95th percentile within the data)`);
  return { ok: reasons.length === 0, reasons, distance, nearest };
}

/** The whole call: gate, then (only then) the number. */
export function runModel(doc: FlexModelDoc, q: Query): ModelResult {
  const gate = supportCheck(doc, q);
  const input: ModelResult["input"] = { material: q.material, form: q.form, g: q.g, u_m_s: q.u_m_s, x_o2: q.x_o2 ?? null, p_kpa: q.p_kpa ?? null, x_n2: q.x_n2 ?? null, x_co2: q.x_co2 ?? null, x_he: q.x_he ?? null, d0_mm: q.d0_mm ?? null };
  const base = { task: "FLEX droplet burning-rate constant", model_id: doc.model_id, target: "K", unit: doc.target.unit, input, nearest: gate.nearest };
  if (!gate.ok) return { ...base, estimate: null, status: "abstain", reasons: gate.reasons, uncertainty: null };
  const k = predictK(doc.model, { fuel: q.material, x_o2: q.x_o2!, p_kpa: q.p_kpa!, x_n2: q.x_n2!, x_co2: q.x_co2!, x_he: q.x_he!, d0_mm: q.d0_mm! });
  return { ...base, estimate: k, status: "supported", reasons: [], uncertainty: { kind: doc.uncertainty.kind, p50: doc.uncertainty.abs_err.p50, p80: doc.uncertainty.abs_err.p80 } };
}
