import { useState } from "react";
import { scaleLinear } from "d3-scale";
import { useWidth } from "../lib/hooks";
import type { DocRef, ReportedDoc, SaffireRow } from "../lib/types";
import { SourceBtn } from "../components/Source";

const g = (v: number) => String(+v.toFixed(2));

/** A receipt for a number read from a NASA document: the document, the page, and where on it. */
export function DocBtn({ r, title, label = "receipt", extra = [] }: { r: DocRef; title: string; label?: string; extra?: [string, React.ReactNode][] }) {
  return <SourceBtn title={title} sref={{ ...r, page: r.loc }} klass="literature" label={label} extra={[["document", r.source], ["where", r.what], ...extra]} />;
}

interface Bar { id: string; label: string; value: number; low?: number }

/** Five bars and the limits NASA states beside them. A second, lower mark per bar shows the same quantity somewhere else. */
function Bars({ title, unit, bars, lines, lowName, highName, aria }: { title: string; unit: string; bars: Bar[]; lines: { y: number; label: string }[]; lowName?: string; highName?: string; aria: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(300);
  const [hover, setHover] = useState<string | null>(null);
  const H = 196, m = { l: 40, r: lines.length ? 92 : 10, t: 30, b: 30 };
  const top = Math.max(...bars.map((b) => b.value), ...lines.map((l) => l.y));
  const sy = scaleLinear().domain([0, top * 1.12]).nice(4).range([H - m.b, m.t]);
  const band = (width - m.l - m.r) / bars.length;
  const bw = Math.min(26, band * 0.5);
  const cx = (i: number) => m.l + band * (i + 0.5);
  const h = bars.find((b) => b.id === hover);
  return (
    <div className="plot" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={aria} style={{ display: "block" }}>
        <text x={0} y={13} className="t-ink">{title}</text>
        <text x={width - m.r} y={13} textAnchor="end">{unit}</text>
        <g className="grid">{sy.ticks(4).map((t) => <line key={t} x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} />)}</g>
        {sy.ticks(4).map((t) => <text key={t} x={m.l - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="num">{t}</text>)}
        {bars.map((b, i) => (
          <g key={b.id} onMouseEnter={() => setHover(b.id)} onMouseLeave={() => setHover(null)}>
            <rect x={cx(i) - band / 2} y={m.t} width={band} height={H - m.t - m.b} fill="transparent" />
            <path d={`M${cx(i) - bw / 2} ${sy(0)}V${sy(b.value) + 4}q0 -4 4 -4h${bw - 8}q4 0 4 4V${sy(0)}Z`} fill="var(--g-micro)" opacity={hover && hover !== b.id ? 0.55 : 1} />
            {b.low != null && <path d={`M${cx(i) - bw / 2 - 4} ${sy(b.low)}h${bw + 8}`} stroke="var(--ink)" strokeWidth={2.4} strokeLinecap="round" />}
            <text x={cx(i)} y={sy(b.value) - 5} textAnchor="middle" className="num t-ink">{g(b.value)}</text>
            <text x={cx(i)} y={H - m.b + 15} textAnchor="middle" className="num">{b.label}</text>
          </g>
        ))}
        {lines.map((l) => (
          <g key={l.label} pointerEvents="none">
            <line x1={m.l} x2={width - m.r + 4} y1={sy(l.y)} y2={sy(l.y)} stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="5 4" />
            <text x={width - m.r + 8} y={sy(l.y)} dy="0.32em" className="t-2">{l.label}</text>
          </g>
        ))}
      </svg>
      {h && <div className="tip" style={{ left: Math.min(Math.max(cx(bars.indexOf(h)) - 90, 0), Math.max(0, width - 190)), top: m.t + 4, width: 180 }}>
        <b>Saffire {h.label}</b>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>{highName ?? title}</span><span className="num" style={{ color: "var(--ink)" }}>{g(h.value)}</span></div>
        {h.low != null && <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><span>{lowName}</span><span className="num" style={{ color: "var(--ink)" }}>{g(h.low)}</span></div>}
      </div>}
    </div>
  );
}

/** What rose in the cabin during five large fires, against the limits stated in the same paper. */
export function SaffireProducts({ doc }: { doc: ReportedDoc }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const s = doc.saffire, L = s.limits;
  const bar = (f: (r: SaffireRow) => number, low?: (r: SaffireRow) => number): Bar[] => s.rows.map((r) => ({ id: r.id, label: r.id, value: f(r), low: low?.(r) }));
  const cols: (keyof SaffireRow)[] = ["material", "o2_pct", "p_kpa", "flow_cm_s", "co_ppm", "co2_ppm", "co2_mmhg", "t_outlet_c", "t_far_c"];
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", ["--gap" as string]: "12px", flexWrap: "wrap" }}>
        <p className="note" style={{ maxWidth: "70ch" }}>
          {s.rows.map((r) => `${r.id}: ${r.material}, ${g(r.o2_pct)}% oxygen at ${g(r.p_kpa)} kPa`).join(" · ")}
        </p>
        <div className="seg" role="group" aria-label="Show as">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        </div>
      </div>
      {view === "chart" ? (
        <div className="grid cols-3 rep__bars" style={{ ["--gap" as string]: "8px 22px", marginTop: 10 }}>
          <Bars title="Carbon monoxide, rise" unit="ppm" bars={bar((r) => r.co_ppm)} aria={`Rise in carbon monoxide at the far sensors in five Saffire tests: ${s.rows.map((r) => `${r.id} ${r.co_ppm} ppm`).join(", ")}`}
                lines={[{ y: L.co_24h_ppm, label: `24 h limit ${g(L.co_24h_ppm)}` }, { y: L.co_1h_ppm, label: `1 h limit ${g(L.co_1h_ppm)}` }]} />
          <Bars title="Carbon dioxide, rise" unit="mmHg" bars={bar((r) => r.co2_mmhg)} aria={`Rise in carbon dioxide partial pressure in five Saffire tests: ${s.rows.map((r) => `${r.id} ${r.co2_mmhg} mmHg`).join(", ")}`}
                lines={[{ y: L.co2_1h_mmhg, label: `1 h mean limit ${g(L.co2_1h_mmhg)}` }]} />
          <Bars title="Highest temperature" unit="°C" bars={bar((r) => r.t_outlet_c, (r) => r.t_far_c)} lines={[]} highName="at the duct outlet" lowName="at the far sensors"
                aria={`Highest temperature at the outlet of the flow duct and at the far sensors in five Saffire tests: ${s.rows.map((r) => `${r.id} ${r.t_outlet_c} and ${r.t_far_c} °C`).join(", ")}`} />
        </div>
      ) : (
        <div className="table-wrap" style={{ marginTop: 10 }}>
          <table className="table">
            <thead><tr><th>Test</th><th>Material</th>{cols.slice(1).map((c) => <th key={c} className="r">{s.columns[c] ?? c}</th>)}</tr></thead>
            <tbody>{s.rows.map((r) => <tr key={r.id}><td className="strong">{r.id}</td><td>{r.material}</td>{cols.slice(1).map((c) => <td key={c} className="r num">{g(r[c] as number)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      <div className="legend" style={{ marginTop: 6 }}>
        <span className="legend__item"><span className="gdot gdot--micro" aria-hidden="true" />free fall, one bar for each test</span>
        <span className="legend__item"><span className="key-line" style={{ color: "var(--ink)" }} />temperature at the far sensors</span>
        <span className="legend__item"><span className="key-line" style={{ color: "var(--ink-2)", borderTopStyle: "dashed" }} />limit stated in the paper (h: hours; mean: one-hour average)</span>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Read from the stored text of NASA's paper, not typed in. {s.checks.length} cross-checks pass, for example: {s.checks[3]?.what ?? s.checks[0].what}. {s.not_used}{" "}
        <DocBtn r={s.refs.products} title={s.title} label="Table 2" extra={s.checks.map((c, i) => [`check ${i + 1}`, c.what] as [string, React.ReactNode])} />{" "}
        <DocBtn r={s.refs.conditions} title={`${s.title}: test conditions`} label="Table 1" />{" "}
        <DocBtn r={s.refs.limits} title={`${s.title}: limits and the alarm threshold`} label="limits" />
      </p>
    </div>
  );
}

/** LUCI: the same sample in simulated lunar gravity and on Earth, as a table whose cells carry their own bars. */
export function LunarRates({ doc }: { doc: ReportedDoc }) {
  const L = doc.luci;
  const top = Math.max(...L.rows.flatMap((r) => [r.lunar, r.earth]));
  const cell = (v: number, unit: string, tone: "partial" | "earth") => (
    <td className="rep__cell"><span className="rep__bar" style={{ ["--w" as string]: `${(100 * v) / top}%`, ["--c" as string]: `var(--g-${tone})` }} /><span className="num">{g(v)} {unit}</span></td>
  );
  return (
    <div>
      <div className="table-wrap">
        <table className="table rep__table">
          <thead><tr><th>Sample</th><th><span className="gdot gdot--partial" aria-hidden="true" /> Simulated lunar gravity</th><th><span className="gdot gdot--earth" aria-hidden="true" /> On Earth</th><th className="r">Ratio on the slide</th></tr></thead>
          <tbody>{L.rows.map((r) => (
            <tr key={r.id}><td>{r.sample}<span className="note" style={{ display: "block" }}>{r.measure.toLowerCase()}</span></td>{cell(r.lunar, r.unit, "partial")}{cell(r.earth, r.unit, "earth")}
              <td className="r"><span className="num" style={{ display: "block", marginBottom: 4 }}>{g(r.ratio)}</span>
                <DocBtn r={r.ref} title={`${r.sample}, ${r.measure.toLowerCase()}: lunar gravity against Earth`} extra={r.as_stated ? [["as stated on the slide", r.as_stated]] : []} /></td></tr>
          ))}</tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8 }}>
        Lunar gravity came from spin: {g(L.spin.rpm)} rpm at {g(L.spin.radius_m)} m is {L.spin.accel_m_s2} m/s², or {L.spin.g} g{L.spin.lunar_g_stated != null ? `; NASA gives lunar gravity as ${L.spin.lunar_g_stated} g` : ""}.{" "}
        <DocBtn r={L.spin.ref} title="The spin that stood in for lunar gravity" label="slide 12" extra={[["rule", L.spin.rule]]} />
        {L.oxygen.length > 0 && <> The chamber was closed, so oxygen fell as the samples burned: {L.oxygen.map((o) => `${o.approximate ? "about " : ""}${g(o.from_pct)}% to ${g(o.to_pct)}% with the ${o.sample.split(",")[0].toLowerCase()}`).join(", ")}.</>}
      </p>
    </div>
  );
}
