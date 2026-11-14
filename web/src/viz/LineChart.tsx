import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { line as d3line } from "d3-shape";
import { useWidth } from "../lib/hooks";

export interface Series {
  id: string;
  name: string;
  color: string;      // a CSS colour or variable
  dash?: string;
  values: ArrayLike<number>;
}
export interface LineChartProps {
  x: ArrayLike<number>;
  series: Series[];
  xLabel: string;
  yLabel: string;
  height?: number;
  yMax?: number;
  thresholds?: { y: number; label: string }[];
  cursor?: number | null;                  // a controlled x position (for example the scrubbed time)
  onPick?: (x: number) => void;            // click to set the cursor
  fmtX?: (x: number) => string;
  fmtY?: (y: number) => string;
  ariaLabel: string;
}

const niceTicks = (max: number, n = 4) => scaleLinear().domain([0, max]).nice(n).ticks(n);

export function LineChart(p: LineChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const H = p.height ?? 240;
  const m = { l: 46, r: 92, t: 30, b: 34 };
  const n = p.x.length;
  const xMax = p.x[n - 1];
  const yMax = useMemo(() => {
    if (p.yMax) return p.yMax;
    let mx = 0;
    for (const s of p.series) for (let i = 0; i < s.values.length; i++) if (s.values[i] > mx) mx = s.values[i];
    for (const t of p.thresholds ?? []) mx = Math.max(mx, t.y * 1.3);
    return mx || 1;
  }, [p.series, p.yMax, p.thresholds]);
  const sx = scaleLinear().domain([p.x[0], xMax]).range([m.l, width - m.r]);
  const sy = scaleLinear().domain([0, yMax]).nice(4).range([H - m.b, m.t]);
  const fx = p.fmtX ?? ((v: number) => `${Math.round(v)}`);
  const fy = p.fmtY ?? ((v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)));
  const paths = p.series.map((s) => {
    const gen = d3line<number>().x((_, i) => sx(p.x[i])).y((v) => sy(Math.min(v, sy.domain()[1])));
    return gen(Array.from(s.values as ArrayLike<number>)) ?? "";
  });
  const idxOf = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const xv = sx.invert(clientX - r.left);
    const step = (xMax - p.x[0]) / (n - 1);
    return Math.max(0, Math.min(n - 1, Math.round((xv - p.x[0]) / step)));
  };
  const hi = hover;
  const cur = p.cursor ?? null;
  const tipLeft = hi !== null ? Math.min(Math.max(sx(p.x[hi]) + 12, m.l), width - 190) : 0;

  return (
    <div className="plot" ref={ref}>
      <svg width={width} height={H} role="img" aria-label={p.ariaLabel}
        onPointerMove={(e) => setHover(idxOf(e.clientX, e.currentTarget))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => p.onPick?.(p.x[idxOf(e.clientX, e.currentTarget)])}
        style={{ cursor: p.onPick ? "crosshair" : "default", touchAction: "pan-y" }}>
        <g className="grid">
          {sy.ticks(4).map((t) => <line key={t} x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} />)}
        </g>
        <g className="axis">
          <line x1={m.l} x2={width - m.r} y1={H - m.b} y2={H - m.b} />
          {sy.ticks(4).map((t) => <text key={t} x={m.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="num">{fy(t)}</text>)}
          {sx.ticks(Math.max(3, Math.min(8, Math.floor(width / 110)))).map((t) => (
            <text key={t} x={sx(t)} y={H - m.b + 16} textAnchor="middle" className="num">{fx(t)}</text>
          ))}
          <text x={width - m.r} y={H - 4} textAnchor="end">{p.xLabel}</text>
          <text x={4} y={12} textAnchor="start" className="t-2">{p.yLabel}</text>
        </g>
        {(p.thresholds ?? []).map((t) => (
          <g key={t.label}>
            <line x1={m.l} x2={width - m.r} y1={sy(t.y)} y2={sy(t.y)} stroke="var(--critical)" strokeWidth={1} />
            <text x={width - m.r + 6} y={sy(t.y)} dy="0.32em" className="t-2">{t.label}</text>
          </g>
        ))}
        {p.series.map((s, i) => (
          <g key={s.id}>
            <path d={paths[i]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />
            <text x={width - m.r + 6} y={sy(Math.min(s.values[n - 1], sy.domain()[1]))} dy="0.32em" className="t-ink">{s.name}</text>
          </g>
        ))}
        {cur !== null && (
          <line x1={sx(cur)} x2={sx(cur)} y1={m.t} y2={H - m.b} stroke="var(--ink)" strokeWidth={1} />
        )}
        {hi !== null && (
          <g pointerEvents="none">
            <line x1={sx(p.x[hi])} x2={sx(p.x[hi])} y1={m.t} y2={H - m.b} stroke="var(--ink-3)" strokeWidth={1} />
            {p.series.map((s) => (
              <circle key={s.id} cx={sx(p.x[hi])} cy={sy(Math.min(s.values[hi], sy.domain()[1]))} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hi !== null && (
        <div className="tip" style={{ left: tipLeft, top: m.t + 4 }}>
          <div>{p.xLabel}: <b className="num">{fx(p.x[hi])}</b></div>
          {p.series.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span className="key-line" style={{ color: s.color, borderTopStyle: s.dash ? "dashed" : "solid" }} />
              <b className="num">{fy(s.values[hi])}</b>
              <span>{s.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="legend" style={{ marginTop: 6, paddingLeft: m.l }}>
        {p.series.map((s) => (
          <span className="legend__item" key={s.id}>
            <span className="key-line" style={{ color: s.color, borderTopStyle: s.dash ? "dashed" : "solid" }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
