import { useEffect, useMemo, useRef, useState } from "react";
import { href } from "../app/router";
import { fmtInt, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { DropletDoc, DropletPoint } from "../lib/types";
import { d2Time, diameterAt, ratesNear, testedLevels } from "../physics/droplet";
import { useReceipt } from "./Receipt";
import { Scatter, ScatterGroup, ScatterLegend, ScatterPoint } from "../viz/Scatter";

const n2 = (v: number, d = 2) => v.toFixed(d).replace(/\.?0+$/, "");
const groupOf = (p: DropletPoint) => `${p.f}${p.dil ? " +" : ""}`;

/** A droplet drawn at the size the law gives it, beside the straight line of its squared diameter. A schematic. */
function Shrinking({ d0, band }: { d0: number; band: { lo: number; hi: number; median: number } }) {
  const tEnd = d2Time(d0, 0, band.median);
  const tMax = d2Time(d0, 0, band.lo);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  useEffect(() => { setT(0); setPlaying(false); }, [d0, band.median]);
  useEffect(() => {
    if (!playing) return;
    const span = Math.min(Math.max(tEnd, 2.5), 7) * 1000;            // the burn is replayed in a few seconds whatever its length
    const t0 = performance.now() - (t / tEnd) * span;
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / span);
      setT(f * tEnd);
      if (f < 1) raf.current = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);                                                       // eslint-disable-line react-hooks/exhaustive-deps
  const d = diameterAt(d0, band.median, t);
  const R = 9 + 7.2 * d;                                               // px, drawn larger than life
  const W = 300, H = 160, m = { l: 40, r: 12, t: 24, b: 28 };
  const sx = (x: number) => m.l + (x / tMax) * (W - m.l - m.r);
  const sy = (y: number) => H - m.b - (y / (d0 * d0)) * (H - m.t - m.b);
  return (
    <div className="drop">
      <svg className="drop__view" viewBox="0 0 120 120" role="img" aria-label={`Schematic droplet, ${n2(d)} millimetres across after ${n2(t, 1)} seconds`}>
        {d > 0 && <circle cx="60" cy="60" r={Math.min(56, R * 1.75)} fill="var(--g-micro-wash)" stroke="var(--g-micro)" strokeWidth="1.5" strokeDasharray="2 3" />}
        {d > 0 && <circle cx="60" cy="60" r={Math.min(30, R * 0.62)} fill="var(--ink-3)" fillOpacity="0.55" stroke="var(--ink)" strokeWidth="1.2" />}
        {d === 0 && <text x="60" y="64" textAnchor="middle" style={{ fill: "var(--ink-3)", fontSize: 11 }}>burned out</text>}
      </svg>
      <div className="drop__side">
        <svg className="drop__line" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Squared diameter against time: a straight line, with the band between the lowest and highest measured rate">
          <line x1={m.l} y1={H - m.b} x2={W - m.r} y2={H - m.b} stroke="var(--axis)" />
          <line x1={m.l} y1={m.t} x2={m.l} y2={H - m.b} stroke="var(--axis)" />
          <path d={`M${sx(0)} ${sy(d0 * d0)}L${sx(d2Time(d0, 0, band.hi))} ${sy(0)}L${sx(tMax)} ${sy(0)}Z`} fill="var(--ink)" fillOpacity="0.09" />
          <line x1={sx(0)} y1={sy(d0 * d0)} x2={sx(tEnd)} y2={sy(0)} stroke="var(--g-micro)" strokeWidth="2" />
          <circle cx={sx(t)} cy={sy(d * d)} r="4.5" fill="var(--g-micro)" stroke="var(--surface)" strokeWidth="2" />
          <text x={m.l - 6} y={sy(d0 * d0) + 4} textAnchor="end" className="num" style={{ fill: "var(--ink-3)", fontSize: 11 }}>{n2(d0 * d0, 1)}</text>
          <text x={m.l - 6} y={H - m.b + 4} textAnchor="end" className="num" style={{ fill: "var(--ink-3)", fontSize: 11 }}>0</text>
          <text x={sx(tEnd)} y={H - m.b + 15} textAnchor="middle" className="num" style={{ fill: "var(--ink-2)", fontSize: 11 }}>{n2(tEnd, 1)} s</text>
          <text x={m.l - 30} y={11} style={{ fill: "var(--ink-2)", fontSize: 11 }}>diameter squared, mm²</text>
          <text x={m.l + 2} y={H - 3} style={{ fill: "var(--ink-2)", fontSize: 11 }}>time since ignition</text>
        </svg>
        <div className="drop__ctl">
          <button type="button" className="btn btn--quiet btn--sm" onClick={() => { if (t >= tEnd) setT(0); setPlaying(!playing); }}>{playing ? "Pause" : t >= tEnd ? "Replay" : "Play"}</button>
          <input type="range" min={0} max={tEnd} step={tEnd / 200} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }} aria-label="Time since ignition" />
          <span className="num note">{n2(t, 1)} s · {n2(d)} mm</span>
        </div>
      </div>
    </div>
  );
}

/** The d-squared law against the four columns NASA's FLEX table states for each droplet. Nothing is fitted. */
export function DropletPanel() {
  const v = useData<DropletDoc>("droplets.json");
  const open = useReceipt();
  const [fuel, setFuel] = useState("Heptane");
  const [pct, setPct] = useState(21);
  const [d0, setD0] = useState(3);
  const d = v.data;
  const fuels = useMemo(() => Array.from(new Set((d?.points ?? []).map((p) => p.f))).filter(Boolean).sort(), [d]);
  const groups = useMemo<ScatterGroup[]>(() => fuels.flatMap((f, i) => [
    { id: f, name: `${f} in oxygen and nitrogen`, shape: i % 2 ? "triangle" as const : "circle" as const, color: "var(--g-micro)" },
    { id: `${f} +`, name: `${f} with helium or carbon dioxide`, shape: i % 2 ? "triangle" as const : "circle" as const, color: "var(--g-micro)", hollow: true },
  ]), [fuels]);
  if (v.error) return null;
  if (!d) return <p className="note">Loading the droplet check…</p>;

  const checked = d.points.filter((p) => p.td != null);
  const top = Math.ceil(Math.max(...checked.map((p) => Math.max(p.tb as number, p.td as number))) / 5) * 5;
  const receipt = (p: DropletPoint) => open({
    title: `${d.source.accession}, row ${p.r + 1}: ${p.f}${p.td != null ? `, law against stated time` : ""}`, klass: "derived",
    rows: [
      ["PSI record", <a href={href(`/evidence/${d.source.accession}`)}>{d.source.accession}</a>], ["file", d.source.file], ["row", `${p.r + 1} (counting data rows from 1)`],
      [`"${d.columns.d0}"`, p.d0 == null ? "(empty)" : String(p.d0)], [`"${d.columns.de}"`, p.de == null ? "(empty)" : String(p.de)],
      [`"${d.columns.k}"`, p.k == null ? "(empty)" : `${p.k}, read as ${d.rate_unit.read_as}`], [`"${d.columns.tb}"`, p.tb == null ? "(empty)" : String(p.tb)],
      ["atmosphere", `${p.x == null ? "oxygen not stated" : `oxygen ${n2(100 * p.x, 1)}%`}${p.p == null ? "" : `, ${p.p} kPa`}${p.dil ? `, with ${p.dil}` : ", balance nitrogen"}`],
      ["test end, as written", p.end || "(empty)"],
      ...(p.td != null ? [[d.law, `(${p.d0}² − ${p.de}²) / ${p.k} = ${p.td} s`] as [string, React.ReactNode], ["law over stated time", String(p.q)] as [string, React.ReactNode]] : []),
      ["SHA-256 of the file", <span className="hash">{d.source.sha256}</span>], ["ledger entry", `number ${d.source.ledger_seq}`],
    ],
    notes: [d.limits],
  });
  const parity: ScatterPoint[] = checked.map((p) => ({
    x: p.tb as number, y: p.td as number, group: groupOf(p), title: `${p.f}, row ${p.r + 1}`, ref: p,
    tip: [["NASA's burn time", `${p.tb} s`], ["d² law", `${n2(p.td as number)} s`], ["law over stated", n2(p.q as number)], ["oxygen", p.x == null ? "not stated" : `${n2(100 * p.x, 1)}%`], ["test end", p.end]],
  }));
  const rates: ScatterPoint[] = d.points.filter((p) => p.k != null && p.x != null).map((p) => ({
    x: 100 * (p.x as number), y: p.k as number, group: groupOf(p), title: `${p.f}, row ${p.r + 1}`, ref: p, size: 34,
    tip: [["burning rate", `${p.k} mm²/s`], ["oxygen", `${n2(100 * (p.x as number), 1)}%`], ["pressure", p.p == null ? "not stated" : `${p.p} kPa`], ["diluent", p.dil || "nitrogen"], ["initial diameter", p.d0 == null ? "not stated" : `${p.d0} mm`]],
  }));
  const counts = Object.fromEntries(groups.map((g) => [g.id, checked.filter((p) => groupOf(p) === g.id).length]));
  const band = ratesNear(d.points, fuel, pct);
  const levels = testedLevels(d.points, fuel);
  const ended = d.points.filter((p) => p.end === "Extinction").length;

  return (
    <section className="panel" data-klass="derived" id="droplets">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">The d² law against NASA's droplet tests</h2>
          <p className="panel__sub">
            A burning droplet shrinks so that its diameter squared falls in a straight line with time. For each FLEX test NASA's table states where that line starts, where the visible flame ended, its slope and how long it took.
            Here the four are set against each other. Nothing is fitted.
          </p>
        </div>
        <KlassBadge k="derived" note="four cells of each NASA row" />
      </div>
      <p className="claim claim--m" style={{ maxWidth: "44ch" }}>
        In {d.within["10"]} of {d.n_usable} FLEX tests, the d² law gives NASA's own burn time within 10%.
      </p>
      <p className="doc" style={{ marginTop: 10, fontSize: "1rem", maxWidth: "74ch" }}>
        One thing the check found: the rate column of NASA's file is headed "{d.columns.k}". The four columns agree only when it is read as {d.rate_unit.read_as}, which is what a burning-rate constant is.
        The law's time is the shorter one in most rows: the median of law over stated time is {n2(d.ratio.median)}. <a href={href("/data")}>The curator's notes</a> list the header.
      </p>
      <div className="row" style={{ justifyContent: "space-between", margin: "16px 0 8px" }}><ScatterLegend groups={groups} counts={counts} /></div>
      <Scatter points={parity} groups={groups} xLabel="NASA's burn time, s" yLabel="d² law, s" xDomain={[0, top]} yDomain={[0, top]} height={380} diagonal
               curves={[{ pts: [[0, 0], [top, 0.9 * top]], label: "", dash: "2 4" }, { pts: [[0, 0], [top / 1.1, top]], label: "", dash: "2 4" }]}
               ariaLabel="Parity plot: burn time from the d-squared law against the burn time NASA states, one mark for each FLEX test" onPick={(pt) => receipt(pt.ref as DropletPoint)} />
      <p className="note" style={{ marginTop: 6, maxWidth: "96ch" }}>
        {d.n_usable} of {d.n_rows} rows state all four values. Half of them lie between {n2(d.ratio.p25)} and {n2(d.ratio.p75)}; {d.within["20"]} are within 20%.
        Not checked: {d.not_usable.map((x) => `${x.rows} with ${x.why}`).join("; ")}. Marks on the solid line agree exactly; the dotted lines stand 10% to either side. Click a mark for its four cells.
      </p>

      <div className="grid cols-2" style={{ marginTop: 22, alignItems: "start" }}>
        <div>
          <h3 className="h3">The rate NASA measured, against oxygen</h3>
          <p className="note" style={{ margin: "4px 0 8px" }}>Each mark is one test. This is the number a droplet model needs, read from NASA's table.</p>
          <Scatter points={rates} groups={groups} xLabel="oxygen, percent by volume" yLabel="burning rate, mm²/s" xDomain={[10, 36]} yDomain={[0, 1.1]} height={300}
                   ariaLabel="Burning-rate constant of each FLEX test against the oxygen of its atmosphere" fmtY={(y) => n2(y, 1)} onPick={(pt) => receipt(pt.ref as DropletPoint)} />
        </div>
        <div className="panel panel--tight" data-klass="model">
          <div className="panel__head" style={{ marginBottom: 8 }}>
            <h3 className="h3">Try a droplet</h3>
            <KlassBadge k="model" note="d² law with a rate NASA measured" />
          </div>
          <div className="drop__inputs">
            <div className="seg" role="group" aria-label="Fuel">{fuels.map((f) => <button key={f} type="button" aria-pressed={f === fuel} onClick={() => setFuel(f)}>{f}</button>)}</div>
            <label className="wslider"><span>Oxygen</span><span className="num">{pct}%</span>
              <input type="range" min={12} max={34} step={1} value={pct} onChange={(e) => setPct(Number(e.target.value))} aria-label="Oxygen, percent" /></label>
            <label className="wslider"><span>Initial diameter</span><span className="num">{n2(d0, 1)} mm</span>
              <input type="range" min={1} max={5} step={0.1} value={d0} onChange={(e) => setD0(Number(e.target.value))} aria-label="Initial diameter, millimetres" /></label>
          </div>
          {band ? (
            <>
              <p className="doc" style={{ fontSize: "1rem", marginTop: 10 }}>
                In {band.n} {band.n === 1 ? "test" : "tests"} of {fuel.toLowerCase()} within 1.5 points of {pct}% oxygen, NASA measured {band.n === 1 ? `${n2(band.median)}` : `${n2(band.lo)} to ${n2(band.hi)}`} mm²/s.
                At {band.n === 1 ? "that rate" : `the median, ${n2(band.median)}`}, a {n2(d0, 1)} mm droplet burning to nothing takes <b className="num">{n2(d2Time(d0, 0, band.median), 1)} s</b>
                {band.n > 1 && <> (between {n2(d2Time(d0, 0, band.hi), 1)} and {n2(d2Time(d0, 0, band.lo), 1)} s)</>}.
              </p>
              <Shrinking d0={d0} band={band} />
            </>
          ) : (
            <p className="doc" style={{ fontSize: "1rem", marginTop: 10 }}>
              No FLEX test of {fuel.toLowerCase()} in oxygen and nitrogen lies within 1.5 points of {pct}% oxygen, so there is no rate to take and no time is given.
              Tested levels: {levels.map((x) => `${x}%`).join(", ")}.
            </p>
          )}
          <p className="note" style={{ marginTop: 8 }}>
            Illustration, not to scale; the dashed ring stands for the flame. The model assumes the droplet burns to nothing. In FLEX, {ended} of {d.n_rows} tests ended with the flame going out first.
          </p>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 18 }}>
        <table className="table">
          <thead><tr><th>Group</th><th className="r">Tests checked</th><th className="r">Within 10%</th><th className="r">Median of law over stated time</th></tr></thead>
          <tbody>
            {[...d.by_fuel.map((g) => ["Fuel", g] as const), ...d.by_end.map((g) => ["Test end, as written", g] as const)].map(([kind, g]) => (
              <tr key={kind + g.name}><td><span className="note">{kind}:</span> <span className="strong">{g.name}</span></td><td className="r num">{fmtInt(g.n)}</td><td className="r num">{fmtInt(g.within10)}</td><td className="r num">{n2(g.median)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 10, maxWidth: "96ch" }}>
        Assumed: {d.assumptions.join("; ")}. {d.limits} File: {d.source.file}, ledger entry {d.source.ledger_seq}.
      </p>
    </section>
  );
}
