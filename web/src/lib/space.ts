import type { EnvelopeDoc, ReportedDoc } from "./types";

/**
 * Where each thing of the atmosphere map stands in the 3-D view: oxygen across, pressure in depth, gravity as floors.
 * Pure, so a test can say that every row is drawn once and that nothing is drawn on a floor where NASA has no test.
 */
export const X_MIN = 0.1, X_MAX = 1.0, P_MAX = 120;             // oxygen fraction and kPa at the edges of a floor
export const HALF_W = 1.7, HALF_D = 1.05, FLOOR_GAP = 0.95;      // scene units
export const RAIL = HALF_D + 0.22;                               // rows that state no pressure stand on a rail in front of the floor
export type FloorId = "micro" | "lunar" | "mars";
export const FLOORS: FloorId[] = ["micro", "lunar", "mars"];
export const floorY = (f: FloorId) => (FLOORS.indexOf(f) - 1) * FLOOR_GAP;
export const xOf = (o2: number) => -HALF_W + (2 * HALF_W * (Math.min(X_MAX, Math.max(X_MIN, o2)) - X_MIN)) / (X_MAX - X_MIN);
export const zOf = (kpa: number) => HALF_D - (2 * HALF_D * Math.min(P_MAX, Math.max(0, kpa))) / P_MAX;

export interface SpaceLayout {
  placed: number[];            // x, y, z of every row that states oxygen and pressure
  rail: number[];              // x, y, z of every row that states oxygen and no pressure
  planned: { x: number; y: number; z: number; label: string }[];   // tests NASA plans on the Moon: marks, not rows
  poles: { x: number; z: number; label: string }[];                // the crew atmospheres, through every floor
  counts: Record<FloorId, number>;
}
export function layoutSpace(env: EnvelopeDoc, rep: ReportedDoc | null): SpaceLayout {
  const placed: number[] = [], rail: number[] = [];
  const y0 = floorY("micro");
  for (const p of env.points) {
    if (p.p == null) rail.push(xOf(p.x), y0, RAIL); else placed.push(xOf(p.x), y0, zOf(p.p));
  }
  return {
    placed, rail,
    planned: (rep?.fm2.tests ?? []).map((t) => ({ x: xOf(t.o2_pct / 100), y: floorY("lunar"), z: zOf(t.p_kpa), label: `${t.o2_pct}%` })),
    poles: env.near_presets.map((n) => ({ x: xOf(n.x_o2), z: zOf(n.p_kpa), label: n.label })),
    counts: { micro: env.gravity_counts.micro, lunar: env.gravity_counts.partial, mars: env.gravity_counts.partial },
  };
}
