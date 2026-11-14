import type { RankDoc, RankItem } from "./types";

/** A ranking is a weighted sum of stated factors. It orders reading; it is not a probability. */
export interface Part { id: string; label: string; weight: number; score: number; contribution: number; why: string }
export interface Ranked { item: RankItem; total: number; parts: Part[]; rank: number }

export function normalise(w: Record<string, number>): Record<string, number> {
  const sum = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0);
  const out: Record<string, number> = {};
  for (const k of Object.keys(w)) out[k] = sum > 0 ? Math.max(0, w[k]) / sum : 1 / Object.keys(w).length;
  return out;
}

export function factorsOf(item: RankItem, lens: string) {
  return { ...item.shared, ...(item.by_lens[lens] ?? {}) };
}

export function rankAll(doc: RankDoc, lens: string, weights: Record<string, number>): Ranked[] {
  const w = normalise(weights);
  const out = doc.items.map((item) => {
    const f = factorsOf(item, lens);
    const parts = doc.factors.map((d) => {
      const s = f[d.id]?.score ?? 0;
      return { id: d.id, label: d.label, weight: w[d.id] ?? 0, score: s, contribution: (w[d.id] ?? 0) * s, why: f[d.id]?.why ?? "" };
    });
    return { item, parts, total: parts.reduce((a, p) => a + p.contribution, 0), rank: 0 };
  });
  out.sort((a, b) => b.total - a.total || a.item.accession.localeCompare(b.item.accession, "en", { numeric: true }));
  out.forEach((r, i) => { r.rank = i + 1; });
  return out;
}

/** Deterministic pseudo-random numbers, so a stability figure can be reproduced from its seed. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Stability { top: number; best: number; worst: number }
/**
 * How much the order depends on the weights: every weight is multiplied by a random factor
 * between one half and two, the weights are re-normalised, and the ranking is recomputed.
 * top is the share of draws in which the record stays among the first `k`.
 */
export function stability(doc: RankDoc, lens: string, weights: Record<string, number>, draws = 500, k = 5, seed = 20261114): Map<string, Stability> {
  const rnd = mulberry32(seed);
  const acc = new Map<string, Stability>(doc.items.map((i) => [i.accession, { top: 0, best: Infinity, worst: 0 }]));
  const ids = doc.factors.map((f) => f.id);
  const fs = doc.items.map((i) => { const f = factorsOf(i, lens); return ids.map((id) => f[id]?.score ?? 0); });
  for (let d = 0; d < draws; d++) {
    const w = ids.map((id) => Math.max(0, weights[id] ?? 0) * 2 ** (2 * rnd() - 1));
    const sum = w.reduce((a, b) => a + b, 0) || 1;
    const totals = fs.map((f, i) => [i, f.reduce((a, s, j) => a + (w[j] / sum) * s, 0)] as [number, number]);
    totals.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    totals.forEach(([i], pos) => {
      const s = acc.get(doc.items[i].accession)!;
      if (pos < k) s.top++;
      if (pos + 1 < s.best) s.best = pos + 1;
      if (pos + 1 > s.worst) s.worst = pos + 1;
    });
  }
  acc.forEach((s) => { s.top /= draws; });
  return acc;
}
