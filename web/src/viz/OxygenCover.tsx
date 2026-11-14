import { useRef, useState } from "react";
import { href } from "../app/router";
import { fmtInt } from "../lib/data";
import type { CoverageBlock, DocRef, ReportedDoc } from "../lib/types";
import { useReceipt } from "../components/Receipt";

/** Four steps of one hue; zero is drawn hatched, never as the palest step. */
export const coverStep = (n: number) => (n <= 0 ? 0 : n < 5 ? 1 : n < 20 ? 2 : n < 50 ? 3 : 4);
const STEP_WORDS = ["no rows", "1 to 4", "5 to 19", "20 to 49", "50 or more"];
export const pc = (x: number | null) => (x == null ? "" : `${(100 * x).toFixed(1).replace(/\.0$/, "")}%`);
const SHORT: Record<string, string> = { iss: "station", challenge_limit: "", exploration: "", suit: "suit" };

/** The whole percents drawn one by one, and what lies above them as one stretch. */
export function coverColumns(c: CoverageBlock) {
  const seen = Object.values(c.cells).flatMap((k) => Object.keys(k).map(Number));
  const lo = Math.min(c.axis.lo, ...seen);
  const cols = Array.from({ length: c.axis.hi - lo + 1 }, (_, i) => lo + i);
  const above = (kind: string) => Object.entries(c.cells[kind] ?? {}).filter(([p]) => Number(p) > c.axis.hi).reduce((a, [, v]) => a + v.n, 0);
  return { lo, hi: c.axis.hi, cols, above };
}

/** A test NASA reports outside PSI, or plans, placed on the same grid. It is drawn as a mark and never counted in a square. */
export interface CoverMark { pct: number; kind: string; regime: "micro" | "partial"; state: "reported" | "planned"; who: string; detail: string; ref: DocRef }
const whole = (pct: number) => Math.floor(Math.round(pct * 1000) / 1000 + 0.5);            // the rule of the squares: halves go upward

export function coverMarks(r: ReportedDoc | null | undefined): CoverMark[] {
  if (!r) return [];
  return [
    ...r.saffire.rows.map((x): CoverMark => ({ pct: whole(x.o2_pct), kind: "solid", regime: "micro", state: "reported", who: `Saffire ${x.id}`, detail: `${x.material}, ${x.o2_pct}% oxygen at ${x.p_kpa} kPa`, ref: r.saffire.refs.conditions })),
    ...r.luci.oxygen.map((x): CoverMark => ({ pct: whole(x.from_pct), kind: "solid", regime: "partial", state: "reported", who: "LUCI",
      detail: `${x.sample.toLowerCase()}, simulated lunar gravity; oxygen fell from ${x.approximate ? "about " : ""}${x.from_pct}% to ${x.to_pct}%`, ref: x.ref })),
    ...r.fm2.tests.map((x): CoverMark => ({ pct: whole(x.o2_pct), kind: "solid", regime: "partial", state: "planned", who: `FM2 test ${x.n}`, detail: `fabric on the Moon, ${x.o2_pct}% oxygen at ${x.p_psia} psia`, ref: r.fm2.ref })),
  ];
}

function Target({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-8 -8 16 16" aria-hidden="true">
      <circle r="4.4" fill="none" stroke="var(--ink)" strokeWidth="1.5" /><path d="M-8 0h4M4 0h4M0-8v4M0 4v4" stroke="var(--ink)" strokeWidth="1.5" />
    </svg>
  );
}

interface Tip { x: number; y: number; title: string; lines: [string, string][]; hint?: string }

/**
 * Test rows by fuel form and whole percent of oxygen, once for free fall and once for partial gravity.
 * The second block is the same grid with nothing in it: that emptiness is the finding.
 */
export function OxygenCover({ c, reported }: { c: CoverageBlock; reported?: ReportedDoc | null }) {
  const marks = coverMarks(reported);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const open = useReceipt();
  const { lo, hi, cols, above } = coverColumns(c);
  const atm = new Map(c.atmospheres.filter((a) => a.pct <= hi).map((a) => [a.pct, a]));
  const beyond = c.atmospheres.filter((a) => a.pct > hi);
  const style = { ["--cov-n" as string]: cols.length } as React.CSSProperties;
  const micro = c.regimes.find((r) => r.id === "micro");
  const partial = c.regimes.find((r) => r.id === "partial");

  const show = (ev: React.SyntheticEvent<HTMLElement>, t: Omit<Tip, "x" | "y">) => {
    const b = box.current?.getBoundingClientRect();
    const r = ev.currentTarget.getBoundingClientRect();
    if (!b) return;
    setTip({ ...t, x: Math.max(0, Math.min(r.left - b.left + r.width / 2 - 110, b.width - 232)), y: r.bottom - b.top + 8 });
  };
  const receipt = (kind: CoverageBlock["kinds"][number], pct: number, n: number, records: Record<string, number>) => open({
    title: `${kind.label} at ${pct}% oxygen, in free fall: ${fmtInt(n)} ${n === 1 ? "row" : "rows"}`, klass: "derived",
    rows: [
      ["counted from", <>{Object.entries(records).map(([a, k], i) => <span key={a}>{i ? ", " : ""}<a href={href(`/evidence/${a}`)}>{a}</a> ({k})</span>)}</>],
      ["rule", c.rule],
      ["gravity", "free fall; no row in these tables was taken in lunar or Martian gravity"],
      ["pressure", kind.with_pressure === 0 ? "none of this fuel form's rows states pressure" : `${fmtInt(kind.with_pressure)} of this fuel form's ${fmtInt(kind.rows)} rows state pressure`],
      ["see the rows", <a href={href("/envelope")}>Atmosphere map</a>],
    ],
    notes: ["Each row, with its file hash and ledger entry, opens from the atmosphere map and from the record's own table."],
  });

  const outside = (kind: CoverageBlock["kinds"][number], pct: number, where: string, ms: CoverMark[]) => open({
    title: `${kind.label} at ${pct}% oxygen, ${where}: ${ms.every((x) => x.state === "planned") ? "planned by NASA" : "reported by NASA outside PSI"}`, klass: "literature",
    rows: ms.flatMap((x): [string, React.ReactNode][] => [
      [x.who, `${x.state === "planned" ? "planned: " : ""}${x.detail}`],
      ["document", `${x.ref.source}, ${x.ref.what}`],
      ["fetched from", <a href={x.ref.url} target="_blank" rel="noreferrer">{x.ref.url}</a>],
      ["SHA-256 of the file", <span className="hash">{x.ref.sha256}</span>],
      ["ledger entry", `number ${x.ref.ledger_seq}`],
    ]),
    notes: ["Not a row of a PSI table. It is drawn as a mark and is not counted in any square or total on this site."],
  });

  const strip = (kind: CoverageBlock["kinds"][number], regime: "micro" | "partial") => {
    const cells = regime === "micro" ? c.cells[kind.id] ?? {} : {};
    const up = regime === "micro" ? above(kind.id) : 0;
    const where = regime === "micro" ? "free fall" : "lunar or Martian gravity";
    return (
      <div className="cov__row" key={regime + kind.id}>
        <div className="cov__label">
          <b>{kind.label}</b>
          <span>{regime === "micro" ? `${fmtInt(kind.rows)} rows · ${pc(kind.min)} to ${pc(kind.max)}` : "0 rows"}</span>
        </div>
        {cols.map((p) => {
          const cell = cells[String(p)];
          const n = cell?.n ?? 0;
          const ms = marks.filter((x) => x.kind === kind.id && x.regime === regime && x.pct === p);
          const cls = `cov__cell cov__cell--${coverStep(n)}${atm.has(p) ? " cov__cell--atm" : ""}`;
          const t = { title: `${kind.label}, ${p}% oxygen`, lines: [[where, n ? `${fmtInt(n)} ${n === 1 ? "row" : "rows"}` : "no rows in PSI"] as [string, string],
            ...(cell ? Object.entries(cell.records).map(([a, k]) => [a, String(k)] as [string, string]) : []),
            ...ms.map((x) => [x.who, x.state === "planned" ? "planned" : "in a NASA paper"] as [string, string]),
            ...(atm.has(p) ? [["crew atmosphere", atm.get(p)!.label] as [string, string]] : [])], hint: n || ms.length ? "Click for the receipt" : undefined };
          const glyph = ms.length > 0 && <i className={`cov__lit cov__lit--${ms.some((x) => x.state === "reported") ? "reported" : "planned"}`} aria-hidden="true" />;
          return n > 0 || ms.length > 0
            ? <button key={p} type="button" className={cls} aria-label={`${kind.label}, ${p}% oxygen, ${where}: ${n} rows in PSI${ms.length ? `; ${ms.map((x) => `${x.who}, ${x.state === "planned" ? "planned" : "reported outside PSI"}`).join("; ")}` : ""}`}
                      onMouseEnter={(e) => show(e, t)} onFocus={(e) => show(e, t)} onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)}
                      onClick={() => (n > 0 && cell ? receipt(kind, p, n, cell.records) : outside(kind, p, where, ms))}>{glyph}</button>
            : <span key={p} className={cls} onMouseEnter={(e) => show(e, t)} onMouseLeave={() => setTip(null)} />;
        })}
        <span className="cov__break" aria-hidden="true" />
        <span className={`cov__cell cov__cell--wide cov__cell--${coverStep(up)}`}
              onMouseEnter={(e) => show(e, { title: `${kind.label}, ${hi + 1}% to 100% oxygen`, lines: [[where, up ? `${fmtInt(up)} rows` : "no rows"], ...beyond.map((a) => ["crew atmosphere", a.label] as [string, string])] })}
              onMouseLeave={() => setTip(null)}>
          {up > 0 && <span className="num">{fmtInt(up)}</span>}
        </span>
      </div>
    );
  };

  const pcts = Array.from(new Set([...Object.values(c.cells).flatMap((k) => Object.keys(k).map(Number)), ...c.atmospheres.map((a) => a.pct), ...marks.map((x) => x.pct)])).sort((a, b) => a - b);
  const atmAt = new Map(c.atmospheres.map((a) => [a.pct, a]));

  return (
    <section className="panel" data-klass="derived">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">Where the tests sit, by oxygen</h2>
          <p className="panel__sub">
            One square for each whole percent of oxygen. A deeper blue means more test rows; a hatched square means none.
            The lower block is the same grid for lunar and Martian gravity.
          </p>
        </div>
        <div className="seg" role="group" aria-label="Show as">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        </div>
      </div>

      {view === "chart" ? (
        <div className="cov" style={style} ref={box}>
          <div className="legend cov__legend">
            {STEP_WORDS.map((w, i) => <span key={w} className="legend__item"><span className={`cov__cell cov__swatch cov__cell--${i}`} aria-hidden="true" />{w}</span>)}
            <span className="legend__item"><Target />atmosphere a crew breathes</span>
            {marks.length > 0 && <>
              <span className="legend__item"><span className="cov__cell cov__swatch cov__cell--0" aria-hidden="true"><i className="cov__lit cov__lit--reported" /></span>reported by NASA outside PSI</span>
              <span className="legend__item"><span className="cov__cell cov__swatch cov__cell--0" aria-hidden="true"><i className="cov__lit cov__lit--planned" /></span>planned by NASA</span>
            </>}
          </div>

          <div className="cov__row cov__row--marks" aria-hidden="true">
            <div className="cov__label" />
            {cols.map((p) => <span key={p} className="cov__slot">{atm.has(p) && <span className="cov__mark"><span>{[SHORT[atm.get(p)!.id], `${p}%`].filter(Boolean).join(" ")}</span><Target /></span>}</span>)}
            <span className="cov__break" />
            <span className="cov__slot cov__slot--wide">{beyond.map((a) => <span key={a.id} className="cov__mark cov__mark--end"><span>{[SHORT[a.id], `${a.pct}%`].filter(Boolean).join(" ")}</span><Target /></span>)}</span>
          </div>

          <h3 className="cov__regime"><span className="gdot gdot--micro" aria-hidden="true" />{micro?.label ?? "Free fall"} <span className="note">{fmtInt(micro?.rows ?? 0)} rows</span></h3>
          {c.kinds.map((k) => strip(k, "micro"))}

          <h3 className="cov__regime"><span className="gdot gdot--partial" aria-hidden="true" />{partial?.label ?? "Lunar or Martian gravity"} <span className="note">{fmtInt(partial?.rows ?? 0)} rows</span></h3>
          {c.kinds.map((k) => strip(k, "partial"))}

          <div className="cov__row cov__row--axis" aria-hidden="true">
            <div className="cov__label"><span>{c.axis.unit}</span></div>
            {cols.map((p) => <span key={p} className="cov__slot">{p % 5 === 0 && <span className="cov__tick num">{p}</span>}</span>)}
            <span className="cov__break" />
            <span className="cov__slot cov__slot--wide"><span className="cov__tick cov__tick--wide num">{hi + 1} to 100</span></span>
          </div>

          {tip && (
            <div className="tip" style={{ left: tip.x, top: tip.y, width: 232 }}>
              <b>{tip.title}</b>
              {tip.lines.map(([k, v], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}><span>{k}</span><span className="num" style={{ color: "var(--ink)", textAlign: "right" }}>{v}</span></div>)}
              {tip.hint && <div style={{ marginTop: 4, color: "var(--ink-3)" }}>{tip.hint}</div>}
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th className="r">Oxygen</th>{c.kinds.map((k) => <th key={k.id} className="r">{k.label}</th>)}<th className="r">{partial?.label ?? "Partial gravity"}</th><th style={{ paddingLeft: 18 }}>Crew atmosphere</th>
              {marks.length > 0 && <th>Outside PSI: reported or planned by NASA</th>}</tr></thead>
            <tbody>
              {pcts.map((p) => (
                <tr key={p}>
                  <td className="r num strong">{p}%</td>
                  {c.kinds.map((k) => <td key={k.id} className="r num">{c.cells[k.id]?.[String(p)]?.n ?? 0}</td>)}
                  <td className="r num">0</td><td style={{ paddingLeft: 18 }}>{atmAt.get(p)?.label ?? ""}</td>
                  {marks.length > 0 && <td className="note">{marks.filter((x) => x.pct === p).map((x) => `${x.who}${x.state === "planned" ? " (planned)" : ""}`).join(", ")}</td>}
                </tr>
              ))}
              <tr><td className="r strong">All</td>{c.kinds.map((k) => <td key={k.id} className="r num strong">{fmtInt(k.rows)}</td>)}<td className="r num strong">{fmtInt(partial?.rows ?? 0)}</td><td />{marks.length > 0 && <td className="note">not counted</td>}</tr>
            </tbody>
          </table>
        </div>
      )}

      <p className="note" style={{ marginTop: 12, maxWidth: "96ch" }}>
        {c.rule} {fmtInt(c.placed)} of {fmtInt(c.total)} rows are placed. Not placed:{" "}
        {c.not_placed.map((x, i) => <span key={x.id}>{i ? "; " : ""}{fmtInt(x.rows)} because {x.why} ({x.records.join(", ")})</span>)}.
        Pressure is on the <a href={href("/envelope")}>atmosphere map</a>.
        {marks.length > 0 && <> Diamonds are tests NASA reports in papers or plans; they are not rows of a PSI table and no square counts them.</>}
      </p>
    </section>
  );
}
