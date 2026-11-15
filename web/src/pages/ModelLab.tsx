import { useEffect, useMemo, useState } from "react";
import { PageProps } from "./stubs";
import { useData, fmtInt } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { useReceipt } from "../components/Receipt";
import { LabTabs, download, pushQuery, replaceQuery } from "../components/LabTabs";
import { FlexModelDoc, contributions } from "../ml/inference";
import { runModel, Query } from "../ml/support";
import { Scatter } from "../viz/Scatter";
import { LineChart } from "../viz/LineChart";
import { href } from "../app/router";

interface EvalRow { row: number; test: string; fuel: string; group: string; atmos: string; k: number; fold: number; selected: number; fuel_median: number; [m: string]: number | string }
interface Metric { n: number; mae: number; rmse: number; r2: number | null; bias: number; by_fuel?: Record<string, Metric> }
interface EvalDoc {
  model_id: string; dataset_sha256: string; winner: string; n_rows: number; n_groups: number; n_folds: number; grouping_rule: string;
  candidates: Record<string, string>; metrics: Record<string, Metric>; rows: EvalRow[];
  stress_leave_one_atmosphere_out: { held_out: string; n: number; fuel_median: number; ridge: number; ridge_phys: number }[];
  audit: { n_table_rows: number; n_included: number; n_excluded: number; excluded: { why: string; n: number; rows: number[] }[]; by_fuel: Record<string, number>; groups: number; target: Record<string, number | string>; exact_duplicates: number[][] };
  limits: string[]; versions: Record<string, string>;
}

type Diluent = "N2" | "CO2" | "He";
interface Q { material: string; form: string; g: number; u: number; o2: number; p: number; dil: Diluent; xd: number; d0: number }
const SUPPORTED: Q = { material: "Methanol", form: "droplet", g: 0, u: 0, o2: 0.21, p: 101.3, dil: "N2", xd: 0, d0: 2.0 };
const UNSUPPORTED: Q = { material: "PMMA", form: "sheet", g: 0.165, u: 0.1, o2: 0.34, p: 56.5, dil: "N2", xd: 0, d0: 2.0 };

function toQuery(q: Q): URLSearchParams {
  return new URLSearchParams({ m: q.material, f: q.form, g: String(q.g), u: String(q.u), o2: String(q.o2), p: String(q.p), dil: q.dil, xd: String(q.xd), d0: String(q.d0) });
}
function fromQuery(s: URLSearchParams): Q {
  const n = (k: string, d: number) => { const v = Number(s.get(k)); return s.has(k) && Number.isFinite(v) ? v : d; };
  const dil = (s.get("dil") as Diluent) ?? "N2";
  return { material: s.get("m") ?? SUPPORTED.material, form: s.get("f") ?? SUPPORTED.form, g: n("g", 0), u: n("u", 0), o2: n("o2", 0.21), p: n("p", 101.3),
    dil: ["N2", "CO2", "He"].includes(dil) ? dil : "N2", xd: n("xd", 0), d0: n("d0", 2) };
}
const asQuery = (q: Q): Query => {
  const co2 = q.dil === "CO2" ? q.xd : 0, he = q.dil === "He" ? q.xd : 0;
  return { material: q.material, form: q.form, g: q.g, u_m_s: q.u, x_o2: q.o2, p_kpa: q.p, x_co2: +co2.toFixed(3), x_he: +he.toFixed(3), x_n2: +(1 - q.o2 - co2 - he).toFixed(3), d0_mm: q.d0 };
};
const FEATURE_LABEL: Record<string, string> = { fuel_heptane: "fuel is heptane", x_o2: "oxygen", ln_p_kpa: "ln pressure", p_kpa: "pressure", x_n2: "nitrogen", x_co2: "carbon dioxide", x_he: "helium", d0_mm: "initial diameter",
  heptane_x_o2: "heptane × oxygen", heptane_x_co2: "heptane × CO₂", heptane_x_he: "heptane × helium" };

function Ctl({ label, value, children, hint }: { label: string; value: string; children: React.ReactNode; hint?: string }) {
  return <label className="lc"><span className="lc__top"><span>{label}</span><span className="lc__val">{value}</span></span>{children}{hint && <span className="lc__hint">{hint}</span>}</label>;
}

export function ModelLab({ route }: PageProps) {
  const doc = useData<FlexModelDoc>("ml/flex_k_model.json");
  const ev = useData<EvalDoc>("ml/flex_k_eval.json");
  const receipt = useReceipt();
  const [q, setQ] = useState<Q>(() => (route.query.has("m") ? fromQuery(route.query) : SUPPORTED));
  useEffect(() => { if (route.query.has("m")) setQ(fromQuery(route.query)); }, [route.query.toString()]);   // Back/Forward
  useEffect(() => { replaceQuery("/model", toQuery(q)); }, [q]);
  const set = (p: Partial<Q>) => setQ((x) => ({ ...x, ...p }));
  const demo = (d: Q) => { pushQuery("/model", toQuery(d)); setQ(d); };

  const result = useMemo(() => (doc.data ? runModel(doc.data, asQuery(q)) : null), [doc.data, q]);
  const contrib = useMemo(() => (doc.data && result?.status === "supported" ? contributions(doc.data.model, { ...(asQuery(q) as Required<Query>), fuel: q.material }) : []), [doc.data, result, q]);
  const isDroplet = q.form === "droplet";

  const openRow = (row: number) => {
    const d = doc.data; if (!d) return;
    const r = d.train.find((x) => x.row === row);
    if (!r) return;
    receipt({ title: `FLEX test ${r.test} (${r.ident})`, klass: "observed", rows: [
      ["record", `${d.source.accession}, ${d.source.file}`], ["row in file", String(r.row + 1)], ["file SHA-256", <span className="mono">{d.source.sha256}</span>], ["ledger entry", String(d.source.ledger_seq)],
      ["fuel", r.fuel], ["oxygen", `${r.x_o2} mole fraction`], ["pressure", `${r.p_kpa} kPa (from mmHg × 0.1333224)`], ["CO₂ / He", `${r.x_co2} / ${r.x_he}`], ["initial diameter", `${r.d0_mm} mm`],
      ["measured K", `${r.k} mm²/s (header "Burning rate; mm", read as mm²/s)`], ["regime (group)", <span className="mono">{r.group}</span>]],
      notes: ["A NASA measurement used for training. Burn time, extinction diameter and test end were never model inputs."] });
  };
  const openModel = () => {
    const d = doc.data; if (!d) return;
    receipt({ title: "FLEX burning-rate regressor", klass: "model", rows: [
      ["model ID", <span className="mono">{d.model_id}</span>], ["family", `${d.model.name}, alpha ${d.model.alpha}`], ["inputs", d.model.features.map((f) => FEATURE_LABEL[f] ?? f).join(", ")],
      ["training rows", `${d.train.length} rows of ${d.source.accession}`], ["dataset SHA-256", <span className="mono">{d.dataset_sha256}</span>], ["source file SHA-256", <span className="mono">{d.source.sha256}</span>],
      ["versions", Object.entries(d.versions).map(([k, v]) => `${k} ${v}`).join(", ")], ["seed", String(d.seed)], ["reproduce", <span className="mono">{d.command}</span>]],
      notes: [d.scope, `Uncertainty shown: ${d.uncertainty.kind}.`] });
  };

  // d² curve: the predicted K against the nearest measured rows, same starting diameter
  const curve = useMemo(() => {
    if (!doc.data || !result || result.status !== "supported" || result.estimate == null) return null;
    const near = result.nearest.map((n) => doc.data!.train.find((r) => r.row === n.row)!).filter(Boolean).slice(0, 2);
    const kmax = Math.max(result.estimate, ...near.map((r) => r.k));
    const T = (q.d0 * q.d0) / Math.min(result.estimate, ...near.map((r) => r.k));
    const N = 80;
    const t = Array.from({ length: N + 1 }, (_, i) => (i / N) * T);
    const sq = (k: number) => t.map((x) => Math.max(0, q.d0 * q.d0 - k * x));
    return { t, kmax, series: [
      { id: "pred", name: "model", color: "var(--g-micro)", values: sq(result.estimate) },
      ...near.map((r, i) => ({ id: "n" + i, name: `test ${r.test}`, color: i ? "var(--ink-3)" : "var(--ink-2)", dash: "5 4", values: sq(r.k) })),
    ] };
  }, [doc.data, result, q.d0]);

  const e = ev.data;
  const best = e ? e.metrics.selected : null;
  const base = e ? e.metrics.fuel_median : null;

  return (
    <div className="stack" style={{ ["--gap" as string]: "var(--s-5)" }}>
      <LabTabs at="/model" />
      <div className="labhead">
        <div>
          <h1>Model Lab</h1>
          <p className="lede">A regressor trained on NASA's FLEX droplets estimates the burning-rate constant K. It is scored on regimes it never saw, and it refuses what it was never taught.</p>
        </div>
        <div className="demo-row">
          <button className="btn btn--primary" onClick={() => demo(SUPPORTED)}>Supported FLEX case</button>
          <button className="btn btn--quiet" onClick={() => demo(UNSUPPORTED)}>PMMA on the Moon</button>
        </div>
      </div>

      {doc.error && <div className="banner">The model file did not load: {doc.error}. Run <span className="mono">python pipeline/train_flex.py</span>.</div>}

      <div className="lab">
        <aside className="lab__controls" aria-label="Model inputs">
          <h2>Inputs known before ignition</h2>
          <Ctl label="Material" value="">
            <select value={q.material} onChange={(ev) => set({ material: ev.target.value, form: ev.target.value === "PMMA" ? "sheet" : "droplet" })} aria-label="Material">
              <option>Methanol</option><option>Heptane</option><option value="Ethanol">Ethanol (not in data)</option><option>PMMA</option>
            </select>
          </Ctl>
          <Ctl label="Gravity" value={q.g === 0 ? "0 g" : `${q.g} g`}>
            <div className="seg" role="group" aria-label="Gravity">
              {[[0, "Free fall"], [0.165, "Moon"], [1, "Earth"]].map(([g, l]) => <button key={l} type="button" aria-pressed={q.g === g} onClick={() => set({ g: g as number })}>{l}</button>)}
            </div>
          </Ctl>
          <Ctl label="Oxygen" value={`${(q.o2 * 100).toFixed(0)}%`}>
            <input type="range" min={0.1} max={0.4} step={0.01} value={q.o2} onChange={(ev) => set({ o2: +ev.target.value })} aria-label="Oxygen mole fraction" />
          </Ctl>
          <Ctl label="Pressure" value={`${q.p.toFixed(1)} kPa`} hint={`${(q.p / 101.325).toFixed(2)} atm`}>
            <input type="range" min={40} max={320} step={0.5} value={q.p} onChange={(ev) => set({ p: +ev.target.value })} aria-label="Pressure in kPa" />
          </Ctl>
          <Ctl label="Diluent besides nitrogen" value={q.dil === "N2" ? "none" : `${(q.xd * 100).toFixed(0)}% ${q.dil}`}>
            <div className="seg" role="group" aria-label="Diluent">
              {(["N2", "CO2", "He"] as Diluent[]).map((d) => <button key={d} type="button" aria-pressed={q.dil === d} onClick={() => set({ dil: d, xd: d === "N2" ? 0 : Math.max(q.xd, 0.15) })}>{d === "N2" ? "None" : d === "CO2" ? "CO₂" : "He"}</button>)}
            </div>
            {q.dil !== "N2" && <input type="range" min={0.05} max={0.5} step={0.01} value={q.xd} onChange={(ev) => set({ xd: +ev.target.value })} aria-label={`${q.dil} mole fraction`} />}
          </Ctl>
          <Ctl label="Initial droplet diameter" value={`${q.d0.toFixed(2)} mm`}>
            <input type="range" min={1} max={5} step={0.05} value={q.d0} onChange={(ev) => set({ d0: +ev.target.value })} aria-label="Initial diameter in mm" disabled={!isDroplet} />
          </Ctl>
          <Ctl label="Forced airflow" value={`${(q.u * 100).toFixed(0)} cm/s`} hint="Locked to the FLEX regime: still air. Any other value makes the model abstain.">
            <input type="range" min={0} max={0.3} step={0.01} value={q.u} onChange={(ev) => set({ u: +ev.target.value })} aria-label="Forced airflow in m/s" />
          </Ctl>
          <p className="lc__hint">Nitrogen fills the rest: {(Math.max(0, 1 - q.o2 - (q.dil === "N2" ? 0 : q.xd)) * 100).toFixed(0)}%.</p>
        </aside>

        <section className="lab__view" aria-live="polite">
          {result && result.status === "supported" && result.estimate != null ? (
            <div className="result" data-klass="model">
              <div className="result__badges"><KlassBadge k="model" onClick={openModel} note={doc.data?.model_id} /></div>
              <div className="label">Estimated burning-rate constant K</div>
              <div className="result__k">{result.estimate.toFixed(3)}<small>mm²/s</small></div>
              <p className="result__line">For a {q.d0.toFixed(2)} mm {q.material.toLowerCase()} droplet in {(q.o2 * 100).toFixed(0)}% oxygen at {(q.p / 101.325).toFixed(2)} atm, the d² law gives a burn-out time of about <b>{((q.d0 * q.d0) / result.estimate).toFixed(1)} s</b> if K held from ignition to the end.</p>
              <p className="result__limit">On held-out regimes half the errors were below {result.uncertainty?.p50.toFixed(3)} and four in five below {result.uncertainty?.p80.toFixed(3)} mm²/s. That is the observed out-of-fold error, not a calibrated interval.</p>
            </div>
          ) : result ? (
            <div className="result result--abstain" data-klass="model">
              <div className="abstain">
                <div className="abstain__icon" aria-hidden="true">!</div>
                <div>
                  <div className="abstain__title">The model abstains</div>
                  <p className="result__line" style={{ marginTop: 6 }}>No number is shown: this question lies outside what NASA's FLEX droplets can support.</p>
                  <ul className="reasons">{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn btn--quiet btn--sm" onClick={() => demo(SUPPORTED)}>Show a supported FLEX case</button>
                    {q.material === "PMMA" && <a className="btn btn--ghost btn--sm" href={href("/material") + `?v=1&m=PMMA&f=sheet&o2=${q.o2}&p=${q.p}&u=${q.u}&g=${q.g}&pre=custom`}>Compare PMMA with NASA tests instead</a>}
                  </div>
                </div>
              </div>
            </div>
          ) : <div className="result"><p className="note">Loading the model…</p></div>}

          {curve && (
            <div className="panel" data-klass="model">
              <div className="panel__head"><div><div className="panel__title">Squared diameter against time</div><div className="panel__sub">D²(t) = D₀² − K t, with the model's K and the measured K of the two nearest training tests, from the same starting diameter.</div></div><KlassBadge k="model" /></div>
              <LineChart x={curve.t} series={curve.series} xLabel="time, s" yLabel="D², mm²" height={220} fmtX={(v) => v.toFixed(1)} fmtY={(v) => v.toFixed(2)} ariaLabel="Squared droplet diameter against time" />
              <p className="note" style={{ marginTop: 8 }}>The line ends where the law reaches zero. NASA's tests end at the visible extinction diameter, earlier; the <a href={href("/lab") + "?mode=droplet"}>Fire Lab</a> draws both.</p>
            </div>
          )}

          {contrib.length > 0 && (
            <div className="panel panel--tight">
              <div className="panel__head"><div><div className="panel__title">What moved this estimate</div><div className="panel__sub">Contribution of each input, in mm²/s, against the training average ({doc.data!.model.intercept.toFixed(3)} mm²/s).</div></div></div>
              <div className="contrib">
                {contrib.map((c) => {
                  const w = Math.min(50, Math.abs(c.value) / 0.25 * 50);
                  return (
                    <div className="contrib__row" key={c.name}>
                      <span>{FEATURE_LABEL[c.name] ?? c.name}</span>
                      <span className="contrib__bar"><span className={c.value < 0 ? "neg" : ""} style={{ left: c.value < 0 ? `${50 - w}%` : "50%", width: `${w}%` }} /></span>
                      <span className="num" style={{ textAlign: "right" }}>{c.value >= 0 ? "+" : ""}{c.value.toFixed(3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <aside className="lab__drawer" aria-label="Training support">
          <h2>Nearest training tests</h2>
          {result && result.nearest.length > 0 ? (
            <div className="nearest">
              {result.nearest.map((n) => {
                const r = doc.data?.train.find((x) => x.row === n.row);
                return r ? (
                  <button key={n.row} onClick={() => openRow(n.row)}>
                    <span><b>Test {r.test}</b> · {r.fuel}, K = {r.k} mm²/s</span>
                    <span className="nearest__meta">{(r.x_o2 * 100).toFixed(0)}% O₂, {r.p_kpa.toFixed(1)} kPa{r.x_co2 ? `, ${(r.x_co2 * 100).toFixed(0)}% CO₂` : ""}{r.x_he ? `, ${(r.x_he * 100).toFixed(0)}% He` : ""}, D₀ {r.d0_mm} mm · distance {n.d.toFixed(2)}</span>
                  </button>
                ) : null;
              })}
            </div>
          ) : <p className="note">{q.material === "PMMA" ? "PMMA has no FLEX row. A solid sheet is compared with NASA's PMMA tests in Material Evidence." : "No training row of this fuel."}</p>}
          <hr className="rule" style={{ margin: "16px 0" }} />
          <h2>Scope</h2>
          <p className="note">{doc.data?.scope}</p>
          <p className="note" style={{ marginTop: 8 }}>Source: <button className="linklike" onClick={openModel}>{doc.data?.source.file}</button></p>
        </aside>
      </div>

      {e && best && base && (
        <section className="section stack">
          <div className="section__head"><h2 className="claim claim--m">On regimes it never saw, the model's error was {(base.mae / best.mae).toFixed(1)} times smaller than a per-fuel median.</h2><KlassBadge k="model" /></div>
          <div className="metric-grid">
            <div><div className="stat__label">Mean absolute error, nested</div><div className="stat__value num">{best.mae.toFixed(3)}<small>mm²/s</small></div><div className="stat__note">baseline (fuel median): {base.mae.toFixed(3)}</div></div>
            <div><div className="stat__label">RMSE</div><div className="stat__value num">{best.rmse.toFixed(3)}<small>mm²/s</small></div><div className="stat__note">baseline: {base.rmse.toFixed(3)}</div></div>
            <div><div className="stat__label">R² out of fold</div><div className="stat__value num">{best.r2?.toFixed(2)}</div><div className="stat__note">baseline: {base.r2?.toFixed(2)}</div></div>
            <div><div className="stat__label">Rows · regimes · folds</div><div className="stat__value num">{fmtInt(e.n_rows)} · {e.n_groups} · {e.n_folds}</div><div className="stat__note">no regime on both sides of a fold</div></div>
          </div>
          <div className="grid cols-2">
            <div className="panel" data-klass="model">
              <div className="panel__head"><div><div className="panel__title">Predicted against measured, out of fold</div><div className="panel__sub">Each point was predicted by a model that never saw its regime. Click a point for its NASA row.</div></div></div>
              <Scatter ariaLabel="Parity plot of out-of-fold predictions against measured K" height={340} diagonal
                xLabel="measured K, mm²/s" yLabel="predicted K, mm²/s" xDomain={[0, 1.15]} yDomain={[0, 1.15]}
                groups={[{ id: "Methanol", name: "Methanol", shape: "circle", color: "var(--g-micro)" }, { id: "Heptane", name: "Heptane", shape: "triangle", color: "var(--g-micro)", hollow: true }]}
                points={e.rows.map((r) => ({ x: r.k, y: r.selected, group: r.fuel, title: `Test ${r.test}`, tip: [["measured", `${r.k}`], ["predicted", r.selected.toFixed(3)], ["fold", String(r.fold + 1)], ["regime", r.group]], ref: r.row }))}
                onPick={(p) => openRow(p.ref as number)} fmtX={(v) => v.toFixed(1)} fmtY={(v) => v.toFixed(1)} />
            </div>
            <div className="panel" data-klass="model">
              <div className="panel__head"><div><div className="panel__title">Residuals by oxygen</div><div className="panel__sub">Predicted minus measured. Points far from zero are where the inputs do not explain K.</div></div></div>
              <Scatter ariaLabel="Residuals against oxygen" height={340} xLabel="oxygen, mole fraction" yLabel="residual, mm²/s" xDomain={[0.1, 0.36]} yDomain={[-0.4, 0.4]}
                groups={[{ id: "Methanol", name: "Methanol", shape: "circle", color: "var(--g-micro)" }, { id: "Heptane", name: "Heptane", shape: "triangle", color: "var(--g-micro)", hollow: true }]}
                points={e.rows.map((r) => { const t = doc.data?.train.find((x) => x.row === r.row); return { x: t?.x_o2 ?? 0, y: Math.max(-0.4, Math.min(0.4, r.selected - r.k)), group: r.fuel, title: `Test ${r.test}`, tip: [["residual", (r.selected - r.k).toFixed(3)], ["regime", r.group]], ref: r.row }; })}
                curves={[{ pts: [[0.1, 0], [0.36, 0]], label: "" }]}
                onPick={(p) => openRow(p.ref as number)} fmtX={(v) => v.toFixed(2)} fmtY={(v) => v.toFixed(2)} />
            </div>
          </div>

          <div className="panel">
            <div className="panel__head"><div><div className="panel__title">Every candidate on the same out-of-fold rows</div><div className="panel__sub">{e.grouping_rule}.</div></div>
              <div className="exportbar">
                <button className="btn btn--quiet btn--sm" onClick={() => download("flex_k_oof.csv", ["row_in_file,test,fuel,group,fold,measured_k_mm2_s," + Object.keys(e.metrics).join(","), ...e.rows.map((r) => [r.row + 1, r.test, r.fuel, `"${r.group}"`, r.fold + 1, r.k, ...Object.keys(e.metrics).map((m) => r[m])].join(","))].join("\n") + "\n", "text/csv")}>Out-of-fold CSV</button>
                <a className="btn btn--quiet btn--sm" href="./data/v1/ml/MODEL_CARD_FLEX.md" download>Model card</a>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Model</th><th>How it works</th><th className="r">MAE</th><th className="r">RMSE</th><th className="r">R²</th><th className="r">MAE methanol</th><th className="r">MAE heptane</th></tr></thead>
                <tbody>
                  {["global_median", "fuel_median", "ridge", "ridge_phys", "extra_trees", "selected"].map((n) => {
                    const m = e.metrics[n];
                    return (
                      <tr key={n}>
                        <td className={n === "selected" ? "strong" : ""}>{n.replace("_", " ")}{n === "selected" && <span className="badge-best">shipped procedure</span>}</td>
                        <td className="note">{e.candidates[n]}</td>
                        <td className="r num">{m.mae.toFixed(4)}</td><td className="r num">{m.rmse.toFixed(4)}</td><td className="r num">{m.r2?.toFixed(3)}</td>
                        <td className="r num">{m.by_fuel?.Methanol.mae.toFixed(4)}</td><td className="r num">{m.by_fuel?.Heptane.mae.toFixed(4)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid cols-2">
            <div className="panel">
              <div className="panel__head"><div><div className="panel__title">Stress test: leave one atmosphere out</div><div className="panel__sub">All rows of one diluent and pressure band held out at once. MAE in mm²/s.</div></div></div>
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Held out</th><th className="r">N</th><th className="r">fuel median</th><th className="r">ridge</th><th className="r">ridge, physics inputs</th></tr></thead>
                <tbody>{e.stress_leave_one_atmosphere_out.map((s) => <tr key={s.held_out}><td>{s.held_out}</td><td className="r num">{s.n}</td><td className="r num">{s.fuel_median.toFixed(3)}</td><td className="r num">{s.ridge.toFixed(3)}</td><td className="r num">{s.ridge_phys.toFixed(3)}</td></tr>)}</tbody>
              </table></div>
            </div>
            <div className="panel">
              <div className="panel__head"><div><div className="panel__title">Dataset audit</div><div className="panel__sub">Rows kept and left out, with the rule, fixed before evaluation.</div></div></div>
              <dl className="kv">
                <dt>table rows</dt><dd>{e.audit.n_table_rows}</dd>
                <dt>used</dt><dd>{e.audit.n_included} ({Object.entries(e.audit.by_fuel).map(([f, n]) => `${n} ${f.toLowerCase()}`).join(", ")})</dd>
                {e.audit.excluded.map((x) => <div key={x.why} style={{ display: "contents" }}><dt>left out</dt><dd>{x.n}: {x.why} (rows {x.rows.map((r) => r + 1).join(", ")})</dd></div>)}
                <dt>target K</dt><dd>median {String(e.audit.target.median)}, range {String(e.audit.target.min)} to {String(e.audit.target.max)} mm²/s</dd>
                <dt>exact duplicates</dt><dd>{e.audit.exact_duplicates.length}</dd>
                <dt>dataset hash</dt><dd className="mono">{e.dataset_sha256.slice(0, 24)}…</dd>
                <dt>versions</dt><dd>{Object.entries(e.versions).map(([k, v]) => `${k} ${v}`).join(", ")}</dd>
              </dl>
              <details className="fold" style={{ marginTop: 12 }}><summary>Limits</summary><ul className="reasons">{e.limits.map((l) => <li key={l}>{l}</li>)}</ul></details>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
