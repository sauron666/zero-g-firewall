import { useState } from "react";
import { scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useData, fmtUtc } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import { useWidth } from "../lib/hooks";
import { useReceipt } from "../components/Receipt";
import { G0, cabinBound, centripetal, coriolisFraction, gravityGradient, omega } from "../physics/scaling";

interface Atm {
  id: string; name: string; kind: string; p_psia: number; p_kpa: number; x_o2: number; ppo2_kpa: number;
  ppo2_vs_sea_level: number; o2_fraction_vs_air: number; source: string; note: string; Tad_K: Record<string, number>;
}
interface AtmModel {
  method: string; mechanism: string; assumptions: string[]; built_at_utc: string;
  presets: Atm[]; historical: Atm[];
  sweep: { x_o2: number[]; series: { fuel: string; p_kpa: number; label: string; T_K: number[] }[] };
  limit_temperature: { T_limit_K: number; note: string; rows: { fuel: string; N2: number; CO2: number; AR: number }[] };
}
interface ScalingModel {
  formula: string; assumptions: string[]; built_at_utc: string;
  bodies: { id: string; name: string; g: number; buoyant_cm_s: [number, number]; ratio_to_earth: number; plume_cm_s_2cm_flame: number }[];
  reference: { value_cm_s: number; statement: string; doc_id: string; locator: string };
}

function AtmosphereChart({ m }: { m: AtmModel }) {
  const [ref, width] = useWidth<HTMLDivElement>(760);
  const [tip, setTip] = useState<{ a: Atm; x: number; y: number } | null>(null);
  const H = 340, mg = { l: 54, r: 24, t: 16, b: 40 };
  const sx = scaleLinear().domain([10, 100]).range([mg.l, width - mg.r]);
  const sy = scaleLinear().domain([1400, 3300]).range([H - mg.b, mg.t]);
  const base = m.sweep.series[0];
  const path = d3line<number>().x((_, i) => sx(m.sweep.x_o2[i] * 100)).y((v) => sy(v))(base.T_K) ?? "";
  const pts = [...m.presets, ...m.historical];
  // direct labels only for the four habitat presets; the rest are in the tooltip and the table
  const labelOf: Record<string, [number, number, "start" | "end"]> = { iss: [10, 16, "start"], challenge_limit: [10, 18, "start"], exploration: [-10, -12, "end"], suit: [-12, 18, "end"] };
  return (
    <div className="plot" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Equilibrium flame temperature of methane against oxygen fraction, with cabin atmospheres marked">
        <g className="grid">{sy.ticks(5).map((t) => <line key={t} x1={mg.l} x2={width - mg.r} y1={sy(t)} y2={sy(t)} />)}</g>
        <g className="axis">
          <line x1={mg.l} x2={width - mg.r} y1={H - mg.b} y2={H - mg.b} />
          {sy.ticks(5).map((t) => <text key={t} x={mg.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="num">{t.toLocaleString("en-US")}</text>)}
          {[21, 30, 40, 60, 80, 100].map((t) => <text key={t} x={sx(t)} y={H - mg.b + 17} textAnchor="middle" className="num">{t}%</text>)}
          <text x={width - mg.r} y={H - 4} textAnchor="end">oxygen in the atmosphere, by volume</text>
          <text x={mg.l - 46} y={mg.t - 2} className="t-2">flame temperature, K</text>
        </g>
        <path d={path} fill="none" stroke="var(--ink-2)" strokeWidth={2} strokeLinecap="round" />
        <text x={sx(86)} y={sy(base.T_K[base.T_K.length - 8]) + 20} textAnchor="middle" className="t-2">methane at 1 atm</text>
        {pts.map((a) => {
          const x = sx(a.x_o2 * 100), y = sy(a.Tad_K.CH4);
          const hist = a.kind === "historical";
          const lab = labelOf[a.id];
          return (
            <g key={a.id}>
              {hist
                ? <rect x={x - 5} y={y - 5} width={10} height={10} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2} transform={`rotate(45 ${x} ${y})`} />
                : <circle cx={x} cy={y} r={6} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />}
              {lab && <text x={x + lab[0]} y={y + lab[1]} textAnchor={lab[2]} className="t-ink">{a.name.replace(", limit named in the challenge", "")}</text>}
              <circle cx={x} cy={y} r={14} fill="transparent" tabIndex={0} aria-label={`${a.name}: ${a.Tad_K.CH4} K`}
                onPointerEnter={() => setTip({ a, x, y })} onPointerLeave={() => setTip(null)} onFocus={() => setTip({ a, x, y })} onBlur={() => setTip(null)} />
            </g>
          );
        })}
      </svg>
      {tip && (
        <div className="tip" style={{ left: Math.min(Math.max(tip.x + 14, 8), width - 290), top: Math.max(tip.y - 20, 8) }}>
          <b>{tip.a.name}</b>
          <div>{tip.a.p_kpa} kPa ({tip.a.p_psia} psia), {(tip.a.x_o2 * 100).toFixed(tip.a.x_o2 < 1 ? 1 : 0)}% oxygen</div>
          <div>Oxygen partial pressure <b className="num">{tip.a.ppo2_kpa} kPa</b>, {tip.a.ppo2_vs_sea_level.toFixed(2)} times sea level</div>
          <div>Methane <b className="num">{Math.round(tip.a.Tad_K.CH4)} K</b>, ethylene {Math.round(tip.a.Tad_K.C2H4)} K, propane {Math.round(tip.a.Tad_K.C3H8)} K</div>
          <div style={{ marginTop: 4 }}>{tip.a.source}</div>
        </div>
      )}
      <div className="legend" style={{ paddingLeft: mg.l, marginTop: 4 }}>
        <span className="legend__item"><span className="key-dot" style={{ color: "var(--ink)" }} />atmosphere in use or planned, at its own pressure</span>
        <span className="legend__item"><span style={{ width: 8, height: 8, border: "2px solid var(--ink)", transform: "rotate(45deg)", display: "inline-block" }} />historical test atmosphere</span>
        <span className="legend__item"><span className="key-line" style={{ color: "var(--ink-2)" }} />methane at 1 atm</span>
      </div>
    </div>
  );
}

function FanChart({ m }: { m: ScalingModel }) {
  const [ref, width] = useWidth<HTMLDivElement>(760);
  const rows = m.bodies;
  const mg = { l: 124, r: 150, t: 34, b: 36 };
  const rowH = 44, H = mg.t + rows.length * rowH + mg.b;
  const sx = scaleLinear().domain([0, 22]).range([mg.l, width - mg.r]);
  const hue = (g: number) => (g === 0 ? "var(--g-micro)" : g === 1 ? "var(--g-earth)" : "var(--g-partial)");
  return (
    <div className="plot" ref={ref}>
      <svg width={width} height={H} role="img" aria-label="Buoyant flow speed on Earth, Mars and the Moon against the forced flow at which flames are most flammable">
        <g className="grid">{sx.ticks(6).map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={mg.t - 6} y2={H - mg.b} />)}</g>
        <g className="axis">
          <line x1={mg.l} x2={width - mg.r} y1={H - mg.b} y2={H - mg.b} />
          {sx.ticks(6).map((t) => <text key={t} x={sx(t)} y={H - mg.b + 17} textAnchor="middle" className="num">{t}</text>)}
          <text x={width - mg.r} y={H - 4} textAnchor="end">air speed at the flame base, cm/s</text>
        </g>
        {/* the literature reference: a line, not a data point */}
        <line x1={sx(m.reference.value_cm_s)} x2={sx(m.reference.value_cm_s)} y1={mg.t - 12} y2={H - mg.b} stroke="var(--ink)" strokeWidth={1.5} />
        <text x={sx(m.reference.value_cm_s) + 6} y={mg.t - 16} className="t-ink">most flammable forced flow, about 10 cm/s</text>
        {rows.map((b, i) => {
          const y = mg.t + i * rowH + rowH / 2;
          const [lo, hi] = b.buoyant_cm_s;
          return (
            <g key={b.id}>
              <text x={0} y={y} dy="0.32em" className="t-ink">{b.name}</text>
              <text x={0} y={y + 15} dy="0.32em">{b.g === 0 ? "0 g" : `${b.g} g`}</text>
              {b.g > 0 ? (
                <rect x={sx(lo)} y={y - 7} width={sx(hi) - sx(lo)} height={14} rx={4} fill={hue(b.g)}>
                  <title>{`${b.name}: ${lo} to ${hi} cm/s`}</title>
                </rect>
              ) : (
                <circle cx={sx(0)} cy={y} r={6} fill={hue(0)} stroke="var(--surface)" strokeWidth={2}><title>No buoyant flow in free fall</title></circle>
              )}
              <text x={width - mg.r + 10} y={y} dy="0.32em" className="t-ink num">{b.g > 0 ? `${lo} to ${hi} cm/s` : "0: the fans decide"}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Num({ label, value, set, step, min, max, unit }: { label: string; value: number; set: (v: number) => void; step: number; min: number; max: number; unit: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="row" style={{ ["--gap" as string]: "8px", flexWrap: "nowrap" }}>
        <input type="number" value={value} step={step} min={min} max={max} onChange={(e) => set(Math.min(max, Math.max(min, +e.target.value || 0)))} style={{ width: 110 }} />
        <span className="note">{unit}</span>
      </span>
    </label>
  );
}

export function Physics() {
  const atm = useData<AtmModel>("model/atmospheres.json");
  const scl = useData<ScalingModel>("model/scaling.json");
  const openReceipt = useReceipt();
  const [rpm, setRpm] = useState(11);
  const [rad, setRad] = useState(1.22);
  const [vgas, setVgas] = useState(0.1);
  const [q, setQ] = useState(3.2);
  const [dur, setDur] = useState(60);
  const [vol, setVol] = useState(18);
  const a = centripetal(rpm, rad);
  const cb = cabinBound(q, dur, vol);
  const expl = atm.data?.presets.find((p) => p.id === "exploration");
  const iss = atm.data?.presets.find((p) => p.id === "iss");

  return (
    <div className="stack" style={{ ["--gap" as string]: "30px" }}>
      <div className="stack" style={{ ["--gap" as string]: "12px" }}>
        <h1 className="page-title">Flame physics</h1>
        <p className="lede">Four small models, each simple enough to check by hand. They bound what the evidence cannot yet measure. None of them is a prediction.</p>
      </div>

      <section className="panel" data-klass="model">
        <div className="panel__head">
          <div style={{ maxWidth: "64ch" }}>
            <h2 className="claim claim--l">The crew breathes the same oxygen. The flame does not.</h2>
            <p className="prose" style={{ marginTop: 10, fontSize: "1.05rem" }}>
              Lower cabin pressure with more oxygen keeps the oxygen partial pressure the lungs need.
              {iss && expl && <> But with less nitrogen to soak up heat, the equilibrium flame temperature of methane rises from {Math.round(iss.Tad_K.CH4).toLocaleString("en-US")} K in station air to {Math.round(expl.Tad_K.CH4).toLocaleString("en-US")} K in the exploration atmosphere, although its oxygen partial pressure is slightly lower ({expl.ppo2_kpa} against {iss.ppo2_kpa} kPa).</>}
            </p>
          </div>
          <KlassBadge k="model" note="equilibrium bound" onClick={() => atm.data && openReceipt({
            title: "Equilibrium flame temperature across atmospheres", klass: "model",
            rows: [["method", atm.data.method], ["mechanism", atm.data.mechanism], ["artifact", "data/v1/model/atmospheres.json"], ["built", fmtUtc(atm.data.built_at_utc)], ["code", "pipeline/zgf/physics.py, adiabatic_T()"]],
            notes: atm.data.assumptions,
          })} />
        </div>
        {atm.data ? <AtmosphereChart m={atm.data} /> : <div className="empty">{atm.error ?? "Loading the model output"}</div>}
        {atm.data && (
          <details className="fold" style={{ marginTop: 14 }}>
            <summary>Show the atmospheres as a table</summary>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Atmosphere</th><th className="r">Pressure, kPa</th><th className="r">Oxygen</th><th className="r">ppO2, kPa</th><th className="r">ppO2 vs sea level</th><th className="r">CH4, K</th><th className="r">C2H4, K</th><th className="r">C3H8, K</th><th>Source of the atmosphere</th></tr></thead>
                <tbody>
                  {[...atm.data.presets, ...atm.data.historical].map((p) => (
                    <tr key={p.id}><td>{p.name}</td><td className="r">{p.p_kpa}</td><td className="r">{(p.x_o2 * 100).toFixed(1)}%</td><td className="r">{p.ppo2_kpa}</td><td className="r">{p.ppo2_vs_sea_level.toFixed(2)}</td>
                      <td className="r">{Math.round(p.Tad_K.CH4)}</td><td className="r">{Math.round(p.Tad_K.C2H4)}</td><td className="r">{Math.round(p.Tad_K.C3H8)}</td><td>{p.source}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note" style={{ marginTop: 10 }}>{atm.data.limit_temperature.note} Methane: {atm.data.limit_temperature.rows[0].N2}% with nitrogen, {atm.data.limit_temperature.rows[0].CO2}% with carbon dioxide, {atm.data.limit_temperature.rows[0].AR}% with a monatomic gas.</p>
          </details>
        )}
      </section>

      <section className="panel" data-klass="model">
        <div className="panel__head">
          <div style={{ maxWidth: "64ch" }}>
            <h2 className="claim claim--l">On the Moon, gravity is a fan you cannot switch off.</h2>
            <p className="prose" style={{ marginTop: 10, fontSize: "1.05rem" }}>
              Buoyancy moves air past a flame at a speed that scales with the cube root of gravity. Simple scaling puts that speed on the Moon at about
              {scl.data ? ` ${scl.data.bodies.find((b) => b.id === "moon")!.buoyant_cm_s.join(" to ")} cm/s` : " 6 to 11 cm/s"}. NASA's guide places the most flammable forced flow in microgravity tests at about 10 cm/s.
            </p>
          </div>
          <div className="row">
            <KlassBadge k="model" note="order-of-magnitude scaling" onClick={() => scl.data && openReceipt({
              title: "Buoyant flow scale", klass: "model",
              rows: [["formula", scl.data.formula], ["artifact", "data/v1/model/scaling.json"], ["built", fmtUtc(scl.data.built_at_utc)], ["code", "pipeline/zgf/physics.py, buoyant_speed(); web/src/physics/scaling.ts"]],
              notes: scl.data.assumptions,
            })} />
            <KlassBadge k="literature" note="the 10 cm/s reference" onClick={() => scl.data && openReceipt({
              title: "Most flammable forced flow", klass: "literature",
              rows: [["statement", scl.data.reference.statement], ["document", "A Researcher's Guide to: Combustion Science (NP-2015-10-034-JSC)"], ["where", scl.data.reference.locator], ["ledger", "added when the NASA sync is derived"]],
            })} />
          </div>
        </div>
        {scl.data ? <FanChart m={scl.data} /> : <div className="empty">{scl.error ?? "Loading the model output"}</div>}
        <p className="note" style={{ marginTop: 12, maxWidth: "78ch" }}>
          The coefficient of the scale is uncertain; the dependence on gravity is the robust part. This is a comparison of orders of magnitude, in line with published statements that lunar gravity is near the most flammable condition. FM2 is designed to measure the real behaviour on the Moon.
        </p>
      </section>

      <section className="grid cols-2">
        <div className="panel" data-klass="model">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">How faithful is spun-up gravity?</h2>
              <p className="panel__sub">A spinning platform makes gravity by rotation. Rotation also bends moving gas sideways (Coriolis) and makes gravity vary along the sample.</p>
            </div>
            <KlassBadge k="model" />
          </div>
          <div className="row" style={{ ["--gap" as string]: "16px", alignItems: "flex-end" }}>
            <Num label="Spin rate" value={rpm} set={setRpm} step={0.5} min={1} max={60} unit="rpm" />
            <Num label="Radius" value={rad} set={setRad} step={0.01} min={0.2} max={20} unit="m" />
            <Num label="Gas speed" value={vgas} set={setVgas} step={0.01} min={0.01} max={2} unit="m/s" />
            <button className="btn btn--quiet btn--sm" onClick={() => { setRpm(11); setRad(1.22); setVgas(0.1); }}>LUCI values</button>
          </div>
          <dl className="kv" style={{ marginTop: 18 }}>
            <dt>Simulated gravity</dt><dd><b className="num">{a.toFixed(3)} m/s²</b>, {(a / G0).toFixed(3)} g</dd>
            <dt>Coriolis acceleration</dt><dd><b className="num">{(2 * omega(rpm) * vgas).toFixed(3)} m/s²</b>, {(coriolisFraction(rpm, rad, vgas) * 100).toFixed(0)}% of the simulated gravity</dd>
            <dt>Gravity change across 10 cm</dt><dd><b className="num">{(gravityGradient(0.1, rad) * 100).toFixed(1)}%</b></dd>
          </dl>
          <p className="note" style={{ marginTop: 12 }}>LUCI spun a sounding-rocket payload at 11 rpm with the sample at 1.22 m (NTRS 20250010653). On the lunar surface there is no Coriolis term, which is why FM2 matters.</p>
        </div>

        <div className="panel" data-klass="model">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">What a fire does to cabin air</h2>
              <p className="panel__sub">Upper bounds for a well-mixed, closed, adiabatic cabin. Walls absorb most of the heat in reality.</p>
            </div>
            <KlassBadge k="model" note="upper bounds" />
          </div>
          <div className="row" style={{ ["--gap" as string]: "16px", alignItems: "flex-end" }}>
            <Num label="Fire power" value={q} set={setQ} step={0.1} min={0.01} max={50} unit="kW" />
            <Num label="Duration" value={dur} set={setDur} step={10} min={1} max={3600} unit="s" />
            <Num label="Free volume" value={vol} set={setVol} step={1} min={1} max={1000} unit="m³" />
          </div>
          <dl className="kv" style={{ marginTop: 18 }}>
            <dt>Oxygen consumed</dt><dd><b className="num">{cb.o2Grams.toFixed(1)} g</b> at 13.1 kJ per gram</dd>
            <dt>Carbon dioxide added</dt><dd><b className="num">{Math.round(cb.co2Ppm).toLocaleString("en-US")} ppm</b> for PMMA</dd>
            <dt>Temperature rise, at most</dt><dd><b className="num">{cb.dT.toFixed(1)} K</b></dd>
            <dt>Pressure rise, at most</dt><dd><b className="num">{(cb.dPfrac * 100).toFixed(1)}%</b></dd>
          </dl>
          <p className="note" style={{ marginTop: 12 }}>Default values are the Saffire scale: 1.5 to 3.2 kW in 17 to 19 m³ (NTRS 20240002981), where gas rises mattered more than heat and pressure. Carbon monoxide is not computed.</p>
        </div>
      </section>

      <section className="empty">
        <p className="empty__title">Checked against NASA's own numbers: waiting for the NASA sync</p>
        <p style={{ marginTop: 8, maxWidth: "74ch" }}>
          Two PSI tables (ACME Flame Design and CFI-G) carry NASA's computed flame temperature and stoichiometric mixture fraction for every test. Once the tables are fetched, this model is run on each row and the differences are shown here with the number of rows and the error.
        </p>
      </section>
    </div>
  );
}
