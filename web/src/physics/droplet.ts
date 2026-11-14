import type { DropletPoint } from "../lib/types";

/** Diameter (mm) of a droplet that started at d0 and has burned for t seconds at a rate K (mm²/s): the d-squared law. */
export const diameterAt = (d0: number, K: number, t: number) => Math.sqrt(Math.max(0, d0 * d0 - K * t));
/** Seconds for the droplet to shrink from d0 to de. */
export const d2Time = (d0: number, de: number, K: number) => (d0 * d0 - de * de) / K;

export interface RateBand { n: number; lo: number; hi: number; median: number; rows: number[] }

/**
 * The burning rates NASA measured for one fuel within `tol` percentage points of an oxygen level, in oxygen and
 * nitrogen only. Null when no test lies that close: then there is nothing to take a rate from, and no time is given.
 */
export function ratesNear(points: DropletPoint[], fuel: string, pct: number, tol = 1.5): RateBand | null {
  const near = points.filter((p) => p.f === fuel && !p.dil && p.k != null && p.k > 0 && p.x != null && Math.abs(100 * p.x - pct) <= tol + 1e-9);
  if (!near.length) return null;
  const ks = near.map((p) => p.k as number).sort((a, b) => a - b);
  const mid = ks.length % 2 ? ks[(ks.length - 1) / 2] : (ks[ks.length / 2 - 1] + ks[ks.length / 2]) / 2;
  return { n: ks.length, lo: ks[0], hi: ks[ks.length - 1], median: mid, rows: near.map((p) => p.r) };
}

/** The oxygen levels, in whole percent, at which a fuel was burned in oxygen and nitrogen only. */
export function testedLevels(points: DropletPoint[], fuel: string): number[] {
  return Array.from(new Set(points.filter((p) => p.f === fuel && !p.dil && p.k != null && p.x != null).map((p) => Math.round(100 * (p.x as number))))).sort((a, b) => a - b);
}
