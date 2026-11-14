import { useMemo, useState } from "react";
import { scaleLinear } from "d3-scale";
import { symbol, symbolCircle, symbolCross, symbolDiamond, symbolSquare, symbolTriangle } from "d3-shape";
import { useWidth } from "../lib/hooks";

export type Shape = "circle" | "square" | "triangle" | "diamond" | "cross";
const SHAPES = { circle: symbolCircle, square: symbolSquare, triangle: symbolTriangle, diamond: symbolDiamond, cross: symbolCross };
export const shapePath = (s: Shape, size = 42) => symbol().type(SHAPES[s]).size(size)() ?? "";

export interface ScatterGroup {
  id: string;
  name: string;
  shape: Shape;
  color: string;        // a CSS colour or variable; hue carries the gravity regime, the shape carries the series
  hollow?: boolean;
}
export interface ScatterPoint {
  x: number;
  y: number;
  group: string;
  title: string;
  tip: [string, string][];
  ref?: unknown;
  size?: number;        // symbol area in px²; use it to show how many rows share a position
}
export interface ScatterMark {
  x: number;
  y: number;
  label: string;
  kind: "target" | "diamond" | "pin";      // pin: a point the reader set
  place?: "right" | "left" | "above" | "below";
}
export interface ScatterProps {
  points: ScatterPoint[];
  groups: ScatterGroup[];
  xLabel: string;
  yLabel: string;
  xDomain: [number, number];
  yDomain: [number, number];
  height?: number;
  curves?: { pts: [number, number][]; label: string; dash?: string; labelAt?: [number, number] }[];
  marks?: ScatterMark[];
  /** windows in data units, drawn behind the points with a dashed edge: "near" a chosen atmosphere */
  regions?: { x0: number; x1: number; y0: number; y1: number; label?: string }[];
  diagonal?: boolean;                 // the line y = x, for parity plots
  onPick?: (p: ScatterPoint) => void;
  fmtX?: (x: number) => string;
  fmtY?: (y: number) => string;
  ariaLabel: string;
}

/** A scatter plot with one axis pair, a hairline grid, hover on the nearest point and click for the receipt. */
export function Scatter(p: ScatterProps) {
  const [ref, width] = useWidth<HTMLDivElement>(760);
  const [hover, setHover] = useState<number | null>(null);
  const H = p.height ?? 420;
  const m = { l: 54, r: 18, t: 30, b: 40 };
  const sx = useMemo(() => scaleLinear().domain(p.xDomain).range([m.l, Math.max(m.l + 60, width - m.r)]), [p.xDomain, width]);
  const sy = useMemo(() => scaleLinear().domain(p.yDomain).range([H - m.b, m.t]), [p.yDomain, H]);
  const fx = p.fmtX ?? ((v: number) => String(v));
  const fy = p.fmtY ?? ((v: number) => String(v));
  const gById = useMemo(() => new Map(p.groups.map((g) => [g.id, g])), [p.groups]);
  const px = useMemo(() => p.points.map((d) => [sx(d.x), sy(d.y)] as [number, number]), [p.points, sx, sy]);
  const inside = (d: ScatterPoint) => d.x >= p.xDomain[0] && d.x <= p.xDomain[1] && d.y >= p.yDomain[0] && d.y <= p.yDomain[1];

  const nearest = (ev: React.MouseEvent<SVGSVGElement>) => {
    const box = ev.currentTarget.getBoundingClientRect();
    const mx = ev.clientX - box.left;
    const my = ev.clientY - box.top;
    let best = -1;
    let bd = 20 * 20;
    for (let i = 0; i < px.length; i++) {
      if (!inside(p.points[i])) continue;
      const d = (px[i][0] - mx) ** 2 + (px[i][1] - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };
  const h = hover != null ? p.points[hover] : null;
  const hp = hover != null ? px[hover] : null;

  return (
    <div className="plot" ref={ref}>
      <svg
        width={width} height={H} role="img" aria-label={p.ariaLabel}
        onMouseMove={(e) => { const i = nearest(e); setHover(i >= 0 ? i : null); }}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => { const i = nearest(e); if (i >= 0 && p.onPick) p.onPick(p.points[i]); }}
        style={{ cursor: hover != null && p.onPick ? "pointer" : "default", display: "block" }}
      >
        <g className="grid">
          {sy.ticks(6).map((t) => <line key={"y" + t} x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} />)}
          {sx.ticks(7).map((t) => <line key={"x" + t} y1={m.t} y2={H - m.b} x1={sx(t)} x2={sx(t)} />)}
        </g>
        <g className="axis">
          <line x1={m.l} x2={width - m.r} y1={H - m.b} y2={H - m.b} />
          <line x1={m.l} x2={m.l} y1={m.t} y2={H - m.b} />
        </g>
        {sy.ticks(6).map((t) => <text key={"ty" + t} x={m.l - 8} y={sy(t) + 4} textAnchor="end" className="num">{fy(t)}</text>)}
        {sx.ticks(7).map((t) => <text key={"tx" + t} x={sx(t)} y={H - m.b + 17} textAnchor="middle" className="num">{fx(t)}</text>)}
        <text x={m.l - 44} y={14} className="t-2">{p.yLabel}</text>
        <text x={width - m.r} y={H - 4} textAnchor="end" className="t-2">{p.xLabel}</text>

        {(p.regions ?? []).map((r, i) => {
          const x0 = sx(Math.max(r.x0, p.xDomain[0])), x1 = sx(Math.min(r.x1, p.xDomain[1]));
          const y0 = sy(Math.min(r.y1, p.yDomain[1])), y1 = sy(Math.max(r.y0, p.yDomain[0]));
          if (x1 <= x0 || y1 <= y0) return null;
          return (
            <g key={"r" + i}>
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={3} fill="var(--ink)" fillOpacity={0.07} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="6 4" />
              {r.label && <text x={x0 + 6} y={y0 - 6} className="t-ink" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" }}>{r.label}</text>}
            </g>
          );
        })}
        {p.diagonal && (
          <line x1={sx(Math.max(p.xDomain[0], p.yDomain[0]))} y1={sy(Math.max(p.xDomain[0], p.yDomain[0]))}
                x2={sx(Math.min(p.xDomain[1], p.yDomain[1]))} y2={sy(Math.min(p.xDomain[1], p.yDomain[1]))}
                stroke="var(--ink-3)" strokeWidth={1} />
        )}
        {(p.curves ?? []).map((c, i) => {
          const pts = c.pts.filter(([x, y]) => x >= p.xDomain[0] && x <= p.xDomain[1] && y >= p.yDomain[0] && y <= p.yDomain[1]);
          if (pts.length < 2) return null;
          const last = pts[pts.length - 1];
          return (
            <g key={i}>
              <polyline points={pts.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray={c.dash ?? "5 4"} />
              {c.labelAt
                ? <text x={sx(c.labelAt[0])} y={sy(c.labelAt[1])} className="t-2" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" }}>{c.label}</text>
                : <text x={sx(last[0]) - 4} y={sy(last[1]) - 7} textAnchor="end" className="t-2">{c.label}</text>}
            </g>
          );
        })}

        <g>
          {p.points.map((d, i) => {
            if (!inside(d)) return null;
            const g = gById.get(d.group);
            if (!g) return null;
            return (
              <path key={i} d={shapePath(g.shape, d.size ?? 42)} transform={`translate(${px[i][0]},${px[i][1]})`}
                    fill={g.hollow ? "var(--surface)" : g.color} fillOpacity={g.hollow ? 1 : 0.78}
                    stroke={g.hollow ? g.color : "var(--surface)"} strokeWidth={g.hollow ? 1.5 : 0.8} />
            );
          })}
        </g>

        {(p.marks ?? []).filter((k) => k.x >= p.xDomain[0] && k.x <= p.xDomain[1] && k.y >= p.yDomain[0] && k.y <= p.yDomain[1]).map((k, i) => {
          const X = sx(k.x);
          const Y = sy(k.y);
          const pl = k.place ?? "right";
          const tx = pl === "left" ? X - 12 : pl === "right" ? X + 12 : X;
          const ty = pl === "above" ? Y - 13 : pl === "below" ? Y + 22 : Y + 4;
          return (
            <g key={"m" + i}>
              {k.kind === "pin" ? (
                <>
                  <circle cx={X} cy={Y} r={11} fill="none" stroke="var(--ink)" strokeWidth={1.2} strokeDasharray="2 3" />
                  <circle cx={X} cy={Y} r={4.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />
                </>
              ) : k.kind === "target" ? (
                <>
                  <circle cx={X} cy={Y} r={7.5} fill="none" stroke="var(--ink)" strokeWidth={1.6} />
                  <path d={`M${X - 12} ${Y}H${X - 4}M${X + 4} ${Y}H${X + 12}M${X} ${Y - 12}V${Y - 4}M${X} ${Y + 4}V${Y + 12}`} stroke="var(--ink)" strokeWidth={1.6} />
                </>
              ) : (
                <path d={shapePath("diamond", 90)} transform={`translate(${X},${Y})`} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1.6} strokeDasharray="3 2" />
              )}
              <text x={tx} y={ty} textAnchor={pl === "left" ? "end" : pl === "right" ? "start" : "middle"} className="t-ink"
                    style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" }}>{k.label}</text>
            </g>
          );
        })}

        {h && hp && <circle cx={hp[0]} cy={hp[1]} r={Math.sqrt((h.size ?? 42) / Math.PI) + 5} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
      </svg>
      {h && hp && (
        <div className="tip" style={{ left: Math.min(hp[0] + 14, width - 250), top: Math.max(hp[1] - 12, 0) }}>
          <b>{h.title}</b>
          {h.tip.map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 14 }}><span>{k}</span><span className="num" style={{ color: "var(--ink)" }}>{v}</span></div>
          ))}
          {p.onPick && <div style={{ marginTop: 4, color: "var(--ink-3)" }}>Click for the receipt</div>}
        </div>
      )}
    </div>
  );
}

export function ScatterLegend({ groups, counts, hidden, onToggle, extra }: {
  groups: ScatterGroup[];
  counts?: Record<string, number>;
  hidden?: Set<string>;
  onToggle?: (id: string) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="legend" style={{ rowGap: 8 }}>
      {groups.map((g) => {
        const off = hidden?.has(g.id);
        const body = (
          <>
            <svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">
              <path d={shapePath(g.shape, 46)} fill={g.hollow ? "var(--surface)" : g.color} stroke={g.hollow ? g.color : "none"} strokeWidth={1.5} opacity={off ? 0.3 : 1} />
            </svg>
            <span style={{ textDecoration: off ? "line-through" : "none" }}>{g.name}{counts ? ` (${(counts[g.id] ?? 0).toLocaleString("en-US")})` : ""}</span>
          </>
        );
        return onToggle ? (
          <button key={g.id} type="button" className="legend__item legend__btn" aria-pressed={!off} onClick={() => onToggle(g.id)}>{body}</button>
        ) : (
          <span key={g.id} className="legend__item">{body}</span>
        );
      })}
      {extra}
    </div>
  );
}
