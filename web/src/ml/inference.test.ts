import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { contributions, FlexModelDoc, predictK } from "./inference";
import { runModel, supportCheck } from "./support";

const doc = JSON.parse(readFileSync(new URL("../../public/data/v1/ml/flex_k_model.json", import.meta.url), "utf8")) as FlexModelDoc;
const ev = JSON.parse(readFileSync(new URL("../../public/data/v1/ml/flex_k_eval.json", import.meta.url), "utf8"));

const air = { material: "Methanol", form: "droplet", g: 0, u_m_s: 0, x_o2: 0.21, p_kpa: 101.3, x_n2: 0.79, x_co2: 0, x_he: 0, d0_mm: 2.0 };

describe("browser inference of the FLEX regressor", () => {
  it("reproduces the Python pipeline on every published golden vector (1e-9 mm²/s)", () => {
    expect(doc.golden.length).toBeGreaterThanOrEqual(6);
    for (const g of doc.golden) expect(Math.abs(predictK(doc.model, g.input) - g.k_python)).toBeLessThan(1e-9);
  });
  it("contributions add up to the prediction", () => {
    const c = contributions(doc.model, { fuel: "Heptane", x_o2: 0.21, p_kpa: 101.3, x_n2: 0.79, x_co2: 0, x_he: 0, d0_mm: 3 });
    const k = predictK(doc.model, { fuel: "Heptane", x_o2: 0.21, p_kpa: 101.3, x_n2: 0.79, x_co2: 0, x_he: 0, d0_mm: 3 });
    expect(Math.abs(doc.model.intercept + c.reduce((a, b) => a + b.value, 0) - k)).toBeLessThan(1e-12);
  });
  it("gives a number for a supported FLEX case, with model ID, unit and nearest rows", () => {
    const r = runModel(doc, air);
    expect(r.status).toBe("supported");
    expect(r.estimate).not.toBeNull();
    expect(r.estimate!).toBeGreaterThan(0.2);
    expect(r.estimate!).toBeLessThan(1.2);
    expect(r.unit).toBe("mm²/s");
    expect(r.model_id).toBe(doc.model_id);
    expect(r.nearest.length).toBe(3);
  });
});

describe("support gate (AC08)", () => {
  it("abstains for PMMA and gives no number", () => {
    const r = runModel(doc, { ...air, material: "PMMA", form: "sheet" });
    expect(r.status).toBe("abstain");
    expect(r.estimate).toBeNull();
    expect(r.reasons.join(" ")).toMatch(/solid/);
  });
  it("abstains for lunar gravity and names it", () => {
    const r = runModel(doc, { ...air, g: 0.165 });
    expect(r.estimate).toBeNull();
    expect(r.reasons.join(" ")).toMatch(/free fall/);
    expect(r.reasons.join(" ")).toMatch(/lunar/);
  });
  it("abstains for an unknown fuel, forced airflow, and 1 g", () => {
    expect(runModel(doc, { ...air, material: "Ethanol" }).status).toBe("abstain");
    expect(runModel(doc, { ...air, u_m_s: 0.2 }).reasons.join(" ")).toMatch(/quiescent/);
    expect(runModel(doc, { ...air, g: 1 }).status).toBe("abstain");
  });
  it("does not accept a point inside every min-max range but far from the data jointly", () => {
    // high oxygen with high CO2 and the largest diameter: each value inside its range, the combination not tested
    const r = supportCheck(doc, { ...air, x_o2: 0.34, x_co2: 0.45, x_n2: 0.21, d0_mm: 4.0 });
    expect(r.ok).toBe(false);
  });
  it("rejects compositions that do not add up and unknown values", () => {
    expect(supportCheck(doc, { ...air, x_n2: 0.5 }).reasons.join(" ")).toMatch(/add up/);
    expect(supportCheck(doc, { ...air, p_kpa: undefined }).reasons.join(" ")).toMatch(/p_kpa is unknown/);
  });
});

describe("published evaluation (AC09)", () => {
  it("no group is on both sides of a fold, and the metric is recomputable from the OOF rows", () => {
    const folds = new Map<string, Set<number>>();
    for (const r of ev.rows) { if (!folds.has(r.group)) folds.set(r.group, new Set()); folds.get(r.group)!.add(r.fold); }
    for (const s of folds.values()) expect(s.size).toBe(1);
    const mae = ev.rows.reduce((a: number, r: { selected: number; k: number }) => a + Math.abs(r.selected - r.k), 0) / ev.rows.length;
    expect(Math.abs(mae - ev.metrics.selected.mae)).toBeLessThan(5e-4);
  });
  it("reports the baselines on the same rows", () => {
    for (const n of ["global_median", "fuel_median", "ridge", "ridge_phys", "extra_trees", "selected"]) expect(ev.metrics[n].n).toBe(ev.rows.length);
  });
});
