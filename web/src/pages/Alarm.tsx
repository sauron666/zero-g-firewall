import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { href } from "../app/router";
import { fmtInt, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { useWidth } from "../lib/hooks";
import type { InvestigationsDoc } from "../lib/types";
import { IconCheck, IconInfo, IconPause, IconPlay, IconReset, IconWarn } from "../components/icons";
import { emit } from "../mascot/bus";
import { auditLog, Checked, checkFrames, DURATION, generate, Keys, LogEntry, makeKeys, Run, SCENARIOS, ScenarioId, scorecard, Score, SENSOR_IDS, SENSORS, SensorId, STEP, timeline, Verdict } from "../trust/lab";
import { PageProps } from "./stubs";

const STATE_ICON = { "FIRE ALARM": <IconWarn size={22} />, CHECK: <IconInfo size={22} />, CLEAR: <IconCheck size={22} /> };
const STATE_CLASS = { "FIRE ALARM": "fire", CHECK: "check", CLEAR: "clear" } as const;

/** One sensor over time: accepted readings as a line, rejected frames as crosses, the alarm level, the moment shown. */
function Strip({ sid, frames, at, fansOffAt, onPick }: { sid: SensorId; frames: Checked[]; at: number; fansOffAt: number | null; onPick: (t: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>(520);
  const [hover, setHover] = useState<number | null>(null);
  const H = 132, m = { l: 40, r: 12, t: 22, b: 22 };
  const t0 = frames.length ? Math.min(...frames.map((f) => f.rx)) : 0;
  const mine = useMemo(() => frames.filter((f) => f.sid === sid).map((f) => ({ ...f, at: (f.rx - t0) / 1000 })), [frames, sid, t0]);
  const s = SENSORS[sid];
  const yMax = Math.max(s.threshold * 1.6, ...mine.map((f) => f.v)) * 1.08;
  const yMin = Math.min(0, ...mine.map((f) => f.v));
  const sx = scaleLinear().domain([0, DURATION]).range([m.l, width - m.r]);
  const sy = scaleLinear().domain([yMin, yMax]).range([H - m.b, m.t]);
  const ok = mine.filter((f) => f.ok && f.at <= at), bad = mine.filter((f) => !f.ok && f.at <= at);
  const near = hover == null ? null : mine.filter((f) => f.at <= at).reduce<typeof mine[number] | null>((b, f) => (!b || Math.abs(f.at - hover) < Math.abs(b.at - hover) ? f : b), null);
  const last = ok[ok.length - 1];
  return (
    <div className="plot strip" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={`${s.name} over time; accepted readings as a line, rejected frames as crosses`}
           onMouseMove={(e) => setHover(sx.invert(e.clientX - e.currentTarget.getBoundingClientRect().left))} onMouseLeave={() => setHover(null)}
           onClick={(e) => onPick(Math.max(0, Math.min(DURATION, Math.round(sx.invert(e.clientX - e.currentTarget.getBoundingClientRect().left)))))} style={{ cursor: "pointer", display: "block" }}>
        <text x={m.l} y={13} className="t-ink">{s.name}</text>
        <text x={width - m.r} y={13} textAnchor="end" className="num t-2">{last ? `${last.v.toFixed(sid === "co" ? 1 : 2)} ${s.unit}` : "no accepted reading"}</text>
        <g className="grid">{sy.ticks(3).map((t) => <line key={t} x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} />)}</g>
        {sy.ticks(3).map((t) => <text key={t} x={m.l - 6} y={sy(t) + 4} textAnchor="end" className="num">{t}</text>)}
        {[60, 120, 180, 240].map((t) => <text key={t} x={sx(t)} y={H - 6} textAnchor={t === 240 ? "end" : "middle"} className="num">{t} s</text>)}
        <line x1={m.l} x2={width - m.r} y1={sy(s.threshold)} y2={sy(s.threshold)} stroke="var(--ink-3)" strokeDasharray="4 4" />
        <text x={width - m.r - 2} y={sy(s.threshold) - 4} textAnchor="end">alarm level</text>
        {fansOffAt != null && <g><line x1={sx(fansOffAt)} x2={sx(fansOffAt)} y1={m.t} y2={H - m.b} stroke="var(--ink-2)" strokeDasharray="2 3" /><text x={sx(fansOffAt) + 4} y={m.t + 10}>fans off</text></g>}
        <polyline fill="none" stroke="var(--ink)" strokeWidth={1.8} points={ok.map((f) => `${sx(f.at)},${sy(f.v)}`).join(" ")} />
        {bad.map((f, i) => <path key={i} d={`M${sx(f.at) - 3.5} ${sy(f.v) - 3.5}l7 7m0-7l-7 7`} stroke="var(--serious)" strokeWidth={1.6} />)}
        <line x1={sx(at)} x2={sx(at)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeWidth={1} />
      </svg>
      {near && hover != null && (
        <div className="tip" style={{ left: Math.min(sx(near.at) + 12, width - 230), top: 18 }}>
          <b>{near.at.toFixed(0)} s: {near.v.toFixed(2)} {s.unit}</b>
          <div>{near.ok ? "accepted: signature, sequence and clock hold" : `rejected: ${near.why.join("; ")}`}</div>
          <div style={{ color: "var(--ink-3)" }}>sequence {near.seq}, signature {near.sig.slice(0, 10)}…</div>
        </div>
      )}
    </div>
  );
}

export function Alarm({ route }: PageProps) {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [sc, setSc] = useState<ScenarioId>((SCENARIOS.find((s) => s.id === route.segs[1])?.id ?? "replay") as ScenarioId);
  const [seed, setSeed] = useState(7);
  const [run, setRun] = useState<Run | null>(null);
  const [checked, setChecked] = useState<Checked[]>([]);
  const [tl, setTl] = useState<Verdict[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [at, setAt] = useState(DURATION);
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState<{ rows: Score[]; suppressed: number; fireRuns: number } | null>(null);
  const [prog, setProg] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inv = useData<InvestigationsDoc>("investigations.json");
  const raf = useRef(0);

  useEffect(() => { makeKeys().then(setKeys).catch((e) => setErr(String(e?.message ?? e))); }, []);
  useEffect(() => {
    if (!keys) return;
    let live = true;
    (async () => {
      const r = await generate(sc, seed, keys);
      const c = await checkFrames(r, keys);
      const t = timeline(c, r.fansOffAt);
      const l = await auditLog(t, c);
      if (live) { setRun(r); setChecked(c); setTl(t); setLog(l); setAt(0); setPlaying(true); }
    })().catch((e) => live && setErr(String(e?.message ?? e)));
    return () => { live = false; };
  }, [keys, sc, seed]);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setAt((v) => { const nv = v + dt * 24; if (nv >= DURATION) { setPlaying(false); return DURATION; } return nv; });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const scenario = SCENARIOS.find((s) => s.id === sc)!;
  const v = tl.length ? tl[Math.min(tl.length - 1, Math.floor(at / STEP))] : null;
  const accepted = checked.filter((f) => f.ok).length;
  const vState = v?.state, vAnomaly = v?.integrity.anomaly ?? false;
  useEffect(() => { if (vState) emit({ type: "ALARM", state: vState, anomaly: vAnomaly }); }, [vState, vAnomaly]);   // the companion reacts to the verdict, never to raw readings
  const smoke = (inv.data?.items ?? []).filter((i) => ["PSI-101", "PSI-102", "PSI-47", "PSI-115"].includes(i.accession));

  return (
    <div className="stack" style={{ ["--gap" as string]: "20px" }}>
      <h1 className="page-title">Alarm trust lab</h1>
      <p className="lede">Can you trust the alarm that shuts off your air? Nine situations, from a quiet cabin to a real fire hidden behind replayed "all clear" data. Every reading is signed; every decision is logged.</p>
      <div className="banner banner--synthetic"><IconWarn /><div><b>Synthetic.</b> These readings are generated in your browser from this site's smoke model and seeded noise, with the truth declared. No real sensor is read and nothing is controlled.
        Signatures are real: {run ? run.alg : "…"} keys are made here, one per sensor, and never leave the page.</div></div>
      {err && <p className="callout"><IconWarn size={16} /><span>The lab could not start in this browser: {err}</span></p>}

      <div className="soc">
        <aside className="soc__list" aria-label="Scenarios">
          {SCENARIOS.map((s) => (
            <button key={s.id} type="button" className="scn" aria-pressed={s.id === sc} onClick={() => setSc(s.id)}>
              <span className="scn__name">{s.name}</span>
              <span className="scn__tags"><span className="tag">truth: {s.truth}</span>{s.sparta && <span className="tag mono" title={s.sparta.name}>{s.sparta.id}</span>}</span>
            </button>
          ))}
        </aside>

        <div className="stack" style={{ ["--gap" as string]: "16px", minWidth: 0 }}>
          <div className="panel panel--tight" data-klass="synthetic">
            <p style={{ maxWidth: "80ch" }}><b>{scenario.name}.</b> {scenario.about}{scenario.sparta ? ` Technique ${scenario.sparta.id}, ${scenario.sparta.name}.` : ""}</p>
            <div className="transport" style={{ marginTop: 12 }}>
              <button className="btn btn--primary btn--sm" onClick={() => { if (at >= DURATION) setAt(0); setPlaying(!playing); }}>{playing ? <IconPause size={16} /> : <IconPlay size={16} />}{playing ? "Pause" : "Play"}</button>
              <button className="btn btn--quiet btn--sm" onClick={() => { setAt(0); setPlaying(true); }}><IconReset size={16} />From the start</button>
              <input className="scrub" type="range" min={0} max={DURATION} step={STEP} value={Math.round(at)} aria-label="Lab time, seconds" onChange={(e) => { setPlaying(false); setAt(+e.target.value); }} />
              <div className="transport__time">{Math.round(at)} s</div>
              <label className="row" style={{ ["--gap" as string]: "6px", fontSize: 13 }}>seed <input type="number" min={1} max={9999} value={seed} onChange={(e) => setSeed(Math.max(1, +e.target.value || 1))} style={{ width: 70 }} className="select" /></label>
            </div>
          </div>

          {v && (
            <div className={`verdictcard verdictcard--${STATE_CLASS[v.state]}`} role="status">
              <div className="verdictcard__state">{STATE_ICON[v.state]}<span>{v.state}</span></div>
              <div>
                <div className="claim claim--m">{v.headline}</div>
                {v.notes.map((n) => <p key={n} className="doc" style={{ fontSize: "1rem", marginTop: 6 }}>{n}</p>)}
                <p className="note" style={{ marginTop: 8 }}>
                  {v.latchedAt != null ? `Alarm raised at ${v.latchedAt} s and latched: nothing in the data stream can lower it. ` : ""}
                  Frames so far: {fmtInt(checked.filter((f) => f.ok && (f.rx - (checked[0]?.rx ?? 0)) / 1000 <= at).length)} accepted, {fmtInt(v.integrity.rejected)} rejected
                  ({v.integrity.badSig} bad signature, {v.integrity.replays + v.integrity.gaps} sequence, {v.integrity.skewed} clock).
                </p>
              </div>
            </div>
          )}

          <div className="grid cols-2" style={{ ["--gap" as string]: "8px 20px" }}>
            {SENSOR_IDS.map((sid) => <Strip key={sid} sid={sid} frames={checked} at={at} fansOffAt={run?.fansOffAt ?? null} onPick={(t) => { setPlaying(false); setAt(t); }} />)}
          </div>
          <p className="note">Line: readings that passed every check. Crosses: frames that were rejected and not used. Click a chart to move the time. {fmtInt(accepted)} of {fmtInt(checked.length)} frames of this run are accepted.</p>

          {v && (
            <div className="grid cols-2" style={{ ["--gap" as string]: "20px", alignItems: "start" }}>
              <section>
                <h2 className="h3">Triage: what fits, and what speaks against it</h2>
                <div className="table-wrap" style={{ marginTop: 6 }}>
                  <table className="table">
                    <thead><tr><th>Explanation</th><th>For</th><th>Against</th></tr></thead>
                    <tbody>{v.hypotheses.map((h) => (
                      <tr key={h.id}><td className={h.id === v.leading ? "strong" : ""} style={{ whiteSpace: "nowrap" }}>{h.label}{h.id === v.leading ? " (best fit)" : ""}</td>
                        <td>{h.for.join("; ") || <span className="note">nothing</span>}</td><td className="note">{h.against.join("; ") || "nothing"}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="note" style={{ marginTop: 6 }}>No probabilities: a count of signs for and against. "Inconclusive" is a valid result.</p>
              </section>
              <section>
                <h2 className="h3">Checks on the data itself</h2>
                <ul className="checks">{v.signals.map((s) => <li key={s.id} className={s.on ? "is-on" : ""}><span aria-hidden="true">{s.on ? "●" : "○"}</span>{s.text}</li>)}</ul>
              </section>
            </div>
          )}

          <section>
            <div className="section__head"><h2 className="h3">Audit log of this run, chained by hash</h2>
              <span className="row" style={{ ["--gap" as string]: "10px" }}><span className="note">{log.length} entries</span>
                <button type="button" className="btn btn--quiet btn--sm" disabled={log.length === 0} onClick={() => {
                  const body = JSON.stringify({ klass: "SYNTHETIC_SCENARIO", scenario: run?.scenario.id, seed: run?.seed, signature: run?.alg, rule: "hash = SHA-256 of the text prev|n|at|event; the first prev is 64 zeros", entries: log }, null, 1);
                  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
                  const a = document.createElement("a");
                  a.href = url; a.download = `zgf_alarm_log_${run?.scenario.id ?? "run"}_seed${run?.seed ?? 0}.json`;
                  document.body.appendChild(a); a.click(); a.remove();
                  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
                }}>Save the log</button></span></div>
            <div className="table-wrap scroll-y" style={{ maxHeight: 220 }}>
              <table className="datatable"><thead><tr><th>s</th><th>Event</th><th>Entry hash</th></tr></thead>
                <tbody>{log.filter((l) => l.at <= at).map((l) => <tr key={l.n}><td className="num">{l.at}</td><td>{l.event}</td><td className="hash" title={`previous ${l.prev}`}>{l.hash.slice(0, 16)}…</td></tr>)}</tbody></table>
            </div>
          </section>
        </div>
      </div>

      <section>
        <div className="section__head"><h2 className="h2">Scorecard: the same nine situations over many seeds</h2>
          <button type="button" className="btn btn--quiet btn--sm" disabled={!keys || prog != null} onClick={async () => { if (!keys) return; setProg(0); setScore(await scorecard(keys, [11, 12, 13, 14, 15, 16, 17, 18], (d, t) => setProg(d / t))); setProg(null); }}>
            {prog != null ? `Running… ${Math.round(prog * 100)}%` : score ? "Run again" : "Run 72 seeded runs"}</button></div>
        {score ? (
          <>
            <p className={`verdict-line`} role="status">{score.suppressed === 0 ? <IconCheck size={20} /> : <IconWarn size={20} />}
              <span><b>Fire alarms lowered by tampering: {score.suppressed} of {score.fireRuns / 2} tampered fire runs.</b> Across all {score.fireRuns} runs with a real fire, the alarm was raised in {score.rows.filter((r) => r.scenario.fire).reduce((a, r) => a + r.fireAlarms, 0)}.</span></p>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Situation</th><th>Declared truth</th><th className="r">Runs</th><th className="r">Fire alarm</th><th className="r">Alert</th><th className="r">Clear</th><th className="r">Judged right</th><th className="r">Median time to alarm</th></tr></thead>
                <tbody>{score.rows.map((r) => (
                  <tr key={r.scenario.id}><td>{r.scenario.name}</td><td className="note">{r.scenario.truth}{r.scenario.tampering && r.scenario.fire ? " + tampering" : ""}</td><td className="r num">{r.runs}</td>
                    <td className="r num">{r.fireAlarms}</td><td className="r num">{r.alerts}</td><td className="r num">{r.clear}</td><td className="r num strong">{r.correct} of {r.runs}</td><td className="r num">{r.medianAlarmAt != null ? `${r.medianAlarmAt} s` : "–"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </>
        ) : <p className="note">Runs every situation with eight different seeds in your browser, about 35,000 signed frames, and counts how often the lab reaches the declared truth.</p>}
      </section>

      <section className="grid cols-2" style={{ ["--gap" as string]: "20px", alignItems: "start" }}>
        <div className="panel panel--tight" data-klass="derived">
          <h2 className="panel__title">What acting on the alarm costs</h2>
          <p className="doc" style={{ fontSize: "1rem", marginTop: 8 }}>NASA tested stopping the airflow as a way to put a flame out, and its guide lists the belief that a fire then extinguishes itself among the critical misconceptions. When an alarm leads to stopping the fans, a false alarm costs ventilation. A real one, answered that way, can blind the detector that raised it: in this site's model the duct detector may never see the smoke once the fans are off.</p>
          <p className="note" style={{ marginTop: 8 }}><a href={href("/paradox")}>Fans on, fans off</a> shows it side by side. <a href={href("/playbooks/step-ventilation")}>The response playbook</a> has the step and its evidence. <a href={href("/falsify/detector")}>Try to refute it</a> has what NASA's documents say about detectors.</p>
        </div>
        <div className="panel panel--tight" data-klass="observed">
          <h2 className="panel__title">What NASA measured about smoke in free fall</h2>
          <ul style={{ marginTop: 8, display: "grid", gap: 6 }}>{smoke.map((i) => <li key={i.accession} style={{ fontSize: 14 }}><a href={href(`/evidence/${i.accession}`)}>{i.acronym || i.accession}</a>
            <span className="note"> {i.title.slice(0, 70)}{i.title.length > 70 ? "…" : ""} · {i.tables.reduce((a, t) => a + (t.rows ?? 0), 0) || "no"} test rows</span></li>)}</ul>
          <p className="note" style={{ marginTop: 8 }}><KlassBadge k="observed" note="PSI records" /> These are the particle-size experiments a real detector design would start from. The lab above does not use their data.</p>
        </div>
      </section>
      <p className="note">Technique names and numbers are from SPARTA, a framework by The Aerospace Corporation; using them implies no endorsement. Nothing on this page describes how to attack a real system.</p>
    </div>
  );
}
