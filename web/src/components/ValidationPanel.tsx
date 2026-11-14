import { useMemo, useState } from "react";
import { href } from "../app/router";
import { fmtInt, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { ErrStats, ValidationDoc } from "../lib/types";
import { useReceipt } from "./Receipt";
import { Scatter, ScatterGroup, ScatterLegend, ScatterPoint } from "../viz/Scatter";

type Conv = "closer" | "row" | "atm";
const k1 = (s: ErrStats, key: keyof ErrStats) => (s.n ? (s[key] as number).toFixed(1) : "–");

/** The equilibrium model against the flame temperatures NASA put in its own tables. */
export function ValidationPanel({ compact = false }: { compact?: boolean }) {
  const v = useData<ValidationDoc>("validation.json");
  const [conv, setConv] = useState<Conv>("closer");
  const open = useReceipt();
  const groups = useMemo<ScatterGroup[]>(() => (v.data?.tables ?? []).map((t, i) => ({
    id: t.table, name: `${t.accession} ${/inverse/i.test(t.file) ? "inverse flames" : "normal flames"}`,
    shape: t.accession === "PSI-10" ? "triangle" : "square", color: "var(--g-micro)", hollow: i % 2 === 1,
  })), [v.data]);
  if (v.error) return <div className="empty"><p className="empty__title">No model check yet</p><p style={{ marginTop: 6 }}>It is written by the pipeline once the NASA tables are derived and Cantera is installed.</p></div>;
  if (!v.data) return <p className="note">Loading the model check…</p>;
  const d = v.data;
  const closer = new Map(d.tables.map((t) => [t.table, t.Tad.closer]));
  const model = (p: ValidationDoc["points"][number]) => (conv === "row" ? p.Tr : conv === "atm" ? p.Ta : closer.get(p.t) === "row_pressure" ? p.Tr : p.Ta);
  const points: ScatterPoint[] = d.points.map((p) => ({
    x: p.T, y: model(p), group: p.t, title: `${p.a}, row ${p.r + 1}`, ref: p,
    tip: [["fuel", p.f], ["NASA's Tad", `${p.T.toFixed(0)} K`], ["model", `${model(p).toFixed(0)} K`], ["difference", `${(model(p) - p.T >= 0 ? "+" : "") + (model(p) - p.T).toFixed(1)} K`], ["pressure in the row", `${p.p.toFixed(0)} kPa`]],
  }));
  const o = conv === "row" ? d.overall.row_pressure : conv === "atm" ? d.overall.one_atmosphere : d.overall.closer_convention_per_table;
  const one = d.tables.filter((t) => t.Tad.closer === "one_atmosphere");
  const counts = Object.fromEntries(d.tables.map((t) => [t.table, t.n_compared]));
  return (
    <section className="panel" data-klass="model">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">The flame model against NASA's own numbers</h2>
          <p className="panel__sub">{d.method}</p>
        </div>
        <KlassBadge k="model" note="checked against NASA table columns" />
      </div>
      <p className="claim claim--m" style={{ maxWidth: "46ch" }}>
        Across {fmtInt(d.overall.closer_convention_per_table.n)} rows of {d.tables.length} NASA tables, the model lands within {d.overall.closer_convention_per_table.mean_abs?.toFixed(1)} K of NASA's flame temperature on average.
      </p>
      {one.length > 0 && (
        <p className="doc" style={{ marginTop: 10, fontSize: "1rem" }}>
          One thing the comparison found: in {Array.from(new Set(one.map((t) => t.accession))).join(" and ")} the Tad column is reproduced only when the calculation is done at one atmosphere,
          although the tests ran between 0.5 and 3 bar. Read at the row's pressure, it is off by up to {Math.max(...one.map((t) => t.Tad.row_pressure.max_abs ?? 0)).toFixed(0)} K. Switch the convention below to see it.
        </p>
      )}
      <div className="row" style={{ justifyContent: "space-between", margin: "16px 0 8px" }}>
        <ScatterLegend groups={groups} counts={counts} />
        <div className="seg" role="group" aria-label="Pressure used by the model">
          <button type="button" aria-pressed={conv === "closer"} onClick={() => setConv("closer")}>Convention that fits each table</button>
          <button type="button" aria-pressed={conv === "row"} onClick={() => setConv("row")}>Row pressure for all</button>
          <button type="button" aria-pressed={conv === "atm"} onClick={() => setConv("atm")}>One atmosphere for all</button>
        </div>
      </div>
      <Scatter points={points} groups={groups} xLabel="NASA's Tad, K" yLabel="model, K" xDomain={[1300, 2900]} yDomain={[1300, 2900]} height={compact ? 340 : 400} diagonal
               ariaLabel="Parity plot: adiabatic flame temperature from the model against the Tad column of NASA's tables"
               fmtX={(x) => x.toFixed(0)} fmtY={(y) => y.toFixed(0)}
               onPick={(pt) => { const p = pt.ref as ValidationDoc["points"][number]; open({
                 title: `${p.a}, row ${p.r + 1}: model against NASA`, klass: "model",
                 rows: [["PSI record", <a href={href(`/evidence/${p.a}`)}>{p.a}</a>], ["fuel, as written", p.f], ["NASA's Tad", `${p.T} K`], ["model at the row's pressure", `${p.Tr} K (${p.p} kPa)`],
                   ["model at one atmosphere", `${p.Ta} K`], ["NASA's Zst", String(p.Z)], ["model Zst", String(p.Zm)], ["method", d.method], ["engine", d.engine]],
                 notes: [d.limits],
               }); }} />
      <p className="note" style={{ marginTop: 6 }}>
        With this convention: {fmtInt(o.n)} rows, mean difference {k1(o, "mean_abs")} K, median {k1(o, "median_abs")} K, largest {k1(o, "max_abs")} K, bias {k1(o, "bias")} K. Points on the line agree exactly.
      </p>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table">
          <thead><tr><th>NASA table</th><th className="r">Rows compared</th><th className="r">Mean diff. at row pressure, K</th><th className="r">Largest, K</th><th className="r">Mean diff. at 1 atm, K</th><th className="r">Largest, K</th><th className="r">Zst mean diff.</th></tr></thead>
          <tbody>
            {d.tables.map((t) => (
              <tr key={t.table}>
                <td><a href={href(`/evidence/${t.accession}`)}>{t.accession}</a> <span className="note">{/inverse/i.test(t.file) ? "inverse flames" : "normal flames"}</span></td>
                <td className="r num">{t.n_compared} of {t.n_rows}</td>
                <td className={`r num ${t.Tad.closer === "row_pressure" ? "strong" : ""}`}>{k1(t.Tad.row_pressure, "mean_abs")}</td><td className="r num">{k1(t.Tad.row_pressure, "max_abs")}</td>
                <td className={`r num ${t.Tad.closer === "one_atmosphere" ? "strong" : ""}`}>{k1(t.Tad.one_atmosphere, "mean_abs")}</td><td className="r num">{k1(t.Tad.one_atmosphere, "max_abs")}</td>
                <td className="r num">{t.Zst.mean_abs?.toFixed(5) ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 10, maxWidth: "92ch" }}>
        Rows are skipped when NASA's cell is not a number (ramp tests, spreadsheet errors) or a stream fraction is missing: {d.tables.map((t) => `${t.accession} ${Object.values(t.skipped).reduce((a, b) => a + b, 0)}`).join(", ")}.
        {" "}{d.tables[0]?.conditions}. {d.engine}. {d.limits}
      </p>
    </section>
  );
}
