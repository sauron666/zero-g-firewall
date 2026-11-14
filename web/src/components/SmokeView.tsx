import { useEffect, useRef } from "react";
import { CABIN, POINTS, PointId, Reality, SOURCE } from "../physics/paradox";

/**
 * One reality of the Fan Paradox: a slice through a cabin, drawn in one-point perspective.
 * Smoke is haze, air is chevrons that move with time, detectors turn red when they alarm.
 */
export interface SmokeViewProps {
  reality: Reality;
  t: number;            // seconds
  threshold: number;
  gFrac: number;
  fanSpeed: number;
  ariaLabel: string;
}

const HAZE = [203, 216, 238];

export function SmokeView({ reality, t, threshold, gFrac, fanSpeed, ariaLabel }: SmokeViewProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const cv = ref.current!;
    const draw = () => {
      const rect = cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.max(2, Math.round(rect.width * dpr)), H = Math.max(2, Math.round(rect.height * dpr));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      const ctx = cv.getContext("2d")!;
      const g = reality.grid;
      const s = Math.max(0, Math.min(reality.t.length - 1, Math.round(t)));
      const frame = reality.frames[Math.max(0, Math.min(reality.frames.length - 1, Math.round(t / reality.frameDt)))];
      const fans = reality.fansOn[s] === 1;
      const q = reality.sourceRate[s];
      const small = rect.width < 560;

      // geometry: front frame = canvas, slice plane at 0.9, back wall at 0.78
      const cx = W / 2, cy = H / 2;
      const k = 0.9, kb = 0.78;
      const X = (x: number) => cx + (x / CABIN.Lx - 0.5) * k * W;
      const Y = (y: number) => cy - (y / CABIN.Ly - 0.5) * k * H;
      const px = (n: number) => n * dpr;

      ctx.fillStyle = "#04070d";
      ctx.fillRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.6);
      bg.addColorStop(0, "rgba(40,58,96,0.34)");
      bg.addColorStop(1, "rgba(8,12,22,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // the cabin: back wall, four edges, floor lines
      ctx.lineWidth = px(1);
      ctx.strokeStyle = "rgba(150,170,210,0.2)";
      const bw = (kb * W) / 2, bh = (kb * H) / 2;
      ctx.strokeRect(cx - bw, cy - bh, bw * 2, bh * 2);
      ctx.beginPath();
      for (const [sxn, syn] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        ctx.moveTo(cx + sxn * bw, cy + syn * bh);
        ctx.lineTo(cx + (sxn * W) / 2, cy + (syn * H) / 2);
      }
      for (let i = 1; i < 8; i++) {
        const f = i / 8 - 0.5;
        ctx.moveTo(cx + f * 2 * bw, cy + bh);
        ctx.lineTo(cx + f * W, cy + H / 2);
      }
      ctx.stroke();

      // moving air (only while the fans run): chevrons drift towards the return end
      if (fans) {
        ctx.strokeStyle = "rgba(170,195,235,0.3)";
        ctx.lineWidth = px(1.2);
        const gap = 0.8;
        for (let row = 0; row < 3; row++) {
          const y = Y(CABIN.Ly * (0.22 + row * 0.28));
          for (let n = 0; n <= CABIN.Lx / gap + 1; n++) {
            let x = n * gap + (row % 2) * 0.4 - ((t * fanSpeed) % gap);
            if (x < 0.15 || x > CABIN.Lx - 0.15) continue;
            const xx = X(x), a = px(4);
            ctx.beginPath();
            ctx.moveTo(xx + a, y - a);
            ctx.lineTo(xx, y);
            ctx.lineTo(xx + a, y + a);
            ctx.stroke();
          }
        }
      }

      // smoke: haze on the slice plane
      if (!off.current) off.current = document.createElement("canvas");
      const oc = off.current;
      if (oc.width !== g.nx || oc.height !== g.ny) { oc.width = g.nx; oc.height = g.ny; }
      const octx = oc.getContext("2d")!;
      const img = octx.createImageData(g.nx, g.ny);
      const c0 = threshold * 2.5;
      for (let j = 0; j < g.ny; j++)
        for (let i = 0; i < g.nx; i++) {
          const c = frame[i + j * g.nx];
          const a = c > 0 ? 1 - Math.exp(-c / c0) : 0;
          const o = (i + (g.ny - 1 - j) * g.nx) * 4;
          img.data[o] = HAZE[0]; img.data[o + 1] = HAZE[1]; img.data[o + 2] = HAZE[2];
          img.data[o + 3] = Math.round(232 * a);
        }
      octx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(oc, X(0), Y(CABIN.Ly), X(CABIN.Lx) - X(0), Y(0) - Y(CABIN.Ly));

      // buoyant plume above a burning source in gravity
      if (gFrac > 0 && q > 0.05) {
        ctx.strokeStyle = "rgba(255,190,120,0.42)";
        ctx.lineWidth = px(1.2);
        for (let n = 0; n < 4; n++) {
          const y = SOURCE.y + 0.22 + ((n * 0.32 + t * 0.05) % 1.1);
          if (y > CABIN.Ly - 0.1) continue;
          const xx = X(SOURCE.x), yy = Y(y), a = px(4);
          ctx.beginPath();
          ctx.moveTo(xx - a, yy + a);
          ctx.lineTo(xx, yy);
          ctx.lineTo(xx + a, yy + a);
          ctx.stroke();
        }
      }

      // supply (right) and return (left) ends
      ctx.strokeStyle = fans ? "rgba(200,215,240,0.7)" : "rgba(200,215,240,0.28)";
      ctx.lineWidth = px(1.4);
      for (const xe of [0.05, CABIN.Lx - 0.05])
        for (let n = 0; n < 5; n++) {
          const y = CABIN.Ly * (0.18 + n * 0.16);
          ctx.beginPath();
          ctx.moveTo(X(xe), Y(y - 0.09));
          ctx.lineTo(X(xe), Y(y + 0.09));
          ctx.stroke();
        }

      const label = (text: string, x: number, y: number, align: CanvasTextAlign = "left", strong = false) => {
        if (small) return;
        ctx.font = `${strong ? 700 : 400} ${px(11)}px B612, system-ui, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = "middle";
        ctx.fillStyle = strong ? "rgba(255,255,255,0.95)" : "rgba(214,224,242,0.72)";
        ctx.fillText(text, x, y);
      };

      // source
      const fx = X(SOURCE.x), fy = Y(SOURCE.y);
      if (q > 0.02) {
        const r = px(5 + 7 * q);
        const gl = ctx.createRadialGradient(fx, fy, 0, fx, fy, r * 2.6);
        const warm = gFrac > 0 ? "255,170,80" : "80,150,255";
        gl.addColorStop(0, `rgba(${warm},0.95)`);
        gl.addColorStop(0.35, `rgba(${warm},0.45)`);
        gl.addColorStop(1, `rgba(${warm},0)`);
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(fx, fy, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(235,244,255,0.95)";
        ctx.beginPath();
        ctx.arc(fx, fy, px(2.4), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(214,224,242,0.75)";
        ctx.lineWidth = px(1.4);
        ctx.beginPath();
        ctx.arc(fx, fy, px(4), 0, Math.PI * 2);
        ctx.stroke();
      }
      label(q > 0.6 ? "flame burning" : q > 0.02 ? "flame weak" : "flame out", fx + px(14), fy + px(15));

      // detectors and crew
      (Object.keys(POINTS) as PointId[]).forEach((id) => {
        const p = POINTS[id];
        const xx = X(p.x), yy = Y(p.y);
        const at = reality.alarm[id];
        const on = at !== null && t >= at;
        if (id === "crew") {
          ctx.strokeStyle = "rgba(214,224,242,0.8)";
          ctx.lineWidth = px(1.5);
          ctx.beginPath();
          ctx.arc(xx, yy - px(8), px(3.4), 0, Math.PI * 2);
          ctx.moveTo(xx, yy - px(4.5));
          ctx.lineTo(xx, yy + px(6));
          ctx.moveTo(xx - px(5), yy - px(1));
          ctx.lineTo(xx + px(5), yy - px(1));
          ctx.stroke();
          label("crew", xx + px(9), yy - px(6));
          return;
        }
        const r = px(5.5);
        ctx.beginPath();
        ctx.moveTo(xx, yy - r); ctx.lineTo(xx + r, yy); ctx.lineTo(xx, yy + r); ctx.lineTo(xx - r, yy); ctx.closePath();
        if (on) {
          ctx.fillStyle = "#d03b3b";
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = px(1.4);
          ctx.stroke();
          ctx.strokeStyle = "rgba(208,59,59,0.55)";
          ctx.lineWidth = px(1.2);
          ctx.beginPath();
          ctx.arc(xx, yy, px(11), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#04070d";
          ctx.fill();
          ctx.strokeStyle = "rgba(214,224,242,0.85)";
          ctx.lineWidth = px(1.4);
          ctx.stroke();
        }
        const text = id === "duct" ? "duct detector" : "overhead detector";
        const side = id === "duct" ? 1 : 1;
        label(on ? `${text}: alarm at ${Math.round(at!)} s` : text, xx + side * px(12), yy + (id === "overhead" ? px(13) : 0), "left", on);
      });

      label(fans ? `fans on, ${(fanSpeed * 100).toFixed(0)} cm/s towards the return` : "fans off, no forced flow", X(CABIN.Lx) - px(8), Y(CABIN.Ly) + px(12), "right");
      // scale bar: one metre
      ctx.strokeStyle = "rgba(214,224,242,0.7)";
      ctx.lineWidth = px(1.2);
      const x1 = X(CABIN.Lx - 0.35), x0 = X(CABIN.Lx - 1.35), yb = Y(0) - px(9);
      ctx.beginPath();
      ctx.moveTo(x0, yb - px(3)); ctx.lineTo(x0, yb + px(3)); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.moveTo(x1, yb - px(3)); ctx.lineTo(x1, yb + px(3));
      ctx.stroke();
      label("1 m", (x0 + x1) / 2, yb - px(8), "center");
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [reality, t, threshold, gFrac, fanSpeed]);

  return <canvas ref={ref} role="img" aria-label={ariaLabel} style={{ width: "100%", aspectRatio: `${CABIN.Lx} / ${CABIN.Ly}`, borderRadius: 4, display: "block" }} />;
}
