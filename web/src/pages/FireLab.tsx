import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { PageProps } from "./stubs";
import { useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { useReceipt } from "../components/Receipt";
import { LabTabs, download, replaceQuery } from "../components/LabTabs";
import { createClock, useClock } from "../lab/clock";
import { DropletCase, dropletAt, dropletRun } from "../physics/dropletRun";
import { cellIndex } from "../physics/transport";
import { defaultParams, POINTS, Reality, simulate, CABIN } from "../physics/paradox";
import { buoyantRatio, buoyantSpeedRange, flickerHz } from "../physics/scaling";
import { LineChart } from "../viz/LineChart";
import { usePrefersReducedMotion } from "../lib/hooks";
import { FlexModelDoc } from "../ml/inference";
import { runModel } from "../ml/support";
import { href } from "../app/router";
import type { Pick, SceneId, SensorSpec } from "../three/LabScene";
import { webglAvailableCached } from "../three/support";

const LabScene = lazy(() => import("../three/LabScene"));

interface DropPoint { r: number; f: string; x: number | null; p: number | null; dil: string; d0: number | null; de: number | null; k: number | null; tb: number | null; end: string; td?: number; q?: number }
interface DropDoc { points: DropPoint[]; source: { accession: string; file: string; sha256: string; ledger_seq: number }; rate_unit: { why: string } }

const OVERHEAD_SPOTS: SensorSpec[] = [
  { id: "overhead", name: "Overhead detector, above the source", x: POINTS.overhead.x, y: POINTS.overhead.y },
  { id: "overhead_mid", name: "Overhead detector, mid-cabin", x: 3.6, y: POINTS.overhead.y },
  { id: "overhead_aft", name: "Overhead detector, near the return", x: 1.2, y: POINTS.overhead.y },
];
const LAYERS = [["labels", "Labels and units"], ["evidence", "Evidence pins"], ["sensors", "Sensors"], ["flow", "Flow arrows"], ["field", "Smoke field (model)"], ["particles", "Particles (visual sample)"]] as const;
const G_CHOICES: [number, string][] = [[0.165, "Moon"], [0.38, "Mars"], [1, "Earth"]];

/** A small, representative set of real FLEX rows: one per fuel and diluent, chosen by rule (first row that the d² check could use). */
function pickCases(d: DropDoc): DropletCase[] {
  const seen = new Set<string>();
  const out: DropletCase[] = [];
  for (const p of d.points) {
    if (p.td == null || p.k == null || p.d0 == null || p.de == null) continue;
    const key = `${p.f}|${p.dil || "air"}|${p.p != null && p.p < 85 ? "low" : "1atm"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: `row-${p.r}`, label: `${p.f}, ${p.x != null ? (p.x * 100).toFixed(0) + "% O₂" : "O₂ ?"}${p.dil ? ` with ${p.dil}` : ""}, ${p.p != null ? (p.p / 101.325).toFixed(2) + " atm" : "p ?"}, D₀ ${p.d0} mm`, fuel: p.f, d0: p.d0, k: p.k, de: p.de, tb: p.tb, klass: "observed", row: p.r, x: p.x, p: p.p, dil: p.dil });
  }
  return out.slice(0, 10);
}

function Fallback2D({ scene, c, t, reality, fansOffAt, gA, gB }: { scene: SceneId; c: DropletCase; t: number; reality: Reality | null; fansOffAt: number | null; gA: number; gB: number }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (scene !== "habitat" || !reality || !cv.current) return;
    const { nx, ny } = reality.grid;
    const k = Math.max(0, Math.min(reality.frames.length - 1, Math.round(t / reality.frameDt)));
    const f = reality.frames[k];
    const ctx = cv.current.getContext("2d")!;
    const img = ctx.createImageData(nx, ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const v = Math.sqrt(Math.min(1, f[i + j * nx] / reality.peak)), o = 4 * (i + (ny - 1 - j) * nx);
      img.data[o] = 30 + 200 * v; img.data[o + 1] = 40 + 190 * v; img.data[o + 2] = 60 + 180 * v; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [scene, reality, t]);
  if (scene === "droplet") {
    const s = dropletAt(c, t);
    const R = 60 * (s.d / c.d0);
    return (
      <svg viewBox="0 0 320 200" role="img" aria-label={`Droplet diameter ${s.d.toFixed(2)} mm at ${t.toFixed(2)} s; flame ${s.flame ? "visible" : "out"}`} style={{ width: "100%", height: "100%" }}>
        <rect x="0" y="0" width="320" height="200" fill="#04070d" />
        {s.flame && <circle cx="160" cy="100" r={R * 3} fill="none" stroke="#4d9bff" strokeWidth="5" opacity="0.8" />}
        <circle cx="160" cy="100" r={Math.max(1, R)} fill="#aec8e8" />
        <text x="12" y="188" fill="#dfe7f5" fontSize="11">2-D view: D = {s.d.toFixed(2)} mm · {s.phase.replace("_", " ")} · schematic flame</text>
      </svg>
    );
  }
  if (scene === "habitat") return <div style={{ position: "relative", height: "100%" }}><canvas ref={cv} width={reality?.grid.nx ?? 60} height={reality?.grid.ny ?? 16} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} aria-label={`Smoke on the solved slice at ${t.toFixed(0)} s; fans ${fansOffAt != null && t >= fansOffAt ? "off" : "on"}`} role="img" /></div>;
  const fl = (g: number, x: number) => { const b = buoyantRatio(g); return <ellipse cx={x} cy={110 - 30 * b} rx={22 * (1 - 0.3 * b)} ry={22 * (1 + 1.9 * b)} fill="none" stroke={g > 0 ? "#ff8a3d" : "#4d9bff"} strokeWidth="5" />; };
  return <svg viewBox="0 0 320 200" role="img" aria-label={`Flame shapes, ${gA} g and ${gB} g, illustration`} style={{ width: "100%", height: "100%" }}><rect width="320" height="200" fill="#04070d" />{fl(gA, 90)}{fl(gB, 230)}<text x="12" y="188" fill="#dfe7f5" fontSize="11">2-D view · illustration</text></svg>;
}

export function FireLab({ route }: PageProps) {
  const drops = useData<DropDoc>("droplets.json");
  const mdoc = useData<FlexModelDoc>("ml/flex_k_model.json");
  const receipt = useReceipt();
  const reduced = usePrefersReducedMotion();
  const q = route.query;
  const [scene, setScene] = useState<SceneId>(() => (["droplet", "habitat", "gravity"].includes(q.get("scene") ?? "") ? (q.get("scene") as SceneId) : "droplet"));
  const [caseId, setCaseId] = useState<string>(() => q.get("case") ?? "");
  const [gB, setGB] = useState<number>(() => (Number.isFinite(Number(q.get("g"))) && q.has("g") ? Number(q.get("g")) : 0.165));
  const [fansOff, setFansOff] = useState<number | null>(() => (q.get("fans") === "on" ? null : q.has("fans") ? Number(q.get("fans")) : 60));
  const [mission, setMission] = useState(false);
  const [sensorSpot, setSensorSpot] = useState("overhead");
  const [layers, setLayers] = useState<Record<string, boolean>>(() => Object.fromEntries(LAYERS.map(([k]) => [k, !(q.get("off") ?? "").split(",").includes(k)])));
  const [cutaway, setCutaway] = useState(false);
  const [quality, setQuality] = useState<"high" | "low">(() => ((navigator.hardwareConcurrency ?? 8) <= 4 ? "low" : "high"));
  const [selected, setSelected] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(() => (webglAvailableCached() ? null : "WebGL is not available in this browser."));
  const [xr, setXr] = useState<{ vr: boolean; ar: boolean; checked: boolean; on: string | null; msg: string | null }>({ vr: false, ar: false, checked: false, on: null, msg: null });
  const api = useRef<{ screenshot: () => string | null; resetView: () => void; startXR: (m: "immersive-vr" | "immersive-ar") => Promise<string | null>; fps: () => number } | null>(null);
  const [fps, setFps] = useState(0);
  useEffect(() => {                                    // a link or Back/Forward inside the Fire Lab: follow the address
    const sc = q.get("scene");
    if (sc && ["droplet", "habitat", "gravity"].includes(sc)) setScene(sc as SceneId);
    if (q.has("case")) setCaseId(q.get("case") ?? "");
    if (q.has("g") && Number.isFinite(Number(q.get("g")))) setGB(Number(q.get("g")));
    if (q.has("fans")) setFansOff(q.get("fans") === "on" ? null : Number(q.get("fans")));
  }, [q.toString()]);
  const clock = useMemo(() => createClock(10), []);
  const { t, playing } = useClock(clock);

  const cases = useMemo(() => (drops.data ? pickCases(drops.data) : []), [drops.data]);
  const modelCase = useMemo<DropletCase | null>(() => {
    if (!mdoc.data) return null;
    const r = runModel(mdoc.data, { material: "Methanol", form: "droplet", g: 0, u_m_s: 0, x_o2: 0.21, p_kpa: 101.3, x_n2: 0.79, x_co2: 0, x_he: 0, d0_mm: 2 });
    return r.estimate != null ? { id: "model", label: `Model estimate: methanol, 21% O₂, 1 atm, D₀ 2 mm (K = ${r.estimate.toFixed(3)})`, fuel: "Methanol", d0: 2, k: r.estimate, de: null, tb: null, klass: "model" } : null;
  }, [mdoc.data]);
  const all = useMemo(() => [...cases, ...(modelCase ? [modelCase] : [])], [cases, modelCase]);
  const c: DropletCase = all.find((x) => x.id === caseId) ?? all[0] ?? { id: "none", label: "", fuel: "Methanol", d0: 2, k: 0.5, de: null, tb: null, klass: "model" };

  const sensors = useMemo<SensorSpec[]>(() => [
    { id: "duct", name: POINTS.duct.name, x: POINTS.duct.x + 0.12, y: POINTS.duct.y },
    OVERHEAD_SPOTS.find((s) => s.id === sensorSpot)!,
    { id: "crew", name: POINTS.crew.name, x: POINTS.crew.x, y: POINTS.crew.y },
  ], [sensorSpot]);
  const habitatG = mission ? 0.165 : 0;
  const reality = useMemo<Reality | null>(() => (scene === "habitat" ? simulate({ ...defaultParams(habitatG), horizon: 180, coarse: true }, fansOff ?? Infinity) : null), [scene, fansOff, habitatG]);
  const sensorSeries = useMemo(() => {
    if (!reality) return null;
    const out: Record<string, number[]> = {};
    for (const s of sensors) {
      const idx = cellIndex(reality.grid, Math.min(CABIN.Lx - 0.01, Math.max(0.01, s.x)), Math.min(CABIN.Ly - 0.01, s.y));
      out[s.id] = Array.from(reality.frames, (f) => f[idx]);
    }
    return out;
  }, [reality, sensors]);

  // clock span follows the scene
  useEffect(() => {
    const span = scene === "droplet" ? Math.max(0.5, dropletAt(c, 0).tLawZero * 1.04) : scene === "habitat" ? 180 : 8;
    clock.setSpan(span); clock.reset();
    if (!reduced && scene !== "habitat") clock.play();
  }, [scene, c.id, clock, reduced]);
  useEffect(() => {
    const p = new URLSearchParams({ scene, case: c.id, g: String(gB), fans: fansOff == null ? "on" : String(fansOff) });
    const off = LAYERS.filter(([k]) => !layers[k]).map(([k]) => k); if (off.length) p.set("off", off.join(","));
    replaceQuery("/lab", p);
  }, [scene, c.id, gB, fansOff, layers]);
  useEffect(() => {
    const xrs = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xrs || !window.isSecureContext) { setXr((x) => ({ ...x, checked: true })); return; }
    Promise.all([xrs.isSessionSupported("immersive-vr").catch(() => false), xrs.isSessionSupported("immersive-ar").catch(() => false)]).then(([vr, ar]) => setXr((x) => ({ ...x, vr, ar, checked: true })));
  }, []);
  useEffect(() => { const id = window.setInterval(() => api.current && setFps(api.current.fps()), 1000); return () => clearInterval(id); }, []);

  const openFlexRow = () => {
    const d = drops.data; if (!d) return;
    if (c.klass === "model") { receipt({ title: "Model estimate of K", klass: "model", rows: [["model", mdoc.data?.model_id ?? ""], ["K", `${c.k.toFixed(4)} mm²/s`], ["inputs", "methanol, 21% O₂, 79% N₂, 101.3 kPa, D₀ 2 mm, free fall, still air"]], notes: ["No extinction diameter: the drawing ends where the d² law reaches zero, which is a mathematical end, not an observed one."] }); return; }
    receipt({ title: `FLEX test, row ${(c.row ?? 0) + 1}`, klass: "observed", rows: [["record", `${d.source.accession}, ${d.source.file}`], ["row in file", String((c.row ?? 0) + 1)], ["file SHA-256", <span className="mono">{d.source.sha256}</span>], ["ledger entry", String(d.source.ledger_seq)],
      ["fuel", c.fuel], ["D₀", `${c.d0} mm`], ["visible extinction diameter", `${c.de} mm`], ["burning-rate constant K", `${c.k} mm²/s`], ["burn time NASA states", `${c.tb} s`], ["law time to Dext", `${dropletAt(c, 0).tFlameEnd.toFixed(2)} s`]], notes: [d.rate_unit.why] });
  };
  const onPick = (p: Pick) => {
    if (p.kind === "pin" && p.id === "flex-row") openFlexRow();
    else if (p.kind === "pin" && p.id === "bass2-fanoff") receipt({ title: "Fans off: one BASS-II case", klass: "literature", rows: [["document", "BASS-II Summary Report, NTRS 20210011385"], ["what it says", "In one test the flow was cut off under a spreading flame and the flame went out within 2 s."]], notes: ["NASA's Researcher's Guide lists 'a fire will self-extinguish if ventilation is shut off' as a misconception. The solver here prescribes the source; it does not decide whether a real flame survives. See Myths and evidence."] });
    else if (p.kind === "sensor") setSelected(p.id);
  };
  const shot = () => { const u = api.current?.screenshot(); if (u) { const a = document.createElement("a"); a.href = u; a.download = `zgf_firelab_${scene}_${t.toFixed(1)}s.png`; a.click(); } };
  const enterXR = async (m: "immersive-vr" | "immersive-ar") => { const err = await api.current?.startXR(m); setXr((x) => ({ ...x, msg: err ?? null })); };

  const run = useMemo(() => dropletRun(c, 120), [c]);
  const sDrop = dropletAt(c, t);

  return (
    <div className="stack" style={{ ["--gap" as string]: "var(--s-5)" }}>
      <LabTabs at="/lab" />
      <div className="labhead">
        <div>
          <h1>Fire Lab</h1>
          <p className="lede">Change gravity and airflow in a 3-D laboratory, and see at every moment what is computed, what is a schematic, and where each number comes from.</p>
        </div>
        <div className="seg" role="group" aria-label="Scene">
          {([["droplet", "Droplet chamber"], ["habitat", "Habitat"], ["gravity", "Gravity comparison"]] as [SceneId, string][]).map(([id, l]) => <button key={id} type="button" aria-pressed={scene === id} onClick={() => { setScene(id); setSelected(null); }}>{l}</button>)}
        </div>
      </div>

      <div className="lab">
        <aside className="lab__controls" aria-label="Scene controls">
          {scene === "droplet" && (<>
            <h2>A FLEX droplet</h2>
            <label className="lc"><span className="lc__top"><span>Case</span></span>
              <select value={c.id} onChange={(e) => setCaseId(e.target.value)} aria-label="Droplet case">{all.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            </label>
            <dl className="kv" style={{ marginBottom: 12 }}>
              <dt>K</dt><dd className="num">{c.k.toFixed(3)} mm²/s {c.klass === "observed" ? "(NASA)" : "(model)"}</dd>
              <dt>D₀</dt><dd className="num">{c.d0} mm</dd>
              <dt>Dext</dt><dd className="num">{c.de != null ? `${c.de} mm (NASA)` : "not given"}</dd>
              <dt>NASA burn time</dt><dd className="num">{c.tb != null ? `${c.tb} s` : "not given"}</dd>
              <dt>law, to Dext</dt><dd className="num">{sDrop.tFlameEnd.toFixed(2)} s</dd>
              <dt>law, to zero</dt><dd className="num">{sDrop.tLawZero.toFixed(2)} s</dd>
            </dl>
            <div className="lc lc--locked"><span className="lc__top"><span>Gravity</span><span className="lc__val">0 g, locked</span></span><span className="lc__hint">Every FLEX row was taken in free fall. Other gravity levels are in Gravity comparison, as an illustration.</span></div>
            <div className="lc lc--locked"><span className="lc__top"><span>Airflow</span><span className="lc__val">still air, locked</span></span><span className="lc__hint">FLEX atmospheres were quiescent.</span></div>
            <a className="btn btn--quiet btn--sm" href={href("/model")}>Predict K for other conditions</a>
          </>)}
          {scene === "habitat" && (<>
            <h2>Concept habitat</h2>
            <div className="lc"><span className="lc__top"><span>Fans stop at</span><span className="lc__val">{fansOff == null ? "never" : `${fansOff} s`}</span></span>
              <div className="seg" role="group" aria-label="Fans stop at">{[null, 30, 60, 120].map((v) => <button key={String(v)} type="button" aria-pressed={fansOff === v} onClick={() => setFansOff(v)}>{v == null ? "Never" : `${v} s`}</button>)}</div></div>
            <div className="lc"><span className="lc__top"><span>Gravity in the solver</span><span className="lc__val">{habitatG === 0 ? "0 g" : "0.165 g"}</span></span>
              <div className="seg" role="group" aria-label="Gravity in the solver"><button type="button" aria-pressed={!mission} onClick={() => setMission(false)}>Free fall</button><button type="button" aria-pressed={mission} onClick={() => setMission(true)}>Moon</button></div>
              <span className="lc__hint">{habitatG > 0 ? `Lunar gravity adds a buoyant plume over the source (${buoyantSpeedRange(habitatG).map((v) => (v * 100).toFixed(1)).join(" to ")} cm/s in the model).` : "No buoyant plume in free fall."} A prescribed flow, not CFD.</span></div>
            <label className="lc"><span className="lc__top"><span>Overhead detector position</span></span>
              <select value={sensorSpot} onChange={(e) => setSensorSpot(e.target.value)} aria-label="Overhead detector position">{OVERHEAD_SPOTS.map((s) => <option key={s.id} value={s.id}>{s.name.replace("Overhead detector, ", "")}</option>)}</select></label>
            <label className="layer-toggles"><label><input type="checkbox" checked={cutaway} onChange={(e) => setCutaway(e.target.checked)} /> Cutaway view</label></label>
          </>)}
          {scene === "gravity" && (<>
            <h2>Same flame, two gravity levels</h2>
            <div className="lc"><span className="lc__top"><span>Right-hand gravity</span><span className="lc__val">{gB} g</span></span>
              <div className="seg" role="group" aria-label="Right-hand gravity">{G_CHOICES.map(([g, l]) => <button key={l} type="button" aria-pressed={gB === g} onClick={() => setGB(g)}>{l}</button>)}</div></div>
            <div className="seg" role="group" aria-label="Comparison type" style={{ marginBottom: 10 }}><button type="button" aria-pressed={!mission} onClick={() => setMission(false)}>Change gravity only</button><button type="button" aria-pressed={mission} onClick={() => { setMission(true); setGB(0.165); }}>Mission preset</button></div>
            <p className="lc__hint">{mission ? "The lunar-habitat preset changes four conditions at once: oxygen 34%, pressure 56.5 kPa, airflow 10 cm/s and gravity 0.165 g. This view draws only the gravity change; the other three are not shown in the flame." : "Everything but gravity is held the same. Neither view proves a cause: the real experiments behind each regime are not comparable."}</p>
          </>)}
          <hr className="rule" style={{ margin: "14px 0" }} />
          <h2>Layers</h2>
          <div className="layer-toggles">{LAYERS.map(([k, l]) => <label key={k}><input type="checkbox" checked={layers[k]} onChange={(e) => setLayers((x) => ({ ...x, [k]: e.target.checked }))} /> {l}</label>)}</div>
          <div className="lc" style={{ marginTop: 12 }}><span className="lc__top"><span>Render quality</span><span className="lc__val">{quality}</span></span>
            <div className="seg" role="group" aria-label="Render quality"><button type="button" aria-pressed={quality === "high"} onClick={() => setQuality("high")}>High</button><button type="button" aria-pressed={quality === "low"} onClick={() => setQuality("low")}>Low</button></div></div>
        </aside>

        <section className="lab__view">
          <div className="viewport" aria-label="3-D laboratory view; the same state is described in the table and chart below">
            {!fail ? (
              <Suspense fallback={<div className="viewport__fallback"><span className="hudtag">Loading the 3-D view…</span></div>}>
                <LabScene scene={scene} clock={clock} droplet={c} reality={reality} fansOffAt={fansOff} sensors={sensors} gA={0} gB={gB} layers={layers} quality={quality} cutaway={cutaway} selected={selected}
                  onPick={onPick} onFail={setFail} register={(a) => (api.current = a)} onXR={(s, m) => setXr((x) => ({ ...x, on: s === "on" ? m ?? "xr" : null }))} />
              </Suspense>
            ) : <Fallback2D scene={scene} c={c} t={t} reality={reality} fansOffAt={fansOff} gA={0} gB={gB} />}
            <div className="viewport__hud">
              {scene === "droplet" && <><span className="hudtag"><KlassBadge k={c.klass} onClick={openFlexRow} /></span><span className="hudtag">D = <b>{sDrop.d.toFixed(3)} mm</b></span><span className="hudtag">{sDrop.phase === "burning" ? "flame: computed size, schematic shell" : sDrop.phase === "extinct_recorded" ? "visible flame out (recorded Dext)" : "law reached zero"}</span></>}
              {scene === "habitat" && <><span className="hudtag"><KlassBadge k="model" /></span><span className="hudtag">2D transport visualized in 3D</span><span className="hudtag">fans <b>{fansOff != null && t >= fansOff ? "off" : "on"}</b></span><span className="hudtag"><KlassBadge k="illustrative" note="modules" /></span></>}
              {scene === "gravity" && <><span className="hudtag"><KlassBadge k="illustrative" /></span><span className="hudtag">left 0 g · right {gB} g</span></>}
              {fail && <span className="hudtag">2-D view: {fail}</span>}
            </div>
            <div className="viewport__bar">
              <button className="btn btn--sm" onClick={() => clock.toggle()} aria-label={playing ? "Pause" : "Play"}>{playing ? "Pause" : "Play"}</button>
              <button className="btn btn--sm" onClick={() => { clock.reset(); api.current?.resetView(); setSelected(null); }}>Reset</button>
              <input type="range" min={0} max={clock.span()} step={clock.span() / 400} value={t} onChange={(e) => { clock.pause(); clock.set(+e.target.value); }} aria-label="Time" />
              <span className="viewport__time">{t.toFixed(scene === "habitat" ? 0 : 2)} s</span>
              {!fail && <button className="btn btn--sm" onClick={shot}>Screenshot</button>}
            </div>
          </div>
          <div className="xrbar">
            {xr.vr && !fail && <button className="btn btn--quiet btn--sm" onClick={() => enterXR("immersive-vr")}>Enter VR</button>}
            {xr.ar && !fail && <button className="btn btn--quiet btn--sm" onClick={() => enterXR("immersive-ar")}>Enter AR (tabletop)</button>}
            <span>{!xr.checked ? "Checking for XR…" : xr.on ? `In ${xr.on}: point a controller at a sensor or pin and pull the trigger; the floating panel plays, restarts and hides labels.` : xr.vr || xr.ar ? "XR: implemented, not yet verified on a headset by us." : "XR is not available here (needs a WebXR device and HTTPS). The 3-D and 2-D lab work the same without it."}</span>
            {xr.msg && <span className="bad-t">{xr.msg}</span>}
          </div>

          {scene === "droplet" && (
            <div className="panel" data-klass={c.klass}>
              <div className="panel__head"><div><div className="panel__title">D² against time, the same state as the scene</div><div className="panel__sub">The line is the d² law with this case's K. The horizontal rule is the visible-extinction diameter squared, as NASA recorded it.</div></div><KlassBadge k={c.klass} onClick={openFlexRow} /></div>
              <LineChart x={run.t} series={[{ id: "d2", name: "D², law", color: "var(--g-micro)", values: run.series.d2_mm2 }]} xLabel="time, s" yLabel="D², mm²" height={200} cursor={t} onPick={(x) => { clock.pause(); clock.set(x); }}
                thresholds={c.de != null ? [{ y: c.de * c.de, label: "Dext² (recorded)" }] : []} fmtX={(v) => v.toFixed(1)} fmtY={(v) => v.toFixed(2)} ariaLabel="Squared droplet diameter against time" />
              <details className="fold"><summary>Table view</summary><div className="table-wrap"><table className="table"><thead><tr><th>t, s</th><th className="r">D², mm²</th><th className="r">D drawn, mm</th><th>flame</th></tr></thead><tbody>
                {run.t.filter((_, i) => i % 10 === 0).map((x, i) => <tr key={i}><td className="num">{x.toFixed(2)}</td><td className="r num">{run.series.d2_mm2[i * 10].toFixed(3)}</td><td className="r num">{run.series.d_drawn_mm[i * 10].toFixed(3)}</td><td>{run.series.flame[i * 10] ? "visible" : "out"}</td></tr>)}
              </tbody></table></div></details>
            </div>
          )}
          {scene === "habitat" && reality && sensorSeries && (
            <div className="panel" data-klass="model">
              <div className="panel__head"><div><div className="panel__title">Smoke at the three sensors, the same solution as the slice</div><div className="panel__sub">Relative units; 1 is the alarm level of the lab. Click the chart to move the time; click a sensor in the scene to select it.</div></div><KlassBadge k="model" /></div>
              <LineChart x={Array.from(reality.frames, (_, i) => i * reality.frameDt)} series={sensors.map((s, i) => ({ id: s.id, name: s.name, color: i === 0 ? "var(--ink)" : i === 1 ? "var(--g-micro)" : "var(--series-b)", dash: selected && selected !== s.id ? "4 4" : undefined, values: sensorSeries[s.id] }))}
                xLabel="time, s" yLabel="smoke, relative" height={220} cursor={t} thresholds={[{ y: 1, label: "alarm level" }]} onPick={(x) => clock.set(x)} fmtX={(v) => v.toFixed(0)} fmtY={(v) => v.toFixed(2)} ariaLabel="Smoke at three sensors against time" />
              <details className="fold"><summary>Table view</summary><div className="table-wrap"><table className="table"><thead><tr><th>t, s</th>{sensors.map((s) => <th key={s.id} className="r">{s.name}</th>)}</tr></thead><tbody>
                {Array.from(reality.frames, (_, i) => i).filter((i) => i % 10 === 0).map((i) => <tr key={i}><td className="num">{i * reality.frameDt}</td>{sensors.map((s) => <td key={s.id} className="r num">{sensorSeries[s.id][i].toFixed(3)}</td>)}</tr>)}
              </tbody></table></div></details>
            </div>
          )}
          {scene === "gravity" && (
            <div className="panel" data-klass="model">
              <div className="panel__head"><div><div className="panel__title">What the scaling says, and what it does not</div><div className="panel__sub">Closed-form scaling from the site's physics module; the drawn shapes follow the first row only.</div></div><KlassBadge k="model" /></div>
              <div className="table-wrap"><table className="table"><thead><tr><th>Quantity</th><th className="r">0 g</th><th className="r">{gB} g</th></tr></thead><tbody>
                <tr><td>Buoyant speed relative to 1 g (cube root of g)</td><td className="r num">0</td><td className="r num">{buoyantRatio(gB).toFixed(3)}</td></tr>
                <tr><td>Buoyant flow, cm/s (range of the model)</td><td className="r num">0</td><td className="r num">{buoyantSpeedRange(gB).map((v) => (v * 100).toFixed(1)).join(" to ")}</td></tr>
                <tr><td>Flicker frequency of a 1 cm flame, Hz</td><td className="r num">none</td><td className="r num">{flickerHz(gB, 0.01).toFixed(1)}</td></tr>
              </tbody></table></div>
              <p className="note" style={{ marginTop: 10 }}>Whether a flame keeps burning at lunar gravity is not decided here. NASA's LUCI flights burned fabric and an acrylic rod in simulated lunar gravity; see <a href={href("/material") + "?v=1&m=PMMA&f=rod&o2=0.17&p=na&u=na&g=0.165&pre=custom"}>Material Evidence</a>.</p>
            </div>
          )}
        </section>

        <aside className="lab__drawer" aria-label="Details">
          <h2>{selected ? sensors.find((s) => s.id === selected)?.name : "What you are looking at"}</h2>
          {selected && reality && sensorSeries ? (
            <div className="stack" style={{ ["--gap" as string]: "8px" }}>
              <KlassBadge k="model" />
              <p className="note">Concentration in the solver cell at x = {sensors.find((s) => s.id === selected)!.x.toFixed(2)} m, y = {sensors.find((s) => s.id === selected)!.y.toFixed(2)} m of the slice. Relative units; not ppm.</p>
              <div className="stat__value num">{(sensorSeries[selected][Math.min(reality.frames.length - 1, Math.round(t / reality.frameDt))] ?? 0).toFixed(3)}</div>
              <p className="note">First time above the alarm level: {(() => { const i = sensorSeries[selected].findIndex((v) => v >= 1); return i < 0 ? "never in 180 s" : `${i * reality.frameDt} s`; })()}</p>
              <button className="btn btn--ghost btn--sm" onClick={() => setSelected(null)}>Clear selection</button>
            </div>
          ) : scene === "droplet" ? (
            <div className="stack" style={{ ["--gap" as string]: "8px" }}>
              <p className="note">The droplet's drawn size is <b>computed</b>: D(t) from the d² law with {c.klass === "observed" ? "NASA's measured K" : "the Model Lab estimate"}. The flame shell is a <b>schematic</b>; its radius only follows the droplet.</p>
              <p className="note">{c.de != null ? `The visible flame ends where NASA recorded it, at Dext = ${c.de} mm (t = ${sDrop.tFlameEnd.toFixed(2)} s by the law; NASA states ${c.tb} s). The law's own end, D = 0, would come at ${sDrop.tLawZero.toFixed(2)} s.` : "No extinction diameter for a model case: the flame ends where the law reaches zero, a mathematical end."}</p>
              <p className="note">Axes: +y up in the drawing, no gravity vector (free fall). Units: metres in the scene; droplet and flame enlarged ×40.</p>
            </div>
          ) : scene === "habitat" ? (
            <div className="stack" style={{ ["--gap" as string]: "8px" }}>
              <p className="note">Three modules of conceptual geometry, sizes written on them. Not a digital twin of any NASA vehicle.</p>
              <p className="note">The middle module carries one vertical slice of the site's conservative 2-D transport solver: air enters at the supply fan and leaves by the return duct. Fans {fansOff == null ? "keep running" : `stop at ${fansOff} s`}; the source is prescribed by the model, so the slice cannot say whether a real flame would survive. That is the question of <a href={href("/myths")}>Myths and evidence</a>.</p>
              <p className="note">Particles are a seeded sample of the concentration, for the eye; their number is not data.</p>
            </div>
          ) : (
            <div className="stack" style={{ ["--gap" as string]: "8px" }}>
              <p className="note">Two flames on one clock. The shape stretches with the cube root of gravity and flickers at the model's frequency; both are illustrations of a scaling, not measured flames.</p>
            </div>
          )}
          <hr className="rule" style={{ margin: "14px 0" }} />
          <dl className="kv"><dt>frame rate</dt><dd className="num">{fail ? "2-D view" : `${fps.toFixed(0)} fps (measured, renders only on change)`}</dd><dt>reduced motion</dt><dd>{reduced ? "on: no autoplay; scrub by hand" : "off"}</dd></dl>
          <div className="exportbar" style={{ marginTop: 12 }}>
            <button className="btn btn--quiet btn--sm" onClick={() => download(`zgf_labrun_${scene}.json`, JSON.stringify(scene === "droplet" ? run : { kind: "LabRun", model: "2-D transport, prescribed flow, coarse grid", params: { fans_stop_s: fansOff ?? "never", gravity_g: habitatG }, seed: 0, t: reality ? Array.from(reality.frames, (_, i) => i * reality.frameDt) : [], series: sensorSeries ?? {}, labels: { unit: "relative smoke" } }, null, 1), "application/json")}>Export this run</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
