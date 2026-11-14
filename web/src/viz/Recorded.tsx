import { useEffect, useId, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { useWidth } from "../lib/hooks";
import type { RecordedDoc } from "../lib/types";
import { lastAt, momentAt, moments, nearest, signed, stepPath, utcAt, utcDay } from "../lib/recorded";
import { SourceBtn } from "../components/Source";
import { IconPause, IconPlay, IconReset } from "../components/icons";
import { emit } from "../mascot/bus";

const SPEED = 45;                                             // seconds of the recording per second of playback
const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const g3 = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : String(+v.toFixed(3)));

/** The three sentences the recording supports, each number taken from its derived block. */
export function recordedSay(doc: RecordedDoc): string[] {
  const sc = doc.derived.scatter, fl = doc.derived.flame;
  const len = String(doc.samples[0]?.["Sample Length"] ?? "").trim();
  const out = [
    `A puff from a smoke wire and a burning sheet of fabric${len ? ` ${len} long` : ""} peaked at almost the same reading: ${sc.wire.peak} and ${sc.fire.peak}. ` +
    `Time told them apart: above ${+sc.mark.toFixed(2)} for ${sc.wire.above_mark_s} s, against ${sc.fire.above_mark_s} s.`,
  ];
  if (sc.fire.first_above_before_s != null) {
    out.push(`After the igniter fired, the reading took ${Math.round(sc.fire.first_above_before_s)} s to pass its level of the minute before and ${Math.round(sc.fire.half_s)} s to reach half-way. ` +
      `It peaked at ${Math.round(sc.fire.peak_s)} s; the radiometers were back at baseline at ${Math.round(fl.until_t)} s.`);
  }
  const w = sc.wire_again;
  if (w) out.push(w.rise > 0
    ? `Powered again at ${signed(w.t)}, the same wire raised the reading by ${w.rise}, to ${w.peak}.`
    : `Powered again at ${signed(w.t)}, the same wire did not lift the reading above its level of the minute before: ${w.before} before, at most ${w.peak} in the three minutes after.`);
  return out;
}

/**
 * Two strips on one clock: the flame's radiation, and the reading of the vehicle's own smoke detector.
 * The recording can be played; lines are drawn up to the cursor. Nothing is smoothed.
 */
export function RecordedFire({ doc, compact = false }: { doc: RecordedDoc; compact?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>(compact ? 320 : 760);
  const clip = useId().replace(/:/g, "");
  const t0 = doc.window.from_t, t1 = doc.window.to_t;
  const [at, setAt] = useState(t1);
  const [playing, setPlaying] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const ms = useMemo(() => moments(doc), [doc]);
  const said = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      setAt((v) => { const nv = v + dt * SPEED; if (nv >= t1) { setPlaying(false); return t1; } return nv; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, t1]);
  const cur = momentAt(ms, at);
  useEffect(() => {                                           // the companion says each moment once, as the cursor passes it
    if (playing && cur && cur.t !== said.current) { said.current = cur.t; emit({ type: "NOTE", text: cur.text }); }
  }, [playing, cur]);
  const play = () => { if (at >= t1) { said.current = Number.NEGATIVE_INFINITY; setAt(t0); } setPlaying(!playing); };

  const m = { l: compact ? 4 : 46, r: compact ? 4 : 16, t: compact ? 4 : 50 };
  const hA = compact ? 40 : 118, gap = compact ? 8 : 30, hB = compact ? 64 : 150, foot = compact ? 4 : 36;
  const H = m.t + hA + gap + hB + foot;
  const topB = m.t + hA + gap, botB = topB + hB;
  const T = doc.series.t, rads = doc.series.radiometers, sc = doc.detector.scatter, D = doc.derived;
  const sx = scaleLinear().domain([t0, t1]).range([m.l, Math.max(m.l + 10, width - m.r)]);
  const syA = scaleLinear().domain([Math.min(0, ...D.radiometers.map((r) => r.baseline)) - 8, 1.05 * Math.max(...D.radiometers.map((r) => r.peak))]).range([m.t + hA, m.t]);
  const syB = scaleLinear().domain([0, D.scatter.fire.peak]).nice(4).range([botB, topB]);
  const radPaths = useMemo(() => rads.map((r) => {
    let d = "";
    for (let i = 0; i < T.length; i += 2) d += `${i ? "L" : "M"}${sx(T[i]).toFixed(1)} ${syA(r[i]).toFixed(1)}`;
    return d;
  }), [rads, T, width]);                                      // eslint-disable-line react-hooks/exhaustive-deps
  const detPath = useMemo(() => stepPath(sc, sx, syB, t1), [sc, width]);                                 // eslint-disable-line react-hooks/exhaustive-deps
  const events = [...doc.events].sort((a, b) => a.t - b.t);
  const ticks = sx.ticks(Math.max(3, Math.min(8, Math.floor(width / 120))));
  const shown = hover ?? (at < t1 ? at : null);
  const hi = hover == null ? null : nearest(T, hover);
  const hd = hover == null ? -1 : lastAt(sc, hover);
  const pick = (e: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => Math.max(t0, Math.min(t1, sx.invert(e.clientX - e.currentTarget.getBoundingClientRect().left)));

  const chart = (
    <div className="plot replay__plot" ref={ref}>
      <svg width={width} height={H} role="img" style={{ display: "block", cursor: compact ? "default" : "crosshair", touchAction: "pan-y" }}
           aria-label={`${doc.title}. Upper strip: four radiometers facing the flame. Lower strip: the scatter reading of the vehicle's smoke detector. It peaks at ${D.scatter.wire.peak} after a smoke wire and at ${D.scatter.fire.peak} during the fire.`}
           onPointerMove={compact ? undefined : (e) => setHover(pick(e))} onPointerLeave={() => setHover(null)}
           onClick={compact ? undefined : (e) => { setPlaying(false); setAt(pick(e)); }}>
        <defs><clipPath id={clip}><rect x={0} y={0} width={Math.max(0, sx(at))} height={H} /></clipPath></defs>
        {!compact && (
          <>
            <g className="grid">
              {syA.ticks(4).filter((v) => v >= 0).map((v) => <line key={`a${v}`} x1={m.l} x2={width - m.r} y1={syA(v)} y2={syA(v)} />)}
              {syB.ticks(4).map((v) => <line key={`b${v}`} x1={m.l} x2={width - m.r} y1={syB(v)} y2={syB(v)} />)}
            </g>
            <g className="axis">
              {syA.ticks(4).filter((v) => v >= 0).map((v) => <text key={`a${v}`} x={m.l - 8} y={syA(v)} dy="0.32em" textAnchor="end" className="num">{v}</text>)}
              {syB.ticks(4).map((v) => <text key={`b${v}`} x={m.l - 8} y={syB(v)} dy="0.32em" textAnchor="end" className="num">{v}</text>)}
              <line x1={m.l} x2={width - m.r} y1={botB} y2={botB} />
              {ticks.map((v) => <text key={v} x={sx(v)} y={botB + 16} textAnchor="middle" className="num">{v === 0 ? "0" : signed(v).replace(" s", "")}</text>)}
              <text x={width - m.r} y={H - 4} textAnchor="end">seconds from the ignition of sample S1</text>
              <text x={m.l} y={m.t - 8} className="t-2">Radiometers facing the flame, as recorded</text>
              <text x={m.l} y={topB - 8} className="t-2">Smoke detector of the vehicle, scatter reading</text>
            </g>
          </>
        )}
        {events.map((e, i) => (
          <g key={e.id}>
            <line x1={sx(e.t)} x2={sx(e.t)} y1={compact ? m.t : m.t - 24} y2={botB} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 4" />
            {!compact && <g transform={`translate(${sx(e.t)},${m.t - 34})`}><circle r={8} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1} /><text textAnchor="middle" dy="0.34em" className="num t-ink" style={{ fontSize: 10 }}>{i + 1}</text></g>}
          </g>
        ))}
        <line x1={m.l} x2={width - m.r} y1={syB(D.scatter.mark)} y2={syB(D.scatter.mark)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="5 4" />
        <g clipPath={`url(#${clip})`}>
          {radPaths.map((d, k) => <path key={k} className="ln" d={d} fill="none" stroke="var(--g-micro)" strokeWidth={compact ? 1.4 : 1.8} strokeDasharray={k % 2 ? "5 4" : undefined} strokeLinejoin="round" />)}
          <path className="ln" d={detPath} fill="none" stroke="var(--ink)" strokeWidth={compact ? 1.5 : 1.8} />
          {!compact && sc.map(([t, v], i) => <circle key={i} cx={sx(t)} cy={syB(v)} r={1.9} fill="var(--ink)" />)}
        </g>
        {shown != null && <line x1={sx(shown)} x2={sx(shown)} y1={m.t} y2={botB} stroke="var(--ink)" strokeWidth={1} pointerEvents="none" />}
        {hi != null && hover != null && (
          <g pointerEvents="none">
            {rads.map((r, k) => <circle key={k} cx={sx(T[hi])} cy={syA(r[hi])} r={3.6} fill="var(--g-micro)" stroke="var(--surface)" strokeWidth={1.5} />)}
            {hd >= 0 && <circle cx={sx(hover)} cy={syB(sc[hd][1])} r={4.2} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />}
          </g>
        )}
      </svg>
      {hi != null && hover != null && (
        <div className="tip" style={{ left: Math.min(Math.max(sx(hover) + 12, m.l), Math.max(m.l, width - 236)), top: m.t + 6, width: 224 }}>
          <b className="num">{signed(hover)} · {utcAt(doc, hover)} UTC</b>
          {rads.map((r, k) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span>radiometer {k + 1}</span><span className="num" style={{ color: "var(--ink)" }}>{g3(r[hi])}</span></div>)}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 3 }}><span>detector, scatter</span>
            <span className="num" style={{ color: "var(--ink)" }}>{hd >= 0 ? g3(sc[hd][1]) : "no reading yet"}</span></div>
          {hd >= 0 && <div style={{ color: "var(--ink-3)" }}>read {Math.max(0, Math.round(hover - sc[hd][0]))} s earlier; a new value comes about every {D.scatter.typical_step_s} s</div>}
        </div>
      )}
    </div>
  );
  if (compact) return chart;

  return (
    <div className="replay">
      <div className="transport replay__bar">
        <button type="button" className="btn btn--primary btn--sm" onClick={play}>{playing ? <IconPause size={16} /> : <IconPlay size={16} />}{playing ? "Pause" : at >= t1 ? "Play the recording" : "Play"}</button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={() => { said.current = Number.NEGATIVE_INFINITY; setAt(t0); setPlaying(!still()); }}><IconReset size={16} />From the start</button>
        <input className="scrub" type="range" min={t0} max={t1} step={1} value={Math.round(at)} aria-label="Time in the recording, seconds from ignition" onChange={(e) => { setPlaying(false); setAt(+e.target.value); }} />
        <div className="transport__time num">{signed(at)} · {utcAt(doc, at)}</div>
        <div className="seg" role="group" aria-label="Show as">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        </div>
      </div>
      <p className="replay__say" role="status" aria-live="polite">{at < t1 && cur ? <><b className="num">{signed(cur.t)}</b> {cur.text}</> : <span className="note">{Math.round((t1 - t0) / 60)} minutes of the recording, played in {Math.round((t1 - t0) / SPEED)} seconds. Click the chart to move the time.</span>}</p>
      {view === "chart" ? (
        <>
          {chart}
          <div className="legend" style={{ marginTop: 6, paddingLeft: 46 }}>
            <span className="legend__item"><span className="key-line" style={{ color: "var(--g-micro)" }} />radiometers 1 and 3</span>
            <span className="legend__item"><span className="key-line" style={{ color: "var(--g-micro)", borderTopStyle: "dashed" }} />radiometers 2 and 4</span>
            <span className="legend__item"><span className="key-line" style={{ color: "var(--ink)" }} />detector reading, one dot for each row of the file</span>
            <span className="legend__item"><span className="key-line" style={{ color: "var(--ink-3)", borderTopStyle: "dashed" }} />half the wire's peak, {+D.scatter.mark.toFixed(2)}</span>
          </div>
          <ol className="replay__events">
            {events.map((e, i) => {
              const s = doc.samples.find((x) => String(x["Sample Number"] ?? "").trim() === e.id);
              return <li key={e.id}><span className="replay__n num">{i + 1}</span><span><b>{e.label}</b>{s ? `, ${String(s.Direction ?? "").trim().toLowerCase()} flow, ${String(s["Air Flow"] ?? "").trim()}` : ""}
                <span className="note num"> {signed(e.t)} · {utcAt(doc, e.t)} UTC</span></span></li>;
            })}
          </ol>
        </>
      ) : (
        <div className="table-wrap scroll-y" style={{ maxHeight: 320 }}>
          <table className="datatable">
            <thead><tr><th className="r">Seconds from ignition</th><th>UTC, {utcDay(doc)}</th><th className="r">Scatter reading</th><th className="r">Obscuration reading</th><th className="r">Highest radiometer</th></tr></thead>
            <tbody>{sc.map(([t, v], i) => {
              const ob = lastAt(doc.detector.obscuration, t), k = nearest(T, t);
              return <tr key={i}><td className="r num">{t}</td><td className="num">{utcAt(doc, t)}</td><td className="r num">{v}</td>
                <td className="r num">{ob >= 0 ? doc.detector.obscuration[ob][1] : ""}</td><td className="r num">{g3(Math.max(...rads.map((r) => r[k])))}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
      <p className="note" style={{ marginTop: 10 }}>
        {doc.units} <SourceBtn title={doc.title} sref={doc.source} klass="observed" label="receipt"
          extra={[["file", doc.source.file], ["rows in the file", doc.source.lines.toLocaleString("en-US")], ["covers", `${doc.source.starts_utc} to ${doc.source.ends_utc}`], ["clock zero", `${doc.zero.utc}: ${doc.zero.what}`], ["window drawn", doc.window.rule]]}
          notes={doc.derived.rules} />
      </p>
    </div>
  );
}
