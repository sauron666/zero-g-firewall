import { useEffect, useRef } from "react";
import { buoyantSpeed, flickerHz } from "../physics/scaling";

/**
 * A schematic flame whose shape follows the physics it illustrates:
 *  - the tail points along the vector sum of forced flow and buoyant flow;
 *  - buoyant speed scales as g^(1/3); the flicker rate as sqrt(g);
 *  - in free fall with no flow it is a steady blue shell.
 * ILLUSTRATIVE: it explains an idea. It is not data and not a prediction.
 */
export interface FlameProps {
  g: number;          // gravity, fraction of 1 g
  flow: number;       // forced flow speed, m/s (left to right)
  strength: number;   // 0..1 target flame strength
  uncertain?: boolean; // draw the "not measured" halo
  label?: string;
  seed?: number;
}

interface Mote { x: number; y: number; z: number; }

export function FlameCanvas(props: FlameProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let s = live.current.strength; // displayed strength eases towards the target
    let flowShown = live.current.flow;
    let seed = (live.current.seed ?? 7) * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const motes: Mote[] = Array.from({ length: 34 }, () => ({ x: rnd(), y: rnd(), z: 0.35 + rnd() * 0.65 }));
    const rise: Mote[] = Array.from({ length: 10 }, () => ({ x: rnd(), y: rnd(), z: 0.4 + rnd() * 0.6 }));

    const fit = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(2, Math.round(r.width * dpr));
      cv.height = Math.max(2, Math.round(r.height * dpr));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cv);

    const blob = (x: number, y: number, r: number, rgb: string, a: number) => {
      if (r <= 0.5 || a <= 0.003) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(0.55, `rgba(${rgb},${a * 0.38})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (now: number) => {
      const p = live.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      // ease: a starved flame fades over a few seconds, a relit one recovers faster
      const rate = p.strength < s ? 0.55 : 2.2;
      s += (p.strength - s) * Math.min(1, dt * rate * (p.strength < 0.05 ? 1.5 : 1));
      if (Math.abs(p.strength - s) < 0.004) s = p.strength;
      flowShown += (p.flow - flowShown) * Math.min(1, dt * 2.4);

      const W = cv.width, H = cv.height, u = Math.min(W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#04070d";
      ctx.fillRect(0, 0, W, H);
      const cx = W * 0.47, cy = H * 0.56;

      // air: motes drift with the forced flow; they stop when the fans stop
      ctx.lineCap = "round";
      for (const m of motes) {
        m.x += dt * flowShown * 1.9 * m.z;
        if (m.x > 1.05) { m.x = -0.05; m.y = rnd(); }
        const len = u * (0.012 + flowShown * 0.42) * m.z;
        ctx.strokeStyle = `rgba(160,190,235,${0.05 + 0.16 * m.z * Math.min(1, flowShown / 0.08 + 0.25)})`;
        ctx.lineWidth = Math.max(1, u * 0.0035 * m.z);
        ctx.beginPath();
        ctx.moveTo(m.x * W, m.y * H);
        ctx.lineTo(m.x * W - len, m.y * H);
        ctx.stroke();
      }

      // effective flow at the flame: forced (to the right) plus buoyant (upward)
      const ub = buoyantSpeed(p.g, 6e-5) * Math.cbrt(Math.max(s, 0.02));
      const vx = flowShown, vy = ub;
      const speed = Math.hypot(vx, vy);
      const ang = Math.atan2(-vy, vx || 1e-6); // canvas y points down
      const stretch = Math.min(1.6, speed / 0.1);

      // buoyant plume above a burning flame in gravity
      if (p.g > 0 && s > 0.05) {
        for (const m of rise) {
          m.y -= dt * (0.25 + ub * 3.2) * m.z;
          if (m.y < 0) { m.y = 1; m.x = rnd(); }
          const px = cx + (m.x - 0.5) * u * 0.16 * (1.3 - m.y) + vx * u * 1.2 * (1 - m.y);
          const py = cy - (1 - m.y) * u * 0.46;
          ctx.strokeStyle = `rgba(255,190,120,${0.1 * m.z * s * m.y})`;
          ctx.lineWidth = Math.max(1, u * 0.004);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, py + u * 0.03);
          ctx.stroke();
        }
      }

      // fuel: a small sphere, as in the BASS sphere tests
      const fr = u * 0.034;
      ctx.fillStyle = "#1a2233";
      ctx.strokeStyle = "rgba(170,190,225,0.5)";
      ctx.lineWidth = Math.max(1, u * 0.004);
      ctx.beginPath();
      ctx.arc(cx, cy, fr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = "rgba(170,190,225,0.28)";
      ctx.beginPath();
      ctx.moveTo(cx, cy + fr);
      ctx.lineTo(cx, H);
      ctx.stroke();

      if (s > 0.004) {
        ctx.globalCompositeOperation = "lighter";
        const hz = flickerHz(p.g);
        const warm = Math.min(1, Math.pow(p.g, 0.5) * 1.5) * Math.min(1, s * 1.4); // soot glow grows with gravity
        const base = u * (0.085 + 0.045 * s);
        const N = 18;
        const L = u * (0.05 + 0.2 * stretch) * (0.35 + 0.65 * s);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        // blue shell around the fuel, standing off upstream
        blob(cx - dx * base * 0.25, cy - dy * base * 0.25, base * 1.25 * (0.45 + 0.55 * s), "70,140,255", 0.42 * Math.min(1, s * 1.6));
        for (let i = 0; i < N; i++) {
          const f = i / (N - 1);
          const wob = hz > 0 ? Math.sin(t * hz * 2 * Math.PI + i * 0.55) * u * 0.012 * f * Math.min(1, p.g * 2.4 + 0.25) : 0;
          const x = cx + dx * L * f * 1.25 - dy * wob;
          const y = cy + dy * L * f * 1.25 + dx * wob;
          const r = base * (1 - 0.72 * f) * (0.5 + 0.5 * s);
          blob(x, y, r, "58,128,255", 0.2 * (1 - f * 0.6) * Math.min(1, s * 1.5));
          if (warm > 0.02 && f > 0.25) blob(x, y, r * 0.7, "255,170,70", 0.2 * warm * f);
          if (f < 0.4) blob(x, y, r * 0.45, "205,228,255", 0.16 * s);
        }
        ctx.globalCompositeOperation = "source-over";
      } else {
        // out: a thin trace of smoke that stays where it is in free fall
        ctx.strokeStyle = "rgba(170,185,210,0.2)";
        ctx.lineWidth = Math.max(1, u * 0.006);
        ctx.beginPath();
        for (let i = 0; i < 26; i++) {
          const f = i / 25;
          const x = cx + fr * 1.4 + f * u * 0.09 + Math.sin(f * 9 + t * 0.4) * u * 0.008;
          const y = cy - fr * 0.6 - f * u * (0.03 + p.g * 0.3) + Math.cos(f * 7 + t * 0.3) * u * 0.006;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }

      if (p.uncertain) {
        const R = u * 0.3;
        ctx.save();
        ctx.translate(cx, cy - u * 0.05);
        ctx.rotate(t * 0.12);
        ctx.setLineDash([u * 0.018, u * 0.022]);
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = Math.max(1, u * 0.0045);
        ctx.beginPath();
        ctx.arc(0, 0, R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.86)";
        ctx.font = `700 ${Math.round(u * 0.085)}px B612, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", cx + R * 0.74, cy - u * 0.05 - R * 0.74);
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    if (reduce) {
      // no animation loop: settle instantly and redraw when the inputs change
      const settle = () => { s = live.current.strength; flowShown = live.current.flow; last = performance.now(); draw(last); };
      settle();
      const id = window.setInterval(settle, 400);
      return () => { window.clearInterval(id); ro.disconnect(); };
    }
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} role="img" aria-label={props.label ?? "Schematic flame"} />;
}
