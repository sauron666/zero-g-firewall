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

export interface Caution { level: "warn" | "note"; text: string }
const FORM: Record<string, string> = { solid: "solid materials", droplet: "liquid droplets", gas: "gas flames", smoke: "smoke particles", emulator: "a burner that stands in for a solid" };
const name = (i: RankItem) => i.acronym || i.accession;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * What a reader should know before setting records side by side: different things burned, flight against ground,
 * a table that does not state what the other one states. Each caution is read from the records' own fields.
 */
export function comparability(items: RankItem[]): Caution[] {
  const out: Caution[] = [];
  if (items.length < 2) return out;
  const forms = new Map<string, string[]>();
  items.forEach((i) => forms.set(i.kind, [...(forms.get(i.kind) ?? []), name(i)]));
  if (forms.size > 1) out.push({ level: "warn", text: `Different things burn: ${Array.from(forms.entries()).map(([k, v]) => `${list(v)} (${FORM[k] ?? k})`).join("; ")}. A value of one is not on the scale of the other.` });
  const ground = items.filter((i) => i.gravity === "ground").map(name);
  const flight = items.filter((i) => i.gravity === "micro").map(name);
  if (ground.length && flight.length) out.push({ level: "warn", text: `${list(ground)} ${ground.length === 1 ? "is" : "are"} ground work at 1 g; ${list(flight)} ${flight.length === 1 ? "was" : "were"} taken in free fall. Buoyancy changes the flame, so the conditions do not carry over one to one.` });
  for (const [key, word] of [["oxygen", "oxygen"], ["pressure", "pressure"], ["flow", "the air flow"], ["outcome", "what happened in each test"]] as const) {
    const yes = items.filter((i) => i.facets[key]).map(name);
    const no = items.filter((i) => !i.facets[key]).map(name);
    if (yes.length && no.length) out.push({ level: "warn", text: `The table of ${list(no)} does not state ${word}; ${list(yes)} ${yes.length === 1 ? "does" : "do"}.` });
  }
  const none = items.filter((i) => i.rows === 0).map(name);
  if (none.length) out.push({ level: "warn", text: `${list(none)} ${none.length === 1 ? "has" : "have"} no experimental table in PSI, so ${none.length === 1 ? "its" : "their"} factors rest on the record's text alone.` });
  const fams = new Set(items.map((i) => i.family ?? "OTHER"));
  if (fams.size === 1 && !fams.has("OTHER") && !fams.has("GROUND")) {
    const hw = Array.from(new Set(items.map((i) => i.hardware).filter(Boolean)));
    out.push({ level: "note", text: `Same hardware family${hw.length ? ` (${hw.slice(0, 2).join("; ")})` : ""}: chamber, diagnostics and procedure are close, which makes a comparison fairer.` });
  } else if (fams.size > 1) {
    out.push({ level: "note", text: "Different hardware: chamber size, ignition and diagnostics differ between these records." });
  }
  return out;
}
