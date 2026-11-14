import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { BODIES, buoyantSpeedRange } from "../physics/scaling";
import { BRANCHES, Branch, BranchId, Ensemble, POINTS, PointId, Reality, defaultParams, runEnsemble, simulate } from "../physics/paradox";
import { SmokeView } from "../components/SmokeView";
import { LineChart } from "../viz/LineChart";
import { KlassBadge } from "../lib/klass";
import { IconPause, IconPlay, IconReset, IconInfo } from "../components/icons";
import { usePrefersReducedMotion, useWidth } from "../lib/hooks";
import { useReceipt } from "../components/Receipt";

type BodyId = "iss" | "moon" | "mars";
type Mode = "start" | "alarm";
const HORIZON = 600;

const when = (x: number | null) => (x === null ? "not within 10 min" : `${Math.round(x)} s`);
const pct = (x: number) => `${Math.round(x * 100)}%`;

function flameWord(q: number) {
  return q > 0.6 ? "burning" : q > 0.02 ? "weak" : "out";
}

function RangeRows({ a, ens, width }: { a: Reality; ens: Ensemble | null; width: number }) {
  const ids: PointId[] = ["duct", "overhead", "crew"];
  const m = { l: 150, r: 150 };
  const sx = scaleLinear().domain([0, HORIZON]).range([m.l, Math.max(m.l + 60, width - m.r)]);
  const rowH = 38;
  const H = ids.length * rowH + 30;
  return (
    <div className="plot">
      <svg width={width} height={H} role="img" aria-label="Alarm times: reality A as a point, reality B as the range the model allows">
        <g className="axis">
          <line x1={m.l} x2={sx(HORIZON)} y1={H - 24} y2={H - 24} />
          {sx.ticks(6).map((t) => <text key={t} x={sx(t)} y={H - 8} textAnchor="middle" className="num">{t}</text>)}
          <text x={m.l - 10} y={H - 8} textAnchor="end">seconds</text>
        </g>
        <g className="grid">{sx.ticks(6).map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={4} y2={H - 24} />)}</g>
        {ids.map((id, i) => {
          const y = 18 + i * rowH;
          const s = ens?.summary[id];
          const at = a.alarm[id];
          return (
            <g key={id}>
              <text x={0} y={y} dy="0.32em" className="t-ink">{POINTS[id].name}</text>
              {s && s.min !== null && s.max !== null && (
                <>
                  <rect x={sx(s.min)} y={y + 3} width={Math.max(3, sx(s.max) - sx(s.min))} height={9} rx={3} fill="var(--series-b)" opacity={0.34}>
                    <title>{`Reality B: ${Math.round(s.min)} to ${Math.round(s.max)} s among runs that alarm`}</title>
                  </rect>
                  {s.median !== null && <rect x={sx(s.median) - 1.5} y={y + 1} width={3} height={13} fill="var(--series-b)" />}
                </>
              )}
              {at !== null && <circle cx={sx(at)} cy={y - 6} r={5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2}><title>{`Reality A: ${Math.round(at)} s`}</title></circle>}
              <text x={sx(HORIZON) + 8} y={y - 6} dy="0.32em" className="t-2">{at === null ? "A: never" : `A: ${Math.round(at)} s`}</text>
              <text x={sx(HORIZON) + 8} y={y + 8} dy="0.32em" className="t-2">
                {!s ? "B: computing" : s.never >= 0.999 ? "B: never" : s.never > 0.001 ? `B: never in ${pct(s.never)}` : `B: ${Math.round(s.min!)} to ${Math.round(s.max!)} s`}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend" style={{ marginTop: 4 }}>
        <span className="legend__item"><span className="key-dot" style={{ color: "var(--ink)" }} />Reality A, fans on</span>
        <span className="legend__item"><span className="key-band" style={{ color: "var(--series-b)" }} />Reality B, range across everything the model allows; the bar marks the median</span>
      </div>
    </div>
  );
}

export function Paradox() {
  const [body, setBody] = useState<BodyId>("iss");
  const [mode, setMode] = useState<Mode>("start");
  const g = BODIES[body].g;
  const regime = g > 0 ? "partial" : "micro";
  const branches = useMemo(() => (Object.values(BRANCHES) as Branch[]).filter((b) => b.appliesTo.includes(regime)), [regime]);
  const [branch, setBranch] = useState<BranchId>("starved");
  const [t, setT] = useState(150);
  const [playing, setPlaying] = useState(false);
  const [probe, setProbe] = useState<PointId>("duct");
  const reduce = usePrefersReducedMotion();
  const openReceipt = useReceipt();
  const [wrapRef, wrapW] = useWidth<HTMLDivElement>(900);

  useEffect(() => {
    setBranch(g > 0 ? "buoyant" : "starved");
  }, [g]);
  const activeBranch = branches.some((b) => b.id === branch) ? branch : branches[0].id;

  const base = useMemo(() => ({ ...defaultParams(g), horizon: HORIZON }), [g]);
  const A = useMemo(() => simulate(base, Infinity), [base]);
  const switchTime = mode === "start" ? 0 : Math.ceil(A.alarm.duct ?? A.alarm.overhead ?? 60);
  const B = useMemo(() => simulate({ ...base, branch: activeBranch }, switchTime), [base, activeBranch, switchTime]);
  const [ens, setEns] = useState<Ensemble | null>(null);
  useEffect(() => {
    setEns(null);
    const id = window.setTimeout(() => setEns(runEnsemble({ ...base, switchTime })), 80);
    return () => window.clearTimeout(id);
  }, [base, switchTime]);

  // playback: ten minutes of cabin time in twenty seconds
  const raf = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setT((v) => {
        const nv = v + dt * 30;
        if (nv >= HORIZON) { setPlaying(false); return HORIZON; }
        return nv;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  const s = Math.round(Math.min(HORIZON, Math.max(0, t)));
  const end = HORIZON;
  const br = BRANCHES[activeBranch];
  const [uLo, uHi] = buoyantSpeedRange(g);

  const verdict = useMemo(() => {
    const aDuct = A.alarm.duct, bDuct = B.alarm.duct, bOver = B.alarm.overhead;
    const bSeen = bDuct !== null || bOver !== null;
    const flameB = flameWord(B.sourceRate[end]);
    const parts: string[] = [];
    parts.push(`With the fans on, air carries the smoke ${(5.6).toFixed(1)} m to the return and the duct detector alarms after ${when(aDuct)}. The same air keeps feeding the flame.`);
    if (g === 0) {
      if (!bSeen) parts.push(`With the fans off, no detector alarms within ten minutes: the smoke stays where it was made. The flame is ${flameB} at the end${flameB === "out" ? ", and nobody was told there had been one" : ", unseen"}.`);
      else parts.push(`With the fans off, the first alarm comes after ${when(bOver ?? bDuct)}; the flame is ${flameB} at the end.`);
    } else {
      parts.push(`With the fans off, buoyancy lifts the smoke: the overhead detector alarms after ${when(bOver)}, the duct detector after ${when(bDuct)}. The flame is ${flameB} at the end.`);
    }
    return parts;
  }, [A, B, g, end]);

  const chartSeries = [
    { id: "a", name: "A, fans on", color: "var(--ink)", values: A.series[probe] },
    { id: "b", name: "B, fans off", color: "var(--series-b)", values: B.series[probe] },
  ];
  const yMax = Math.max(base.threshold * 4, Math.min(40, Math.max(...Array.from(A.series[probe]), ...Array.from(B.series[probe])) * 1.1));

  const rows: [string, string, string, string][] = [
    ["Duct detector alarms", when(A.alarm.duct), when(B.alarm.duct), ens ? rangeText(ens, "duct") : "computing"],
    ["Overhead detector alarms", when(A.alarm.overhead), when(B.alarm.overhead), ens ? rangeText(ens, "overhead") : "computing"],
    ["Smoke reaches the crew position", when(A.alarm.crew), when(B.alarm.crew), ens ? rangeText(ens, "crew") : "computing"],
    ["Flame after ten minutes", "burning, fed by the fan flow", `${flameWord(B.sourceRate[end])} (${br.label.toLowerCase()})`, "depends on the branch chosen below"],
    ["Smoke carried to the filters", pct(A.removed[end] / Math.max(1e-9, A.emitted[end])), pct(B.removed[end] / Math.max(1e-9, B.emitted[end])), "none while the fans are off"],
    ["Smoke released in ten minutes", `${A.emitted[end].toFixed(0)} units`, `${B.emitted[end].toFixed(0)} units`, "relative units"],
  ];

  return (
    <div className="stack" style={{ ["--gap" as string]: "26px" }} ref={wrapRef}>
      <div className="stack" style={{ ["--gap" as string]: "12px" }}>
        <h1 className="page-title">Two realities</h1>
        <p className="lede">The same cabin, the same fire, the same first second. Only the ventilation differs. One slider moves time in both.</p>
        <div className="row">
          <KlassBadge k="model" note="illustration, bounded by physics" onClick={() => openReceipt({
            title: "The Fan Paradox: transport model",
            klass: "model",
            rows: [
              ["equation", "dc/dt + div(u c) = div(D grad c) + S"],
              ["scheme", "finite volume, upwind advection, central diffusion, explicit; checked against a Python reference on golden vectors"],
              ["cabin", "a 2-D slice, 8.0 m by 2.13 m, cells of 6.7 cm"],
              ["ventilation", `uniform flow of ${(base.fanSpeed * 100).toFixed(0)} cm/s from the supply end to the return end while the fans run`],
              ["mixing", `effective diffusivity ${base.dOn} m²/s with fans on, ${base.dOff} m²/s with fans off (the ensemble varies the latter from 2e-5 to 1e-3)`],
              ["buoyancy", g > 0 ? `a prescribed plume of ${(uLo * 100).toFixed(1)} to ${(uHi * 100).toFixed(1)} cm/s above the source, from U = (g alpha dT/T)^(1/3)` : "none in free fall"],
              ["alarm threshold", `${base.threshold} relative unit per m²; the ensemble varies it by a factor of four`],
            ],
            notes: ["Smoke is in relative units: the source releases one unit per second while it burns at full strength.", "Buoyancy is prescribed as a plume fixed above the source. It does not travel with the smoke.", "This shows mechanisms and orders of magnitude. It is not a prediction for the ISS or for any real cabin."],
          })} />
          <span className="note">2-D slice, prescribed air flow, relative smoke units. Not a prediction for any real cabin.</span>
        </div>
      </div>

      <div className="controls">
        <div className="controls__item">
          <span>Gravity</span>
          <div className="seg" role="group" aria-label="Gravity">
            {(["iss", "moon", "mars"] as BodyId[]).map((b) => (
              <button key={b} aria-pressed={body === b} onClick={() => setBody(b)}>{b === "iss" ? "Space station, 0 g" : b === "moon" ? "Moon, 0.165 g" : "Mars, 0.38 g"}</button>
            ))}
          </div>
        </div>
        <div className="controls__item">
          <span>In reality B the fans</span>
          <div className="seg" role="group" aria-label="When the fans stop in reality B">
            <button aria-pressed={mode === "start"} onClick={() => setMode("start")}>are off from the start</button>
            <button aria-pressed={mode === "alarm"} onClick={() => setMode("alarm")}>stop at the first alarm</button>
          </div>
        </div>
      </div>

      <div className="stack" style={{ ["--gap" as string]: "18px" }}>
        <div className="reality">
          <div className="reality__head">
            <div className="reality__name">Reality A <span>the fans keep running</span></div>
            <div className="reality__facts">
              <span className="chip"><span className="dot dot--warn" />flame {flameWord(A.sourceRate[s])}</span>
              <span className="chip"><span className={`dot ${A.alarm.duct !== null && t >= A.alarm.duct ? "dot--critical" : "dot--off"}`} />duct detector {A.alarm.duct !== null && t >= A.alarm.duct ? `alarmed at ${Math.round(A.alarm.duct)} s` : "quiet"}</span>
            </div>
          </div>
          <SmokeView reality={A} t={t} threshold={base.threshold} gFrac={g} fanSpeed={base.fanSpeed} ariaLabel="Reality A: smoke in a cabin with the fans running" />
        </div>
        <div className="reality">
          <div className="reality__head">
            <div className="reality__name">Reality B <span>{mode === "start" ? "the fans are off" : `the fans stop at ${switchTime} s`}</span></div>
            <div className="reality__facts">
              <span className="chip"><span className={`dot ${B.sourceRate[s] > 0.02 ? "dot--warn" : "dot--off"}`} />flame {flameWord(B.sourceRate[s])}</span>
              <span className="chip"><span className={`dot ${B.alarm.duct !== null && t >= B.alarm.duct ? "dot--critical" : "dot--off"}`} />duct detector {B.alarm.duct !== null && t >= B.alarm.duct ? `alarmed at ${Math.round(B.alarm.duct)} s` : "quiet"}</span>
              <span className="chip"><span className={`dot ${B.alarm.overhead !== null && t >= B.alarm.overhead ? "dot--critical" : "dot--off"}`} />overhead detector {B.alarm.overhead !== null && t >= B.alarm.overhead ? `alarmed at ${Math.round(B.alarm.overhead)} s` : "quiet"}</span>
            </div>
          </div>
          <SmokeView reality={B} t={t} threshold={base.threshold} gFrac={g} fanSpeed={base.fanSpeed} ariaLabel="Reality B: smoke in the same cabin with the fans off" />
        </div>

        <div className="transport">
          <button className="btn btn--primary btn--sm" onClick={() => { if (t >= HORIZON) setT(0); setPlaying(!playing); }} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <IconPause size={16} /> : <IconPlay size={16} />}{playing ? "Pause" : "Play"}
          </button>
          <button className="btn btn--quiet btn--sm" onClick={() => { setT(0); setPlaying(!reduce); }}><IconReset size={16} />From the start</button>
          <input className="scrub" type="range" min={0} max={HORIZON} step={1} value={s} aria-label="Time in both realities, seconds"
            style={{ ["--fill" as string]: `${(s / HORIZON) * 100}%` }}
            onChange={(e) => { setPlaying(false); setT(+e.target.value); }} />
          <div className="transport__time">{Math.floor(s / 60)} min {String(s % 60).padStart(2, "0")} s</div>
        </div>
      </div>

      <section className="panel" data-klass="model">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">What happened</h2>
          </div>
          <KlassBadge k="model" />
        </div>
        <div className="stack">
          {verdict.map((v, i) => <p className="verdict" key={i}>{v}</p>)}
        </div>
        <div className="table-wrap" style={{ marginTop: 20 }}>
          <table className="table">
            <thead><tr><th></th><th>Reality A, fans on</th><th>Reality B, fans off</th><th>What the model allows for B</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td className="strong">{r[1]}</td><td className="strong">{r[2]}</td><td>{r[3]}</td></tr>)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid cols-2">
        <div className="panel" data-klass="model">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">What a detector reads</h2>
              <p className="panel__sub">Click the chart to move time in both realities.</p>
            </div>
            <div className="seg" role="group" aria-label="Which reading">
              {(["duct", "overhead", "crew"] as PointId[]).map((id) => <button key={id} aria-pressed={probe === id} onClick={() => setProbe(id)}>{id === "duct" ? "Duct" : id === "overhead" ? "Overhead" : "Crew"}</button>)}
            </div>
          </div>
          <LineChart x={A.t} series={chartSeries} xLabel="time, s" yLabel="smoke, relative units per m²" yMax={yMax}
            thresholds={[{ y: base.threshold, label: "alarm level" }]} cursor={t} onPick={(x) => { setPlaying(false); setT(x); }}
            ariaLabel={`Smoke at the ${POINTS[probe].name.toLowerCase()} over time in both realities`} />
          <details className="fold" style={{ marginTop: 12 }}>
            <summary>Show these numbers as a table</summary>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Time, s</th><th className="r">A</th><th className="r">B</th></tr></thead>
                <tbody>
                  {Array.from({ length: 11 }, (_, i) => i * 60).map((x) => (
                    <tr key={x}><td>{x}</td><td className="r">{A.series[probe][x].toFixed(2)}</td><td className="r">{B.series[probe][x].toFixed(2)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
        <div className="panel" data-klass="model">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Not one answer: the range for reality B</h2>
              <p className="panel__sub">
                {ens ? `${ens.members.length} runs: every flame response this gravity permits, residual mixing from 2e-5 to 1e-3 m²/s, an alarm level from half to twice the default${g > 0 ? ", and both ends of the buoyant-flow range" : ""}.` : "Running the ensemble."}
              </p>
            </div>
          </div>
          <RangeRows a={A} ens={ens} width={Math.max(300, Math.min(620, wrapW > 760 ? wrapW / 2 - 60 : wrapW - 50))} />
        </div>
      </section>

      <section className="panel">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">When the fans stop, what does the flame do?</h2>
            <p className="panel__sub">The model does not decide this. Each branch below is permitted by a NASA source; choose one for reality B. The range above runs them all.</p>
          </div>
        </div>
        <div className="choice" role="radiogroup" aria-label="Flame response when the fans stop">
          {branches.map((b) => (
            <label key={b.id} data-on={activeBranch === b.id}>
              <input type="radio" name="branch" checked={activeBranch === b.id} onChange={() => setBranch(b.id)} />
              <span>
                <span className="choice__title">{b.label}</span>
                <p className="choice__ev">{b.evidence}</p>
                <p className="choice__src">{b.source}{g > 0 && b.id !== "selffed" ? ". In partial gravity: may, not measured." : ""}</p>
              </span>
            </label>
          ))}
        </div>
        <div className="banner" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>The paradox in one line: the air that feeds a fire is the same air that carries its smoke to the detector and to the filters. Stopping it can starve the flame and blind the alarm at the same time.</span>
        </div>
      </section>
    </div>
  );
}

function rangeText(e: Ensemble, id: PointId): string {
  const s = e.summary[id];
  if (s.never >= 0.999 || s.min === null || s.max === null) return `never, in all ${e.members.length} runs`;
  const span = Math.round(s.min) === Math.round(s.max) ? `${Math.round(s.min)} s` : `${Math.round(s.min)} to ${Math.round(s.max)} s`;
  return s.never > 0.001 ? `${span}; never in ${pct(s.never)} of runs` : span;
}
