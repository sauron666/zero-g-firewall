import type { Passage } from "./types";

/**
 * Retrieval that runs in the browser with no model and no network: BM25 over the passages of index.json.
 * It is deterministic, so the same question always returns the same evidence.
 */
const STOP = new Set("a an and are as at be been but by can could did do does for from had has have how if in into is it its may might more most no not of on or our should so some such than that the their them then there these they this to was we were what when where which while who why will with would you your about after all also any because before between both during each few other over same under until up very".split(" "));
/** Words a reader uses for the same thing. Query terms are widened with these; passages are not changed. */
const SAME: string[][] = [
  ["fan", "fans", "ventilation", "airflow", "flow", "ventilated"],
  ["moon", "lunar"], ["mars", "martian"], ["o2", "oxygen"], ["co2", "dioxide"], ["fire", "flame", "flames", "fires", "burning", "combustion"],
  ["extinguish", "extinguished", "extinguishes", "extinction", "quench", "quenched", "out", "self-extinguish"],
  ["detector", "detectors", "detection", "detect", "alarm", "alarms", "sensor"], ["smoke", "aerosol", "particulate", "soot", "particles"],
  ["gravity", "microgravity", "weightless", "weightlessness", "low-g", "reduced-gravity"], ["material", "materials", "solid", "solids", "fabric", "plastic"],
  ["droplet", "droplets", "liquid"], ["pressure", "psia", "kpa", "atm"], ["habitat", "cabin", "spacecraft", "station", "iss"], ["suit", "spacesuit", "eva"],
  ["safe", "safety", "safer", "hazard", "risk"], ["test", "tests", "experiment", "experiments", "investigation"],
];
const WIDEN = new Map<string, string[]>();
for (const g of SAME) for (const w of g) WIDEN.set(w, g);

export function stem(w: string): string {
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9.\-]*[a-z0-9]|[a-z0-9]/g) ?? []).filter((w) => !STOP.has(w)).map(stem);
}

export interface Hit { passage: Passage; score: number; matched: string[] }
export interface Index {
  passages: Passage[];
  search: (query: string, k?: number) => Hit[];
  idf: (term: string) => number;
}

export function buildIndex(passages: Passage[], k1 = 1.4, b = 0.75): Index {
  const docs = passages.map((p) => tokens(`${p.t} ${p.x}`));
  const len = docs.map((d) => d.length);
  const avg = len.reduce((a, c) => a + c, 0) / Math.max(1, len.length);
  const post = new Map<string, Map<number, number>>();
  docs.forEach((d, i) => { for (const w of d) { let m = post.get(w); if (!m) post.set(w, (m = new Map())); m.set(i, (m.get(i) ?? 0) + 1); } });
  const N = passages.length;
  const idf = (t: string) => { const n = post.get(t)?.size ?? 0; return n ? Math.log(1 + (N - n + 0.5) / (n + 0.5)) : 0; };
  const search = (query: string, k = 8): Hit[] => {
    const asked = Array.from(new Set(tokens(query)));
    const groups = asked.map((t) => Array.from(new Set([t, ...(WIDEN.get(t) ?? []).map(stem)])));   // a term and the words that mean the same
    const score = new Map<number, number>();
    const matched = new Map<number, Set<string>>();
    groups.forEach((g, gi) => {
      const best = new Map<number, number>();
      for (const t of g) {
        const m = post.get(t);
        if (!m) continue;
        const w = idf(t) * (t === asked[gi] ? 1 : 0.6);                                            // the reader's own word counts for more
        m.forEach((tf, i) => { const s = (w * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * len[i]) / avg)); if (s > (best.get(i) ?? 0)) best.set(i, s); });
      }
      best.forEach((s, i) => { score.set(i, (score.get(i) ?? 0) + s); let set = matched.get(i); if (!set) matched.set(i, (set = new Set())); set.add(asked[gi]); });
    });
    return Array.from(score.entries())
      .map(([i, s]) => ({ passage: passages[i], score: s * (0.6 + 0.4 * ((matched.get(i)?.size ?? 0) / Math.max(1, asked.length))), matched: Array.from(matched.get(i) ?? []) }))
      .sort((a, c) => c.score - a.score || a.passage.id.localeCompare(c.passage.id)).slice(0, k);
  };
  return { passages, search, idf };
}

export interface Line { text: string; cite: number }   // cite is 1-based into the hits shown
export interface Answer { lines: Line[]; abstained: boolean; why?: string }

/** An answer made only of sentences taken from the evidence, each with its source. No sentence is written by the program. */
export function extractive(query: string, hits: Hit[], index: Index, maxLines = 5): Answer {
  const asked = Array.from(new Set(tokens(query)));
  if (asked.length === 0) return { lines: [], abstained: true, why: "The question has no searchable words." };
  const top = hits[0];
  if (!top || top.matched.length < Math.min(2, asked.length) || top.score < 1.2)
    return { lines: [], abstained: true, why: "No stored passage matches enough of the question." };
  const wide = new Set(asked.flatMap((t) => [t, ...(WIDEN.get(t) ?? []).map(stem)]));
  const cands: { text: string; cite: number; s: number }[] = [];
  hits.slice(0, 6).forEach((h, hi) => {
    const sents = h.passage.x.split(/(?<=[.!?])\s+(?=[A-Z("“])/);
    for (const s of sents) {
      if (s.length < 40 || /^(left|right|middle|center|top|bottom|image credit|credit)s?:/i.test(s)) continue;      // not a caption
      const tk = new Set(tokens(s));
      let sc = 0;
      tk.forEach((t) => { if (wide.has(t)) sc += asked.includes(t) ? index.idf(t) || 1 : 0.6 * (index.idf(t) || 1); });
      const groups = asked.filter((t) => tk.has(t) || (WIDEN.get(t) ?? []).some((w) => tk.has(stem(w)))).length;      // how many of the question's words it speaks to
      if (sc > 0 && groups >= Math.min(2, asked.length)) cands.push({ text: s.trim(), cite: hi + 1, s: sc * (1 - 0.06 * hi) / Math.sqrt(1 + s.length / 400) });
    }
  });
  cands.sort((a, c) => c.s - a.s);
  const lines: Line[] = [];
  const used = new Map<number, number>();
  for (const c of cands) {
    if (lines.length >= maxLines) break;
    if ((used.get(c.cite) ?? 0) >= 2 || lines.some((l) => l.text === c.text)) continue;
    used.set(c.cite, (used.get(c.cite) ?? 0) + 1);
    lines.push({ text: c.text, cite: c.cite });
  }
  return lines.length ? { lines, abstained: false } : { lines: [], abstained: true, why: "The matching passages hold no sentence about the question." };
}
