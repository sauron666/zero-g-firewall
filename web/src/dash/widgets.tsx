import { useEffect, useMemo, useRef, useState } from "react";
import { href } from "../app/router";
import { fmtInt } from "../lib/data";
import { rankAll } from "../lib/rank";
import type { CoverageBlock, RankDoc } from "../lib/types";
import { SENSORS, STEP, truthSeries } from "../trust/lab";
import { coverColumns, coverStep } from "../viz/OxygenCover";

const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A number that runs up to its value once, when it first has one. The value shown at rest is always the real one. */
export function useCountUp(target: number | null, ms = 900): number | null {
  const [v, setV] = useState<number | null>(target == null || still() ? target : 0);
  useEffect(() => {
    if (target == null) { setV(null); return; }
    if (still()) { setV(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const f = Math.min(1, (now - t0) / ms);
      setV(target * (1 - Math.pow(1 - f, 3)));
      if (f < 1) raf = requestAnimationFrame(tick); else setV(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Tile({ label, value, decimals = 0, unit, of, sub, to, tone = "micro", led }: {
  label: string; value: number | null; decimals?: number; unit?: string; of?: string; sub: string; to?: string; tone?: "micro" | "partial" | "ok" | "flame"; led?: boolean;
}) {
  const v = useCountUp(value);
  const shown = v == null ? "–" : decimals ? v.toFixed(decimals) : fmtInt(Math.round(v));
  const say = `${label}: ${value == null ? "not loaded" : decimals ? value.toFixed(decimals) : fmtInt(value)}${unit ? ` ${unit}` : ""} ${of ?? ""}. ${sub}`;
  const body = (
    <>
      <span className="tile__label">{label}</span>
      <span className="tile__value">{shown}{unit && <small>{unit}</small>}{of && <small>{of}</small>}</span>
      <span className="tile__sub">{led && <span className="dot dot--ok" />}{sub}</span>
    </>
  );
  return to ? <a className={`tile tile--${tone}`} href={to} aria-label={say}>{body}</a> : <div className={`tile tile--${tone}`} role="group" aria-label={say}>{body}</div>;
}

/** The readings at the head of a page: the few numbers the page is about, before any explanation. */
export function Readings({ children }: { children: React.ReactNode }) {
  return <div className="deck__strip deck__strip--page">{children}</div>;
}

/** A ring that fills to value out of total. With nothing measured it is drawn as an empty dashed ring, never as a thin arc. */
export function Ring({ value, total, tone, title, cap }: { value: number; total: number; tone: string; title: string; cap: string }) {
  const C = 2 * Math.PI * 42;
  const [on, setOn] = useState(still());
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  const f = total ? value / total : 0;
  return (
    <div>
      <div className={`ring ${value === 0 ? "ring--empty" : ""}`} style={{ ["--tone" as string]: tone }} role="img" aria-label={`${title}: ${value} of ${total} ${cap}`}>
        <svg viewBox="0 0 100 100">
          <circle className="ring__track" cx="50" cy="50" r="42" />
          {value > 0 && <circle className="ring__arc" cx="50" cy="50" r="42" strokeDasharray={C} strokeDashoffset={on ? C * (1 - f) : C} />}
        </svg>
        <div className="ring__mid"><b>{value}</b><span>of {total}</span></div>
      </div>
      <p className="ring__cap"><b>{title}</b>{cap}</p>
    </div>
  );
}

const SHORT: Record<string, string> = { solid: "Solids", droplet: "Droplets", gas: "Gas flames" };

/** The oxygen coverage chart at a glance: three rows of squares for free fall, and the same three, empty, for partial gravity. */
export function MiniCover({ c }: { c: CoverageBlock }) {
  const { cols, hi } = coverColumns(c);
  const atm = new Set(c.atmospheres.filter((a) => a.pct <= hi).map((a) => a.pct));
  const style = { ["--cov-n" as string]: cols.length } as React.CSSProperties;
  const rows = (regime: "micro" | "partial") => c.kinds.map((k) => (
    <div className="minicov__row" key={regime + k.id}>
      <span>{SHORT[k.id] ?? k.label}</span>
      {cols.map((p) => {
        const n = regime === "micro" ? c.cells[k.id]?.[String(p)]?.n ?? 0 : 0;
        return <span key={p} className={`cov__cell cov__cell--${coverStep(n)}${atm.has(p) ? " cov__cell--atm" : ""}`} title={`${k.label}, ${p}% oxygen: ${n ? `${n} rows` : "no rows"}`} />;
      })}
    </div>
  ));
  const reg = (id: string) => c.regimes.find((r) => r.id === id);
  return (
    <div className="minicov" style={style} role="img" aria-label={`Test rows by oxygen: ${fmtInt(reg("micro")?.rows ?? 0)} in free fall, ${reg("partial")?.rows ?? 0} in lunar or Martian gravity`}>
      <div className="minicov__head"><span className="gdot gdot--micro" />Free fall · {fmtInt(reg("micro")?.rows ?? 0)} rows</div>
      {rows("micro")}
      <div className="minicov__head"><span className="gdot gdot--partial" />Lunar or Martian gravity · {reg("partial")?.rows ?? 0} rows</div>
      {rows("partial")}
      <div className="minicov__axis"><span /><div><span>{cols[0]}%</span><span>oxygen</span><span>{hi}%</span></div></div>
    </div>
  );
}

/** A parity plot the size of a stamp: every point is a real pair, the line is agreement. */
export function MiniParity({ pts, lo, hi, label }: { pts: [number, number][]; lo: number; hi: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const S = 96;
    cv.width = cv.height = S * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(cv);
    const m = 8, s = (v: number) => m + ((v - lo) / (hi - lo)) * (S - 2 * m);
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = css.getPropertyValue("--axis").trim() || "#445";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s(lo), S - s(lo)); ctx.lineTo(s(hi), S - s(hi)); ctx.stroke();
    ctx.fillStyle = css.getPropertyValue("--g-micro").trim() || "#3987e5";
    ctx.globalAlpha = 0.55;
    for (const [x, y] of pts) {
      if (x < lo || x > hi || y < lo || y > hi) continue;
      ctx.beginPath(); ctx.arc(s(x), S - s(y), 1.5, 0, 6.2832); ctx.fill();
    }
  }, [pts, lo, hi]);
  return <canvas ref={ref} role="img" aria-label={label} />;
}

export function TopFive({ doc, lens }: { doc: RankDoc; lens: string }) {
  const L = doc.lenses.find((l) => l.id === lens) ?? doc.lenses[0];
  const top = useMemo(() => rankAll(doc, L.id, L.weights).slice(0, 5), [doc, L]);
  return (
    <div className="top5">
      {top.map((r) => (
        <a key={r.item.accession} href={href(`/evidence/${r.item.accession}`)} title={r.item.title}>
          <b>{r.item.acronym || r.item.accession}</b>
          <i style={{ ["--w" as string]: `${Math.round(100 * r.total)}%` }} />
          <span>{Math.round(100 * r.total)}</span>
        </a>
      ))}
    </div>
  );
}

export function Chain({ head, n = 26 }: { head: string; n?: number }) {
  return (
    <>
      <div className="chain" aria-hidden="true">{Array.from({ length: n }, (_, i) => <i key={i} style={{ ["--i" as string]: i }} />)}</div>
      <p className="chain__hash" title="SHA-256 of the last entry of the ledger">head {head.slice(0, 20)}…{head.slice(-8)}</p>
    </>
  );
}

/**
 * One synthetic fire from the alarm lab, seen by the smoke detector in the return duct in two cabins:
 * fans running, and fans stopped. The sentence under the chart is read from the two series, not written in advance.
 */
export function AlarmSpark() {
  const [d, setD] = useState<{ on: number[]; off: number[]; at: number | null } | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => {                      // after first paint: each scenario runs the transport model
      const a = truthSeries("fire", 3), b = truthSeries("fire_fans_off", 3);
      setD({ on: a.series.smoke_duct, off: b.series.smoke_duct, at: b.fansOffAt });
    }, 250);
    return () => clearTimeout(id);
  }, []);
  if (!d) return <div className="spark" />;
  const W = 300, H = 92, n = d.on.length, thr = SENSORS.smoke_duct.threshold;
  const top = Math.max(...d.on, ...d.off, thr) * 1.06;
  const x = (i: number) => (i / (n - 1)) * W, y = (v: number) => H - 4 - (v / top) * (H - 10);
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const cross = (a: number[]) => { const i = a.findIndex((v) => v >= thr); return i < 0 ? null : i * STEP; };
  const tOn = cross(d.on), tOff = cross(d.off);
  return (
    <>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Synthetic readings of the smoke detector in the duct during one fire, with the fans running and with the fans stopped">
        <path className="thr" d={`M0 ${y(thr)}H${W}`} />
        {d.at != null && <path className="thr" d={`M${x(d.at / STEP)} 0V${H}`} />}
        <path d={path(d.off)} stroke="var(--series-b)" />
        <path d={path(d.on)} stroke="var(--ink)" />
      </svg>
      <div className="spark__legend">
        <span><i style={{ ["--c" as string]: "var(--ink)" }} />fans running</span>
        <span><i style={{ ["--c" as string]: "var(--series-b)" }} />fans stopped{d.at != null ? ` at ${d.at} s` : ""}</span>
        <span>dashed: alarm level</span>
      </div>
      <p className="dpanel__say" style={{ fontSize: "0.98rem" }}>
        One fire, one smoke detector in the duct. {tOn != null ? `With the fans running it alarms after ${tOn} s.` : "With the fans running it stays below the alarm level."}
        {" "}{tOff == null ? "With the fans stopped, the smoke stays below the alarm level." : `With the fans stopped it alarms after ${tOff} s.`}
      </p>
    </>
  );
}
