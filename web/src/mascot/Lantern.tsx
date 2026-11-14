import { useEffect, useRef } from "react";
import type { Klass } from "../lib/klass";
import { shape } from "./flame";

export type Mood = "idle" | "searching" | "pointing" | "gap" | "sceptical" | "alarm" | "success";
/** How the ring is drawn for each class of information. Pattern and weight, never hue alone. */
export const RING: Record<Klass, { dash?: string; width: number; double?: boolean; cap?: "round" | "butt" }> = {
  observed: { width: 3.2 },
  literature: { width: 1.3, double: true },
  derived: { width: 2.2, dash: "9 4" },
  model: { width: 2.2, dash: "3.5 3.5" },
  synthetic: { width: 4, dash: "1.6 3.2", cap: "butt" },
  live: { width: 3.2 },
  recorded: { width: 2.2, dash: "9 3 2 3" },
  illustrative: { width: 2.4, dash: "0.1 4.6", cap: "round" },
};

interface Props { g: number; fansOffAt: number | null; klass: Klass; mood?: Mood; size?: number; label?: string }

/**
 * ISKRA's body: a pocket lantern that carries a small flame in a glass core. The shell is the helper; the flame is the science.
 * The flame is a schematic: it follows gravity and the fans as flame.ts describes, and it is not a simulation of any material.
 */
export function Lantern({ g, fansOffAt, klass, mood = "idle", size = 64, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ g, fansOffAt, mood });
  live.current = { g, fansOffAt, mood };

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = cv.height = Math.round(size * dpr);
    let raf = 0, shownG = live.current.g, t0 = performance.now();

    const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
      if (r < 0.4 || a < 0.004) return;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.5, `rgba(${rgb},${a * 0.42})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    };
    const draw = (now: number) => {
      const p = live.current;
      const t = (now - t0) / 1000;
      shownG += (p.g - shownG) * 0.08;                                      // a change of gravity is eased, so the flame grows rather than jumps
      const s = shape(shownG, p.fansOffAt == null ? null : Math.max(0, (now - p.fansOffAt) / 1000));
      const W = cv.width, R = W * 0.33, cx = W / 2, cy = W * 0.5;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, W);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#04070d";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, Math.PI * 2); ctx.clip();
      const pale = p.mood === "gap" ? 0.45 : 1;
      if (s.strength > 0.01) {
        ctx.globalCompositeOperation = "lighter";
        const flick = reduce ? 0 : Math.sin(t * (4 + 9 * Math.sqrt(Math.max(0, shownG)))) * 0.05 * s.stretch;
        const fy = cy + R * 0.28 * s.stretch;                               // in gravity the flame sits lower and reaches up
        const fx = cx + s.wobble * R * 0.5;
        const r0 = R * (0.3 + 0.24 * s.strength);
        const N = 9, L = R * 1.25 * s.stretch * (0.5 + 0.5 * s.strength) * (1 + flick);
        for (let i = N; i >= 1; i--) {                                      // the tail, drawn tip first: warmer and thinner towards the tip
          const k = i / N;
          const mix = s.warm * k;
          const rgb = `${Math.round(110 + 145 * mix)},${Math.round(165 + 30 * mix)},${Math.round(255 - 135 * mix)}`;
          blob(fx + Math.sin(t * 5 + i) * R * 0.02 * s.stretch, fy - L * k, r0 * (1 - 0.62 * k), rgb, 0.3 * s.strength * (1 - 0.45 * k) * pale);
        }
        blob(fx, fy, r0 * 1.9, "70,130,255", 0.34 * s.strength * pale);     // the blue of a soot-free flame
        blob(fx, fy, r0 * 1.05, "120,180,255", 0.7 * s.strength * pale);
        blob(fx, fy, r0 * 0.5, "225,238,255", 0.85 * s.strength * pale);
      }
      ctx.restore();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(190,208,240,0.6)"; ctx.lineWidth = Math.max(1, W * 0.014);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = Math.max(1, W * 0.02);  // a glint on the glass
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.78, Math.PI * 1.12, Math.PI * 1.42); ctx.stroke();
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    const vis = () => { cancelAnimationFrame(raf); if (document.visibilityState === "visible") raf = requestAnimationFrame(draw); };   // nothing is drawn in a hidden tab
    document.addEventListener("visibilitychange", vis);
    raf = requestAnimationFrame(draw);
    const again = reduce ? window.setInterval(() => requestAnimationFrame(draw), 400) : 0;   // reduced motion: still pictures that follow the state
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", vis); if (again) clearInterval(again); };
  }, [size]);

  const r = RING[klass];
  const partial = g > 0.02 && g < 0.98;
  const ring = (half: "back" | "front") => (
    <svg className={`lantern__ring lantern__ring--${half}`} viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-13 50 50)">
        <path d={half === "back" ? "M6 50 A44 13 0 0 1 94 50" : "M6 50 A44 13 0 0 0 94 50"} fill="none" stroke="currentColor" strokeWidth={r.width} strokeDasharray={r.dash} strokeLinecap={r.cap ?? "butt"} opacity={half === "back" ? 0.5 : 1} />
        {r.double && <path d={half === "back" ? "M10.5 50 A39.5 10.5 0 0 1 89.5 50" : "M10.5 50 A39.5 10.5 0 0 0 89.5 50"} fill="none" stroke="currentColor" strokeWidth={r.width} opacity={half === "back" ? 0.5 : 1} />}
        {half === "front" && (
          <>
            <ellipse className="lantern__eye" cx="38" cy="61.4" rx="3.1" ry="3.1" />
            <ellipse className="lantern__eye" cx="60" cy="62" rx="3.1" ry="3.1" />
            <rect x="1.5" y="47" width="5" height="6" rx="1.4" fill="currentColor" />
            <rect x="93.5" y="47" width="5" height="6" rx="1.4" fill="currentColor" />
          </>
        )}
      </g>
    </svg>
  );
  return (
    <span className="lantern" data-mood={mood} data-partial={partial} style={{ width: size, height: size }} role="img"
          aria-label={label ?? `ISKRA, a lantern with a small flame. Ring: ${klass}.`}>
      {ring("back")}
      <canvas ref={ref} style={{ width: size, height: size }} />
      {ring("front")}
      {partial && <span className="lantern__halo" aria-hidden="true">?</span>}
    </span>
  );
}
