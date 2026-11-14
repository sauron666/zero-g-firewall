import { useEffect, useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { href } from "../app/router";
import { fmtInt, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { EnvelopeDoc, EnvelopePoint, EnvelopeSeries, RankDoc, TableSummary } from "../lib/types";
import { emit } from "../mascot/bus";
import { Readings, Tile } from "../dash/widgets";
import { useReceipt } from "../components/Receipt";
import { Scatter, ScatterGroup, ScatterLegend, ScatterMark, ScatterPoint, Shape, shapePath } from "../viz/Scatter";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/envelope");
const SHAPE: Record<string, Shape> = { "FLEX droplets": "circle", "CFI droplets": "diamond", "CFI-G gas flames": "square", "Flame Design gas flames": "triangle", "BASS-II solids": "cross", "Saffire solids": "circle" };
const SHORT: Record<string, { label: string; place: ScatterMark["place"] }> = {
  iss: { label: "ISS cabin", place: "right" },
  challenge_limit: { label: "30% at 10.2 psia", place: "left" },
  exploration: { label: "34% at 8.2 psia", place: "left" },
  suit: { label: "Suit, 4.3 psia", place: "below" },
  apollo_pad: { label: "Apollo 1 pad test, 16.7 psi", place: "right" },
  apollo_test_6040: { label: "Apollo tests, 60% at 16.2 psi", place: "right" },
  apollo_test_62: { label: "Apollo tests, 6.2 psi", place: "above" },
};
interface Atm { id: string; name: string; kind: string; p_kpa: number; x_o2: number; source: string; note: string }
interface AtmDoc { presets: Atm[]; historical: Atm[]; normoxic_curve: { p_kpa: number; x_o2: number }[] }
const H = 440;
const KIND: Record<string, string> = { droplet: "liquid droplets", gas: "gas flames", solid: "solid materials" };

function Strip({ points, groups, yDomain, onPick }: { points: EnvelopePoint[]; groups: ScatterGroup[]; yDomain: [number, number]; onPick: (p: EnvelopePoint) => void }) {
  const sy = scaleLinear().domain(yDomain).range([H - 40, 30]);
  const g = new Map(groups.map((x) => [x.id, x]));
  return (
    <svg className="strip" width="100%" height={H} viewBox={`0 0 150 ${H}`} preserveAspectRatio="none" role="img"
         aria-label="Rows that state oxygen but no pressure, placed by oxygen fraction only">
      <text x={75} y={14} textAnchor="middle" style={{ fill: "var(--ink-2)", fontSize: 12 }}>pressure not</text>
      <text x={75} y={27} textAnchor="middle" style={{ fill: "var(--ink-2)", fontSize: 12 }}>in the table</text>
      {points.filter((p) => p.x >= yDomain[0] && p.x <= yDomain[1]).map((p, i) => {
        const grp = g.get(p.s);
        if (!grp) return null;
        const x = 18 + (((p.r * 37 + p.a.length * 13) % 100) / 100) * 114;
        return (
          <path key={i} d={shapePath(grp.shape, 38)} transform={`translate(${x},${sy(p.x)})`} fill={grp.hollow ? "var(--surface)" : grp.color} fillOpacity={0.8}
                stroke={grp.hollow ? grp.color : "var(--surface)"} strokeWidth={grp.hollow ? 1.5 : 0.6} style={{ cursor: "pointer" }} onClick={() => onPick(p)}>
            <title>{`${p.s}, ${p.a} row ${p.r + 1}: oxygen ${(p.x * 100).toFixed(1)}%, ${p.f}`}</title>
          </path>
        );
      })}
    </svg>
  );
}

export function Envelope({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const env = useData<EnvelopeDoc>(ready ? "envelope.json" : null);
  const atm = useData<AtmDoc>("model/atmospheres.json");
  const idx = useData<{ items: TableSummary[] }>(ready ? "tables/index.json" : null);
  const rank = useData<RankDoc>(ready ? "rank_features.json" : null);
  const [mission, setMission] = useState(route.query.get("mission") ?? "");
  const lens = rank.data?.lenses.find((l) => l.id === mission);
  const pure = !!lens?.atmospheres.some((a) => a[1] > 0.45);
  const [zoom, setZoom] = useState<"all" | "tests">("all");
  useEffect(() => { if (lens) setZoom(pure ? "all" : "tests"); }, [lens?.id, pure]);
  useEffect(() => { if (lens) emit({ type: "CONTEXT", g: lens.gravity === "partial" ? (lens.id === "mars" ? 0.3794 : 0.1654) : 0, source: "mission" }); }, [lens?.id, lens?.gravity]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const open = useReceipt();

  const groups = useMemo<ScatterGroup[]>(() => (env.data?.series ?? []).map((s) => ({
    id: s.id, name: `${s.id}`, shape: SHAPE[s.id] ?? "circle", color: "var(--g-micro)", hollow: s.id === "Saffire solids",
  })), [env.data]);
  const series = useMemo(() => new Map((env.data?.series ?? []).map((s) => [s.id, s] as [string, EnvelopeSeries])), [env.data]);

  const pick = (p: EnvelopePoint) => {
    const s = series.get(p.s);
    const t = idx.data?.items.find((x) => x.artifact === p.t);
    open({
      title: `${p.s}: ${p.a}, row ${p.r + 1}`, klass: "observed",
      rows: [
        ["PSI record", <a href={href(`/evidence/${p.a}`)}>{p.a}</a>], ["file", t?.file ?? p.t], ["row", `${p.r + 1} (counting data rows from 1)`],
        ["oxygen", `${p.x} mole fraction, from column "${s?.oxygen_from}"${s && s.oxygen_factor !== 1 ? ` × ${s.oxygen_factor}` : ""}${p.approx ? `; the cell reads "${p.approx}" and its first number is used` : ""}`],
        ["pressure", p.p == null ? "not given in this table; the point is not placed at any pressure" : `${p.p} kPa, from column "${s?.pressure_from}" × ${s?.pressure_factor}`],
        ["fuel or material", p.f || "(empty)"], ...(p.o ? [["outcome, as written", p.o] as [string, React.ReactNode]] : []),
        ["SHA-256 of the file", <span className="hash">{t?.sha256 ?? "see the ledger"}</span>], ["ledger entry", t ? `number ${t.ledger_seq}` : "see the ledger"],
      ],
    });
  };

  if (!ready) return <Waiting route={route} manifest={manifest} />;
  if (env.error) return <div className="empty"><p className="empty__title">The atmosphere points could not be loaded</p><p style={{ marginTop: 6 }}>{env.error}</p></div>;
  if (!env.data) return <p className="note">Loading the test rows…</p>;
  const d = env.data;
  const both = d.points.filter((p) => p.p != null && !hidden.has(p.s));
  const only = d.points.filter((p) => p.p == null && !hidden.has(p.s));
  const nBoth = d.points.filter((p) => p.p != null).length;
  const yDomain: [number, number] = zoom === "all" ? [0.1, 1.08] : [0.1, 0.45];
  // many rows repeat the same nominal condition, so rows of one series within 0.01 in oxygen and 2 kPa share one mark sized by their number
  const bins = new Map<string, EnvelopePoint[]>();
  for (const p of both) {
    const k = `${p.s}|${Math.round((p.p as number) / 2)}|${Math.round(p.x / 0.01)}`;
    const b = bins.get(k);
    if (b) b.push(p); else bins.set(k, [p]);
  }
  const points: ScatterPoint[] = Array.from(bins.values()).map((b) => {
    const mp = b.reduce((a, p) => a + (p.p as number), 0) / b.length;
    const mx = b.reduce((a, p) => a + p.x, 0) / b.length;
    const fuels = Array.from(new Set(b.map((p) => p.f))).slice(0, 3).join(", ");
    const outs = new Map<string, number>();
    for (const p of b) if (p.o) outs.set(p.o, (outs.get(p.o) ?? 0) + 1);
    return {
      x: mp, y: mx, group: b[0].s, title: `${b[0].s}: ${b.length} ${b.length === 1 ? "row" : "rows"}`, ref: b, size: 26 + 20 * Math.sqrt(b.length),
      tip: [["record", Array.from(new Set(b.map((p) => p.a))).join(", ")], ["oxygen", `${(mx * 100).toFixed(1)}%`], ["pressure", `${mp.toFixed(1)} kPa`], ["fuel", fuels.slice(0, 34)],
        ...(outs.size ? [["outcomes", Array.from(outs.entries()).map(([k, v]) => `${k} ${v}`).join(", ").slice(0, 40)] as [string, string]] : [])],
    };
  });
  const pickBin = (b: EnvelopePoint[]) => {
    if (b.length === 1) return pick(b[0]);
    const s = series.get(b[0].s);
    const t = idx.data?.items.find((x) => x.artifact === b[0].t);
    open({
      title: `${b[0].s}: ${b.length} rows at about ${(b[0].x * 100).toFixed(0)}% oxygen and ${(b[0].p as number).toFixed(0)} kPa`, klass: "observed",
      rows: [
        ["PSI record", <a href={href(`/evidence/${b[0].a}`)}>{b[0].a}</a>], ["file", t?.file ?? b[0].t],
        ["rows", b.slice(0, 40).map((p) => p.r + 1).join(", ") + (b.length > 40 ? ` and ${b.length - 40} more` : "")],
        ["oxygen", `${Math.min(...b.map((p) => p.x))} to ${Math.max(...b.map((p) => p.x))} mole fraction, from column "${s?.oxygen_from}"`],
        ["pressure", `${Math.min(...b.map((p) => p.p as number))} to ${Math.max(...b.map((p) => p.p as number))} kPa, from column "${s?.pressure_from}" × ${s?.pressure_factor}`],
        ["grouping", "rows of one series within 0.01 in oxygen fraction and 2 kPa share one mark; its area grows with their number"],
        ["SHA-256 of the file", <span className="hash">{t?.sha256 ?? "see the ledger"}</span>], ["ledger entry", t ? `number ${t.ledger_seq}` : "see the ledger"],
      ],
      notes: ["Open the record to see each row as NASA wrote it."],
    });
  };
  const marks: ScatterMark[] = atm.data ? [
    ...atm.data.presets.map((a) => ({ x: a.p_kpa, y: a.x_o2, kind: "target" as const, label: SHORT[a.id]?.label ?? a.name, place: SHORT[a.id]?.place })),
    ...atm.data.historical.map((a) => ({ x: a.p_kpa, y: a.x_o2, kind: "diamond" as const, label: SHORT[a.id]?.label ?? a.name, place: SHORT[a.id]?.place })),
  ] : [];
  const curve = atm.data ? [{ pts: Array.from({ length: 150 }, (_, i) => 20 + i * 2).map((p) => [p, 21.23 / p] as [number, number]), label: "same oxygen partial pressure as sea-level air",
    labelAt: (zoom === "all" ? [50, 0.5] : [150, 0.158]) as [number, number] }] : [];
  const win = d.near ?? { dx: 0.03, dp: 0.15 };
  const regions = (lens?.atmospheres ?? []).map((a) => ({ x0: a[2] * (1 - win.dp), x1: a[2] * (1 + win.dp), y0: a[1] - win.dx, y1: a[1] + win.dx }));
  const lensNear = (lens?.atmospheres ?? []).map((a) => ({ a, n: d.near_presets.find((n) => Math.abs(n.x_o2 - a[1]) < 1e-6 && Math.abs(n.p_kpa - a[2]) < 0.05) }));
  const counts = Object.fromEntries(d.series.map((s) => [s.id, s.n]));
  const near = (id: string) => d.near_presets.find((n) => n.id === id);
  const solidsBoth = d.series.filter((s) => s.kind === "solid").reduce((a, s) => a + s.n_with_pressure, 0);
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="stack" style={{ ["--gap" as string]: "22px" }}>
      <h1 className="page-title">Atmosphere map</h1>
      <Readings>
        <Tile label="Rows with oxygen" value={d.points.length} sub="test rows of NASA's tables" />
        <Tile label="With pressure too" value={nBoth} sub="placed on the map" />
        <Tile label="Near 30% oxygen" value={near("challenge_limit")?.n_near ?? 0} sub="at 10.2 psia, the lunar limit" />
        <Tile label="Near 34% oxygen" value={near("exploration")?.n_near ?? 0} sub="at 8.2 psia, exploration" />
        <Tile label="Solids with pressure" value={solidsBoth} sub="solid-material rows" tone="flame" />
        <Tile label="In partial gravity" value={d.gravity_counts.partial} sub="lunar or Martian" tone="partial" />
      </Readings>

      {rank.data && (
        <div className="stack" style={{ ["--gap" as string]: "10px" }}>
          <div className="toolbar">
            <span className="note">Look for a mission</span>
            <div className="seg" role="group" aria-label="Mission whose atmosphere is marked on the map">
              <button type="button" aria-pressed={!lens} onClick={() => setMission("")}>None</button>
              {rank.data.lenses.map((l) => <button key={l.id} type="button" aria-pressed={l.id === lens?.id} onClick={() => setMission(l.id)}>{l.name}</button>)}
            </div>
          </div>
          {lens && (
            <p className="claim claim--m" style={{ maxWidth: "60ch" }} role="status">
              {lens.name}: {lensNear.map(({ a, n }, i) => (
                <span key={a[0]}>{i ? "; " : ""}{!n ? "an unknown number of rows lie" : n.n_near === 0 ? "no row lies" : `${fmtInt(n.n_near)} ${n.n_near === 1 ? "row lies" : "rows lie"}`} near {a[0]}
                  {n && n.n_near > 0 ? ` (${Object.entries(n.by_kind).map(([k, v]) => `${v} ${KIND[k] ?? k}`).join(", ")})` : ""}</span>
              ))}.
              {lensNear.some(({ n }) => (n?.n_near ?? 0) > 0) && lensNear.every(({ n }) => !n?.by_kind.solid) && " None is a solid material."}
              {lens.gravity === "partial" && d.gravity_counts.partial === 0 && " None was taken in the gravity of that mission."}
              {" "}<a className="note" href={href(`/rank/${lens.id}`)}>Rank the records for this mission</a>
            </p>
          )}
        </div>
      )}

      <section className="panel" data-klass="observed">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">Oxygen and pressure of every test row that states them</h2>
            <p className="panel__sub">Marks are rows of NASA's experimental tables; a larger mark means more rows at that condition. Shape tells the experiment. All are blue because all were taken in free fall. Click a mark for its receipt.{lens ? ` The dashed window is "near" the mission's atmosphere: ${d.near_rule}.` : ""}</p>
          </div>
          <div className="seg" role="group" aria-label="Range of the oxygen axis">
            <button type="button" aria-pressed={zoom === "all"} onClick={() => setZoom("all")}>All atmospheres</button>
            <button type="button" aria-pressed={zoom === "tests"} onClick={() => setZoom("tests")}>Where the tests are</button>
          </div>
        </div>
        <ScatterLegend groups={groups} counts={counts} hidden={hidden} onToggle={toggle} extra={
          <>
            <span className="legend__item"><span className="gdot gdot--partial" aria-hidden="true" />Lunar or Martian gravity (0 rows)</span>
            <span className="legend__item"><svg width="16" height="16" viewBox="-8 -8 16 16" aria-hidden="true"><circle r="4.6" fill="none" stroke="var(--ink)" strokeWidth="1.5" /><path d="M-8 0h4M4 0h4M0-8v4M0 4v4" stroke="var(--ink)" strokeWidth="1.5" /></svg>Atmosphere a crew breathes</span>
            <span className="legend__item"><svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true"><path d={shapePath("diamond", 60)} fill="none" stroke="var(--ink-2)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>Historical, from NASA documents</span>
          </>
        } />
        <div className="mapwrap" style={{ marginTop: 10 }}>
          <Scatter points={points} groups={groups} xLabel="total pressure, kPa" yLabel="oxygen, mole fraction" xDomain={[0, 320]} yDomain={yDomain} height={H}
                   marks={marks} curves={curve} regions={regions} onPick={(p) => pickBin(p.ref as EnvelopePoint[])} fmtY={(v) => v.toFixed(2).replace(/0$/, "")}
                   ariaLabel="Scatter plot of oxygen mole fraction against total pressure for NASA microgravity combustion test rows, with crew atmospheres and historical points" />
          <Strip points={only} groups={groups} yDomain={yDomain} onPick={pick} />
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          {d.note} Crew atmospheres and the dashed curve come from the model page; historical points come from NASA documents and are drawn with a dashed outline.
          Rows left out: {d.series.map((s) => `${s.id} ${s.no_oxygen + s.pressure_not_usable}`).join(", ")} (no oxygen value, or a pressure of 0).
        </p>
      </section>

      <section>
        <div className="section__head"><h2 className="h2">How much evidence sits near each crew atmosphere</h2><KlassBadge k="derived" note={`near means ${d.near_rule}`} /></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Atmosphere</th><th className="r">Oxygen</th><th className="r">Pressure, kPa</th><th className="r">Rows near it</th><th style={{ paddingLeft: 18 }}>Of which</th><th className="r">Solid materials</th><th className="r">Partial gravity</th></tr></thead>
            <tbody>
              {d.near_presets.map((n) => (
                <tr key={n.id} style={lensNear.some((x) => x.n?.id === n.id) ? { background: "var(--raised)", boxShadow: "inset 3px 0 0 var(--ink)" } : undefined}>
                  <td className="strong">{n.label}</td><td className="r num">{(n.x_o2 * 100).toFixed(1)}%</td><td className="r num">{n.p_kpa.toFixed(1)}</td>
                  <td className="r num strong">{fmtInt(n.n_near)}</td>
                  <td style={{ paddingLeft: 18 }}>{Object.entries(n.by_kind).map(([k, v]) => `${v} ${KIND[k] ?? k}`).join(", ") || "none"}</td>
                  <td className="r num">{n.by_kind.solid ?? 0}</td><td className="r num">0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8, maxWidth: "88ch" }}>
          Solid materials are what a cabin is made of, and the solid-fuel tables (BASS-II, Saffire) do not record pressure, so they cannot be placed on the map. {d.gravity_counts.note}
        </p>
      </section>

      <section>
        <div className="section__head"><h2 className="h2">Where each series comes from</h2></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Series</th><th>Records</th><th className="r">Rows</th><th className="r">With pressure</th><th>Oxygen read from</th><th>Pressure read from</th></tr></thead>
            <tbody>
              {d.series.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.id}</td>
                  <td>{s.accessions.map((a, i) => <span key={a}>{i ? ", " : ""}<a href={href(`/evidence/${a}`)}>{a}</a></span>)}</td>
                  <td className="r num">{fmtInt(s.n)}</td><td className="r num">{fmtInt(s.n_with_pressure)}</td>
                  <td className="note">"{s.oxygen_from}"{s.oxygen_factor !== 1 ? ` × ${s.oxygen_factor}` : ""}</td>
                  <td className="note">{s.pressure_from ? `"${s.pressure_from}" × ${s.pressure_factor}` : "not in the table"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
