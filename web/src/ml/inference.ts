/**
 * Static inference for the FLEX burning-rate regressor trained by pipeline/train_flex.py.
 * The browser does not train anything: it runs the exported standardisation and dot product.
 * Golden vectors in the artifact pin this arithmetic to the Python pipeline (src/ml/inference.test.ts).
 */
export interface FlexInput { fuel: string; x_o2: number; p_kpa: number; x_n2: number; x_co2: number; x_he: number; d0_mm: number }
export interface ExportedModel { name: "ridge" | "ridge_phys"; features: string[]; alpha: number; mean: number[]; scale: number[]; coef: number[]; intercept: number }
export interface TrainRow extends FlexInput { row: number; test: string; ident: string; k: number; group: string }
export interface FuelSupport { n: number; range: Record<string, [number, number]>; scale: Record<string, number>; nn_p95: number; max_distance: number }
export interface SupportDoc { fuels: Record<string, FuelSupport>; regimes: string[]; distance_features: string[]; gravity_g: number; airflow_m_s: number; form: string; pressure_bands_atm: number[] }
export interface FlexModelDoc {
  klass: "model"; schema: string; model_id: string; task: string;
  target: { name: string; unit: string; header_as_written: string; read_as: string; why: string };
  model: ExportedModel; feature_why: Record<string, string>; support: SupportDoc; train: TrainRow[];
  golden: { input: FlexInput; k_python: number; k_exported: number }[];
  seed: number; versions: Record<string, string>; dataset_sha256: string;
  source: { accession: string; file: string; artifact: string; sha256: string; ledger_seq: number };
  uncertainty: { kind: string; abs_err: { p50: number; p80: number; p95: number }; by_fuel_mae: Record<string, number> };
  scope: string; command: string;
}

export function featureVector(name: ExportedModel["name"], r: FlexInput): number[] {
  const h = r.fuel === "Heptane" ? 1 : 0;
  if (name === "ridge_phys") return [h, r.x_o2, Math.log(r.p_kpa), r.x_co2, r.x_he, r.d0_mm, h * r.x_o2, h * r.x_co2, h * r.x_he];
  return [h, r.x_o2, r.p_kpa, r.x_n2, r.x_co2, r.x_he, r.d0_mm];
}

/** K in mm²/s. Call only after the support gate said yes. */
export function predictK(m: ExportedModel, r: FlexInput): number {
  const x = featureVector(m.name, r);
  if (x.length !== m.coef.length) throw new Error("feature vector does not match the exported model");
  let y = m.intercept;
  for (let i = 0; i < x.length; i++) y += (m.coef[i] * (x[i] - m.mean[i])) / m.scale[i];
  return y;
}

/** Contribution of each input to this prediction, in mm²/s, relative to the training mean. Sums to K minus intercept. */
export function contributions(m: ExportedModel, r: FlexInput): { name: string; value: number }[] {
  const x = featureVector(m.name, r);
  return m.features.map((name, i) => ({ name, value: (m.coef[i] * (x[i] - m.mean[i])) / m.scale[i] }));
}
