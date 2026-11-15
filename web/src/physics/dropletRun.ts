/**
 * One droplet case for the Fire Lab: the d² law in time, with the end of the visible flame kept apart from the
 * mathematical end of the law. One function feeds the 3-D scene, the chart, the table and XR (AC05).
 */
import type { LabRun } from "../lib/scenario";

export interface DropletCase {
  id: string;
  label: string;
  fuel: string;
  d0: number;               // mm
  k: number;                // mm²/s
  de: number | null;        // visible extinction diameter as recorded, mm
  tb: number | null;        // NASA's stated burn time, s
  klass: "observed" | "model";
  row?: number;             // row of the FLEX table
  x?: number | null;        // O2 mole fraction
  p?: number | null;        // kPa
  dil?: string;
}

export interface DropletState {
  t: number;
  d: number;                // mm, as drawn
  d2: number;               // mm², from the law (floored at zero)
  flame: boolean;           // the visible flame, as the case defines it
  phase: "burning" | "extinct_recorded" | "law_zero";
  tFlameEnd: number;        // s: visible extinction (recorded case) or law reaching zero (model case)
  tLawZero: number;         // s: D0²/K, the mathematical end of the law
}

export const lawTime = (d0: number, de: number, k: number) => (d0 * d0 - de * de) / k;

export function dropletAt(c: DropletCase, t: number): DropletState {
  if (!(c.k > 0) || !(c.d0 > 0)) throw new Error("a droplet case needs K > 0 and D0 > 0");
  const tLawZero = (c.d0 * c.d0) / c.k;
  const tFlameEnd = c.de != null && c.de > 0 && c.de < c.d0 ? lawTime(c.d0, c.de, c.k) : tLawZero;
  const tt = Math.max(0, t);
  const d2 = Math.max(0, c.d0 * c.d0 - c.k * tt);
  if (tt < tFlameEnd) return { t: tt, d: Math.sqrt(d2), d2, flame: true, phase: "burning", tFlameEnd, tLawZero };
  if (c.de != null && tFlameEnd < tLawZero) return { t: tt, d: c.de, d2, flame: false, phase: "extinct_recorded", tFlameEnd, tLawZero };     // after the recorded end the drawing holds Dext; nothing beyond is modelled
  return { t: tt, d: 0, d2: 0, flame: false, phase: "law_zero", tFlameEnd, tLawZero };
}

/** The same case as a LabRun (time series for chart, table and export). */
export function dropletRun(c: DropletCase, n = 120): LabRun {
  const end = dropletAt(c, 0).tLawZero;
  const t = Array.from({ length: n + 1 }, (_, i) => (i / n) * end);
  return {
    kind: "LabRun", model: "d² law, D² = D0² − K t", params: { d0_mm: c.d0, k_mm2_s: c.k, de_mm: c.de ?? "not given", case: c.id }, seed: 0, t,
    series: { d2_mm2: t.map((x) => dropletAt(c, x).d2), d_drawn_mm: t.map((x) => dropletAt(c, x).d), flame: t.map((x) => (dropletAt(c, x).flame ? 1 : 0)) },
    labels: { d2_mm2: "squared diameter from the law, mm²", d_drawn_mm: "diameter drawn, mm", flame: "visible flame (1) or not (0)" },
  };
}
