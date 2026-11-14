import { rankAll } from "./rank";
import { Answer, extractive, Hit, Index, Line, tokens } from "./search";
import type { EnvelopeDoc, MatrixDoc, Passage, RankDoc } from "./types";

/**
 * The evidence agent. A question is answered by a short plan of typed tools, each of which reads only
 * artifacts built by the pipeline. Counts and rankings are computed by code; text is taken from stored
 * passages. Every step is recorded, so the trace on screen is what actually ran.
 *
 * With no model connected the planner is a set of rules. A connected model may rephrase the passages the
 * tools return; it never calls a tool by itself and never produces a number.
 */
export type ToolName = "screen_question" | "count_tests_near" | "oxygen_range" | "rank_for_mission" | "matrix_coverage" | "curator_notes" | "get_investigation" | "search_passages" | "compose_answer" | "check_answer";
export interface Step { tool: ToolName; why: string; args: Record<string, string | number>; out: string; found: number; ms: number }
export interface Kit { index: Index; envelope?: EnvelopeDoc | null; rank?: RankDoc | null; matrix?: MatrixDoc | null }
export interface AgentRun { question: string; steps: Step[]; hits: Hit[]; answer: Answer; computed: number; ms: number; planner: "rules"; notes: string[]; refused: boolean }

export const TOOLS: Record<ToolName, { title: string; reads: string }> = {
  screen_question: { title: "Screen the question", reads: "the question" },
  curator_notes: { title: "Fetch the curator's notes on NASA's tables", reads: "index.json" },
  count_tests_near: { title: "Count test rows near an atmosphere", reads: "envelope.json" },
  oxygen_range: { title: "Find the oxygen range of the test rows", reads: "envelope.json" },
  rank_for_mission: { title: "Rank the investigations for a mission", reads: "rank_features.json" },
  matrix_coverage: { title: "Look up what is measured in a habitat", reads: "matrix.json" },
  get_investigation: { title: "Fetch an investigation record", reads: "index.json" },
  search_passages: { title: "Search the stored passages", reads: "index.json" },
  compose_answer: { title: "Compose the answer from sentences of the evidence", reads: "the passages found" },
  check_answer: { title: "Check every sentence against its source", reads: "the answer and its passages" },
};

const KPA: Record<string, number> = { psia: 6.894757, psi: 6.894757, kpa: 1, atm: 101.325, bar: 100, mmhg: 0.1333224, torr: 0.1333224 };
const NEAR = { x: 0.03, p: 0.15 };                       // the same rule as the atmosphere map
const LENS: [RegExp, string][] = [[/\b(moon|lunar)\b/i, "lunar"], [/\b(mars|martian)\b/i, "mars"], [/\b(rover|lander)\b/i, "rover"], [/\b(suit|spacesuit|eva)\b/i, "suit"], [/\b(iss|station|orbit|free ?fall)\b/i, "iss"]];
const RANK = /\b(rank|ranking|ranked|most relevant|most useful|priorit|top (three|five|ten|\d+)|which (investigations?|experiments?|studies|records?) (matter|are most|should|is most))/i;
const GAP = /\b(gap|gaps|unknown|not (yet |been |ever )*(measured|tested|studied|burned)|never been|nobody|no one|missing|what is not known|has (anything|anyone|nasa)|have (they|we|nasa) (ever )?(measured|tested|burned)|ever been (burned|tested|measured))\b/i;
const QUALITY = /\b(data quality|problems?|errors?|mistakes?|wrong|artefacts?|artifacts?|inconsisten\w*|anomal\w*|typos?|curat\w*)\b/i;
const TABLES = /\b(tables?|columns?|data|datasets?|records?|files?|spreadsheets?|cells?)\b/i;
/** A question about how much oxygen the tests reached, or whether any went past a stated level. */
export const EXTREME = /\b(most|highest|maximum|max|richest|least|lowest|minimum|range|span|how (much|high|low|rich))\b[^.?!]{0,60}\b(oxygen|o2)\b|\b(oxygen|o2)\b[^.?!]{0,60}\b(most|highest|maximum|least|lowest|minimum|range|span|how high|how low)\b/i;
const BEYOND = /\b(above|over|more than|higher than|greater than|beyond|exceed\w*)\b/i;
const UNDER = /\b(below|under|less than|lower than)\b/i;
const FORM: [RegExp, string, string][] = [[/\b(solids?|materials?|fabrics?|plastics?|pmma|acrylic)\b/i, "solid", "solid-material"], [/\b(droplets?|liquids?)\b/i, "droplet", "liquid-droplet"], [/\b(gas(eous)?|jets?|burners?)\b/i, "gas", "gas-flame"]];
/** A question that is really an instruction to the engine. It is refused, never searched. */
export const INSTRUCTION = /\b(ignore|disregard|forget|override)\b[^.?!]{0,30}\b(instructions?|rules|prompts?|guidelines)\b|\bdeveloper mode\b|\b(system|hidden|secret|initial) prompt\b|\bjailbreak\b|\bpretend (you are|to be)\b|\byou are now\b|^\s*(system|assistant)\s*:/i;
/** A request for a number the evidence cannot give. */
export const PROBABILITY_ASK = /\bprobabilit|\b(chance|chances|odds|likelihood)\b|\bhow likely\b|\brisk (score|level|rating|percentage)\b|\bsafety (rating|score)\b|\bguarantee/i;
/** A request for a verdict. Evidence is still shown, with a note that no verdict is given. */
export const VERDICT_ASK = /\b(is|are|was|were|would|will|can) (it|this|that|they|we|i|the [a-z ]{1,40}?) (be )?(completely |totally |perfectly |really )?safe\b|\bsafe to\b|\bhow safe\b|\bsafe enough\b/i;
/** Things the claim rules say have no public answer. */
const NO_SOURCE: [RegExp, string][] = [[/\bartemis\s*(ii|2)\b/i, "No stored NASA document states what set off the Artemis II smoke alarm, and this site does not guess a cause."]];
const ASKING = new Set("what which who whom whose when where why how is are was were do does did can could will would should has have had give tell show list name rank compare explain describe".split(" "));
const fix = (n: number, d = 1) => String(Number(n.toFixed(d)));
const pct = (x: number) => `${fix(x * 100)}%`;

/** Oxygen fraction and pressure, when the question states them in a form a person would write. */
export function atmosphereIn(q: string): { x: number; p: number | null; said: string } | null {
  const o = q.match(/(\d+(?:\.\d+)?)\s?(?:%|percent|per cent)\s*(?:of\s+)?(?:o2|oxygen)/i) ?? q.match(/(?:o2|oxygen)\s*(?:at|of|is|=|near|around|about)?\s*(\d+(?:\.\d+)?)\s?(?:%|percent)/i);
  const p = q.match(/(\d+(?:\.\d+)?)\s?(psia|psi|kpa|atm|bar|mmhg|torr)\b/i);
  if (!o) return /\bpure oxygen\b/i.test(q) ? { x: 1, p: p ? Number(p[1]) * KPA[p[2].toLowerCase()] : null, said: "pure oxygen" } : null;
  const x = Number(o[1]) / 100;
  if (!(x > 0 && x <= 1)) return null;
  return { x, p: p ? Number(p[1]) * KPA[p[2].toLowerCase()] : null, said: `${o[1]}% oxygen${p ? ` at ${p[1]} ${p[2]}` : ""}` };
}

function countNear(env: EnvelopeDoc, x: number, p: number | null): Passage {
  const kind = new Map(env.series.map((s) => [s.id, s.kind]));
  const pool = p == null ? env.points : env.points.filter((pt) => pt.p != null);
  const near = pool.filter((pt) => Math.abs(pt.x - x) <= NEAR.x && (p == null || Math.abs((pt.p as number) - p) <= NEAR.p * p));
  const by = new Map<string, number>();
  near.forEach((pt) => by.set(pt.s, (by.get(pt.s) ?? 0) + 1));
  const where = Array.from(by.entries()).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(", ");
  const solids = near.filter((pt) => kind.get(pt.s) === "solid").length;
  const at = p == null ? `${pct(x)} oxygen` : `${pct(x)} oxygen at ${fix(p)} kPa (${fix(p / KPA.psia)} psia)`;
  const rule = p == null ? `within ${NEAR.x} in oxygen fraction; pressure not asked` : `within ${NEAR.x} in oxygen fraction and ${NEAR.p * 100}% in pressure`;
  return {
    id: `tool:count:${fix(x, 3)}:${p == null ? "any" : fix(p)}`, k: "derived", l: "/envelope",
    t: `Computed here: test rows near ${at}`,
    x: `${near.length} of the ${pool.length} test rows in NASA's tables that state oxygen${p == null ? "" : " and pressure"} lie near ${at} (${rule}).` +
      (near.length ? ` By experiment: ${where}.` : "") +
      ` ${solids === 0 ? "None of them is a solid material." : `${solids} of them are solid materials.`} No row in any table was taken in lunar or Martian gravity.`,
  };
}

/** The span of oxygen the placed test rows state, for one fuel form or all, or how many rows lie past a stated level. */
export function oxygenRange(env: EnvelopeDoc, q: string, level: number | null): Passage {
  const kind = new Map(env.series.map((s) => [s.id, s.kind]));
  const form = FORM.find(([re]) => re.test(q));
  const all = env.points;
  const pool = form ? all.filter((pt) => kind.get(pt.s) === form[1]) : all;
  const lo = (ps: typeof all) => Math.min(...ps.map((pt) => pt.x));
  const hi = (ps: typeof all) => Math.max(...ps.map((pt) => pt.x));
  const word = form ? `${form[2]} ` : "";
  const rows = (n: number) => `${n} ${word}test row${n === 1 ? "" : "s"} in NASA's tables that state${n === 1 ? "s" : ""} oxygen`;
  const tail = " No row in any table was taken in lunar or Martian gravity.";
  const records = Array.from(new Set(pool.map((pt) => pt.a))).join(", ");
  if (!pool.length) return { id: `tool:oxygen:${form?.[1] ?? "all"}`, k: "derived", l: "/gaps", t: "Computed here: the oxygen range of the test rows", x: `No ${word}test row in NASA's tables states oxygen.${tail}` };
  if (level != null && (BEYOND.test(q) || UNDER.test(q))) {
    const up = BEYOND.test(q);
    const n = pool.filter((pt) => (up ? pt.x > level + 1e-9 : pt.x < level - 1e-9)).length;
    const than = `${up ? "more" : "less"} than ${pct(level)} oxygen`;
    return {
      id: `tool:oxygen:${form?.[1] ?? "all"}:${up ? "gt" : "lt"}:${fix(level, 3)}`, k: "derived", l: "/gaps", t: `Computed here: test rows with ${than}`,
      x: (n === 0 ? `None of the ${rows(pool.length)} states ${than}.` : `${n} of the ${rows(pool.length)} state${n === 1 ? "s" : ""} ${than}.`) +
        ` The ${up ? "most" : "least"} any of them states is ${pct(up ? hi(pool) : lo(pool))}.${tail}`,
    };
  }
  const each = ([["solid", "solid materials"], ["droplet", "liquid droplets"], ["gas", "gas flames"]] as const)
    .map(([k, label]) => [label, all.filter((pt) => kind.get(pt.s) === k)] as const).filter(([, ps]) => ps.length)
    .map(([label, ps]) => `${label} ${pct(lo(ps))} to ${pct(hi(ps))} (${ps.length} rows)`).join(", ");
  return {
    id: `tool:oxygen:${form?.[1] ?? "all"}`, k: "derived", l: "/gaps", t: "Computed here: the oxygen range of the test rows",
    x: form
      ? `The ${rows(pool.length)} run from ${pct(lo(pool))} to ${pct(hi(pool))} oxygen (${records}). Across all ${all.length} rows that state oxygen the range is ${pct(lo(all))} to ${pct(hi(all))}.${tail}`
      : `The ${rows(pool.length)} run from ${pct(lo(pool))} to ${pct(hi(pool))} oxygen: ${each}.${tail}`,
  };
}

function rankFor(doc: RankDoc, lens: string): Passage {
  const L = doc.lenses.find((l) => l.id === lens) ?? doc.lenses[0];
  const top = rankAll(doc, L.id, L.weights).slice(0, 5);
  return {
    id: `tool:rank:${L.id}`, k: "derived", l: `/rank/${L.id}`,
    t: `Computed here: ranking for ${L.name.toLowerCase()}`,
    x: `Ranked for a ${L.name.toLowerCase()} with the default weights, the first five of ${doc.items.length} investigations are, in order: ` +
      top.map((r) => `${r.item.acronym || r.item.accession} (${r.item.accession}) at ${fix(r.total * 100, 0)} of 100`).join("; ") +
      `. A ranking orders reading by stated factors. It is not a probability and not a safety rating.`,
  };
}

function coverage(mx: MatrixDoc, habitat: "iss" | "lunar"): Passage {
  const c = mx.coverage[habitat];
  const name = habitat === "lunar" ? "lunar gravity" : "free fall on the space station";
  const open = mx.cells.filter((cell) => cell[habitat] === "gap").map((cell) => cell.name.toLowerCase());
  return {
    id: `tool:coverage:${habitat}`, k: "derived", l: "/playbooks",
    t: `Computed here: what is measured in ${name}`,
    x: `Of the ${mx.cells.length} fire behaviours in this site's matrix, ${c.evidence === 0 ? "none has" : `${c.evidence} have`} been measured in ${name}; ${c.bounded} are bounded by a model or a related test and ${c.gap} have nothing measured.` +
      (open.length ? ` Nothing measured for: ${open.slice(0, 6).join("; ")}${open.length > 6 ? `; and ${open.length - 6} more` : ""}.` : "") +
      (habitat === "lunar" ? " NASA's PSI tables hold no row taken in lunar or Martian gravity." : ""),
  };
}

/** Records the question names, by accession or by the acronym NASA uses. */
export function recordsIn(q: string, index: Index): Passage[] {
  const out: Passage[] = [];
  for (const p of index.passages) {
    if (!p.id.startsWith("inv:") || !p.id.endsWith(":summary")) continue;
    const m = p.t.match(/^(?:(.+?) \()?(PSI-\d+)\)?: record$/);
    if (!m) continue;
    const names = [m[2], ...(m[1] ? m[1].split(/\s*\/\s*/) : [])].map((n) => n.trim()).filter((n) => n.length >= 3);
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (names.some((n) => new RegExp(`(^|[^A-Za-z0-9-])${esc(n)}($|[^A-Za-z0-9-])`, "i").test(q))) out.push(p);
  }
  return out.slice(0, 3);
}

/** Proper names in the question that the stored evidence never mentions. One is enough to know the answer is not here. */
export function unknownNames(q: string, index: Index): string[] {
  const words = q.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) ?? [];
  const out: string[] = [];
  words.forEach((w, i) => {
    if (!/^[A-Z]/.test(w) || (i === 0 && ASKING.has(w.toLowerCase()))) return;
    if (ASKING.has(w.toLowerCase())) return;
    const t = tokens(w);
    if (t.length && t.every((x) => index.idf(x) === 0)) out.push(w);
  });
  return Array.from(new Set(out));
}

function curator(q: string, index: Index): Passage[] {
  const all = index.passages.filter((p) => p.id.startsWith("cur:"));
  const best = index.search(`${q} curator note`, 60).filter((h) => h.passage.id.startsWith("cur:")).slice(0, 3).map((h) => h.passage);
  const head: Passage = {
    id: "tool:curator", k: "derived", l: "/data", t: "Computed here: curator notes on NASA's tables",
    x: `${all.length} curator notes are filed against the NASA tables in scope, each found by a written rule and each saying how the site handles it. The notes nearest this question follow.`,
  };
  return [head, ...best];
}

const first = (text: string) => text.split(/(?<=[.!?])\s+(?=[A-Z("“])/)[0];

export function runAgent(question: string, kit: Kit): AgentRun {
  const t0 = performance.now();
  const steps: Step[] = [];
  const computed: Passage[] = [];
  const named: Passage[] = [];
  const timed = <T,>(tool: ToolName, why: string, args: Step["args"], f: () => T, out: (r: T) => [string, number]): T => {
    const s = performance.now();
    const r = f();
    const [text, found] = out(r);
    steps.push({ tool, why, args, out: text, found, ms: performance.now() - s });
    return r;
  };

  const notes: string[] = [];
  const stop = (why: string): AgentRun => ({ question, steps, hits: [], answer: { lines: [], abstained: true, why }, computed: 0, ms: performance.now() - t0, planner: "rules", notes, refused: true });
  const screen = timed("screen_question", "always: is this a question the evidence could answer?", { length: question.length }, () => {
    if (INSTRUCTION.test(question)) return "This reads as an instruction to the engine, not a question about the evidence. The engine takes no instructions about how to answer.";
    if (PROBABILITY_ASK.test(question)) return "No probability, chance or risk score can be read from this evidence, and this site does not estimate one. Ask what was observed, and under which conditions.";
    const none = NO_SOURCE.find(([re]) => re.test(question));
    if (none) return none[1];
    const unknown = unknownNames(question, kit.index);
    if (unknown.length) return `The stored evidence never mentions ${unknown.map((u) => `"${u}"`).join(" or ")}, so it cannot answer this.`;
    return "";
  }, (r) => [r ? `stopped: ${r}` : "a question about the evidence", r ? 0 : 1]);
  if (screen) return stop(screen);
  if (VERDICT_ASK.test(question)) notes.push("This site gives no verdict of safe or unsafe. What follows is what was observed, and where nothing was.");

  const atm = atmosphereIn(question);
  const past = !!atm && atm.p == null && (BEYOND.test(question) || UNDER.test(question));     // "above 40% oxygen" asks for a count past a level, not near it
  if ((past || EXTREME.test(question)) && kit.envelope) {
    computed.push(timed("oxygen_range", past ? `the question asks what lies past a level of oxygen (${atm!.said})` : "the question asks how much oxygen the tests reached", { form: FORM.find(([re]) => re.test(question))?.[1] ?? "all", level: past ? Number(fix(atm!.x, 3)) : "none" },
      () => oxygenRange(kit.envelope!, question, past ? atm!.x : null), (p) => [first(p.x), Number(p.x.match(/\d+/)?.[0] ?? 0)]));
  }
  if (atm && !past && kit.envelope) {
    computed.push(timed("count_tests_near", `the question states an atmosphere (${atm.said})`, { oxygen_fraction: Number(fix(atm.x, 3)), pressure_kpa: atm.p == null ? "any" : Number(fix(atm.p)) },
      () => countNear(kit.envelope!, atm.x, atm.p), (p) => [first(p.x), Number(p.x.match(/^\d+/)?.[0] ?? 0)]));
  }
  const lens = LENS.find(([re]) => re.test(question))?.[1];
  if (RANK.test(question) && kit.rank) {
    const id = lens ?? "iss";
    computed.push(timed("rank_for_mission", lens ? "the question asks which investigations matter for a mission" : "the question asks for a ranking and names no mission, so the station is used", { mission: id },
      () => rankFor(kit.rank!, id), (p) => [p.x.split("in order: ")[1]?.split(". A ranking")[0] ?? "", 5]));
  }
  if (GAP.test(question) && kit.matrix) {
    const hab = lens === "lunar" || lens === "mars" || lens === "rover" ? "lunar" : lens === "iss" ? "iss" : "lunar";
    computed.push(timed("matrix_coverage", "the question asks what is not known or not measured", { habitat: hab },
      () => coverage(kit.matrix!, hab), (p) => [first(p.x), kit.matrix!.coverage[hab].gap]));
  }
  if (QUALITY.test(question) && TABLES.test(question)) {
    named.push(...timed("curator_notes", "the question asks about problems in the data", { nearest: 3 },
      () => curator(question, kit.index), (r) => [first(r[0].x), r.length - 1]));
  }
  const recs = recordsIn(question, kit.index);
  if (recs.length) {
    named.push(...timed("get_investigation", "the question names a record in NASA's repository", { record: recs.map((r) => r.id.split(":")[1]).join(", ") },
      () => recs, (r) => [r.map((p) => p.t.replace(": record", "")).join("; "), r.length]));
  }
  const found = timed("search_passages", "always: find the passages that speak to the question", { query: question, top: 8 },
    () => kit.index.search(question, 8), (h) => [h.length ? `best match: ${h[0].passage.t}` : "nothing matched", h.length]);

  // Words of the question that the whole store never contains. If there is one, the best passage must speak to every
  // other word of the question; otherwise the passages share only common words with it, and the engine says so.
  const asked = Array.from(new Set(tokens(question)));
  const seen = new Set(found.flatMap((h) => h.matched));
  const absent = asked.filter((w) => !seen.has(w) && kit.index.idf(w) === 0);
  if (!computed.length && !named.length && absent.length && (found[0]?.matched.length ?? 0) < asked.length - absent.length) {
    steps.push({ tool: "compose_answer", why: "the question turns on a word the evidence never uses", args: { word: absent.join(", ") }, out: "abstained", found: 0, ms: 0 });
    return { ...stop(`The stored evidence has nothing on "${absent.join('", "')}".`), hits: found, refused: false };
  }
  const lead: Hit[] = [...computed, ...named].map((p) => ({ passage: p, score: 99, matched: [] }));
  const rest = found.filter((h) => !lead.some((l) => l.passage.id === h.passage.id)).slice(0, Math.max(4, 8 - lead.length));
  const hits = [...lead, ...rest];

  const answer = timed("compose_answer", "no sentence is written here: computed facts first, then sentences taken from the passages", { passages: hits.length }, (): Answer => {
    const base = extractive(question, rest, kit.index, 5);
    const lines: Line[] = [
      ...lead.slice(0, 4).map((h, i) => ({ text: first(h.passage.x), cite: i + 1 })),          // what a tool fetched or computed leads the answer
      ...base.lines.slice(0, Math.max(2, 5 - lead.length)).map((l) => ({ text: l.text, cite: l.cite + lead.length })),
    ];
    return lines.length ? { lines, abstained: false } : { lines: [], abstained: true, why: base.why };
  }, (a) => [a.abstained ? `abstained: ${a.why}` : `${a.lines.length} sentence${a.lines.length === 1 ? "" : "s"}`, a.lines.length]);

  timed("check_answer", "a sentence stays only if its cited passage contains it", { sentences: answer.lines.length }, () => {
    const bad = answer.lines.filter((l) => !hits[l.cite - 1]?.passage.x.includes(l.text));
    answer.lines = answer.lines.filter((l) => !bad.includes(l));
    if (!answer.lines.length && !answer.abstained) { answer.abstained = true; answer.why = "No sentence passed the check."; }
    return bad.length;
  }, (bad) => [bad ? `${bad} sentence${bad === 1 ? "" : "s"} removed` : answer.lines.length ? "all sentences found in their sources" : "nothing to check", answer.lines.length]);

  return { question, steps, hits, answer, computed: computed.length, ms: performance.now() - t0, planner: "rules", notes, refused: false };
}
