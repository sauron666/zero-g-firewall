import { stem } from "./search";
import type { Hit } from "./search";

/**
 * What a sentence written by a language model must pass before the site shows it.
 *
 * The check reads words, not meaning, and it is deterministic. A model may shorten or reorder one sentence of a passage; it may add nothing:
 *   1. every word that carries meaning must be in the cited passage, in the sentence the claim rests on or one beside it;
 *   2. a name, a place, a gravity level and a number must be in that very sentence, a number next to the word it stands next to;
 *   3. a word that sets the reach of a statement (every, always, most, several, never, not) must be in that sentence too, and what
 *      that sentence denies, plans or hedges may not come out as a plain fact;
 *   4. a belief NASA's guide lists as a misconception may be reported as one test or named as a belief, never stated as a rule,
 *      whatever the sentence cites.
 * A sentence that passes carries the sentence of the passage it rests on, so a reader sees both.
 * What it cannot see: two words that swap roles inside one sentence, or a tense that turns one observation into a habit
 * outside the listed beliefs. That is why the default answer uses NASA's sentences word for word.
 */
export interface Basis { cite: number; text: string }
export interface Checked { ok: boolean; reason?: string; basis?: Basis }

const WORD = /[A-Za-z0-9][A-Za-z0-9.\-]*[A-Za-z0-9]|[A-Za-z0-9]/g;
const set = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

/** Words that carry no claim of their own. */
const FUNC = set(`a an the and or but so yet for of in on at to by with from as into onto than that which who whom whose this these those it its they them their there here
  he she his her we our us you your i me my is are was were be been being am do does did done doing have has had having will would shall should can could may might must
  if then else when while once until since because although though whereas whether after before during upon about also both either such same other another own itself themselves
  what where why how up very just too thus therefore however moreover furthermore additionally overall instead rather still even again further per via one some`);
/** Words about who said it. They add nothing to what is claimed. */
const REPORT = set(`nasa report reports reported reporting state states stated show shows showed shown find finds found note notes noted list lists listed say says said according
  describe describes described indicate indicates indicated mention mentions mentioned call calls called name names named term terms termed refer refers referred
  consider considers considered regard regards regarded treat treats treated passage passages evidence source sources document documents study studies paper papers
  researcher researchers scientist scientists investigator investigators author authors team result results finding findings record records recorded table tables data idea notion belief beliefs`);
/** Words that set how far a statement reaches. They are judged against the sentence the claim rests on, not counted as ordinary words. */
const REACH = set(`every each all always any anything everything everywhere whenever invariably universally inevitably necessarily most mostly usually generally typically often commonly normally
  frequently routinely largely mainly tend tends majority many several multiple numerous various repeatedly consistently reliably
  no not never none nothing nowhere nobody neither nor cannot without impossible unable absent absence lack lacks lacking fail fails failed failure`);
/** Where and under what a result holds. Such a word may not be carried over from a neighbouring sentence. */
const WHERE = set(`moon lunar mars martian earth terrestrial microgravity weightless weightlessness freefall orbit ground partial partial-gravity reduced-gravity low-gravity
  normal-gravity hypergravity gravity habitat station iss pure enriched oxygen-enriched elevated elevated-oxygen normoxic quiescent`);
const NOT = set("not no never cannot nor neither none");
const PLAN = set("will planned plan plans proposed expected upcoming future scheduled intended");
const HEDGE = set("may might could possibly potentially suggest suggests suggested appear appears appeared likely probably perhaps preliminary");
const NUMWORD: Record<string, string> = { two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };
/** Words a passage may use for the same thing. Narrower than the search's list on purpose: a place, a gravity level or a unit of pressure is never swapped for another. */
const ALIKE: string[][] = [
  ["fire", "flame"], ["extinguish", "extinction", "extinguishment", "self-extinguish", "self-extinction", "quench"],
  ["fan", "ventilation", "airflow", "flow"], ["stop", "shut", "cut", "off", "halt", "cease", "cessation"],
  ["oxygen", "o2"], ["dioxide", "co2"], ["monoxide", "co"], ["moon", "lunar"], ["mars", "martian"], ["earth", "terrestrial"],
  ["s", "sec", "second"], ["min", "minute"], ["hr", "hour"], ["test", "experiment"], ["microgravity", "weightless", "weightlessness", "freefall"],
  ["burn", "combust", "combustion"], ["droplet", "drop"],
].map((g) => g.map(stem));

/** The same thing written the same way in a claim and in a passage. Case is kept, because a capital marks a name. */
function plain(s: string): string {
  return s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/(\d),(?=\d{3}(?!\d))/g, "$1").replace(/\bcan't\b/gi, "cannot").replace(/\bwon't\b/gi, "will not").replace(/n't\b/gi, " not").replace(/'s\b/g, "")
    .replace(/\b(mm|cm|m|km|g|kg|mg|w|kw|j|kj|l|ml)\/(s|min|h|hr|m2|cm2|m3|kg|g|k)\b/gi, "$1per$2")          // a compound unit is one word: 2.2 mm/s is not 2.2 s
    .replace(/\b(?:international )?space station\b/gi, "ISS").replace(/\bair[ -]flow/gi, "airflow").replace(/\bfree[ -]fall/gi, "freefall").replace(/\b(cut|shut)-off\b/gi, "$1 off")
    .replace(/\b(?:went|goes|go|going|gone|blew|blows|blow|blown|died|dies|die) out\b/gi, "extinguish").replace(/\bput(?:s|ting)? out\b/gi, "extinguish");
}
const near = (a: string, b: string) => {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return l.startsWith(s) && (s.length >= 4 ? l.length - s.length <= 4 : s.length === 3 && l.length - s.length <= 1);
};
const family = (st: string) => ALIKE.find((g) => g.some((w) => near(w, st))) ?? [st];
const holds = (have: string[], st: string) => { const fam = family(st); return have.some((h) => fam.some((f) => near(h, f))); };
const tidy = (n: string) => n.replace(/,/g, "").replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
const isNumber = (w: string) => /^\d[\d.,]*$/.test(w);

interface Tok { w: string; lw: string; n?: string; st?: string }
/** A text as its words: numbers as numbers (also when written out), the rest as stems, the empty words dropped. */
function read(text: string): Tok[] {
  return (plain(text).replace(/\[\d+\]/g, " ").match(WORD) ?? []).map((w) => {
    const lw = w.toLowerCase();
    if (isNumber(lw)) return { w, lw, n: tidy(lw.replace(/[.,]+$/, "")) };
    if (NUMWORD[lw]) return { w, lw, n: NUMWORD[lw] };
    return { w, lw, st: FUNC.has(lw) ? undefined : stem(lw) };
  });
}
const stemsOf = (toks: Tok[]) => toks.flatMap((t) => (t.st ? [t.st] : []));
/** The numbers of a text, as written or in words. "One" is left out: it is as often an article as a count. */
export const numbers = (text: string): string[] => read(text).flatMap((t) => (t.n ? [t.n] : []));

export function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?]["”’)\]]{0,2})\s+(?=[A-Z("“\[])/).map((s) => s.trim()).filter(Boolean);
}

/* ---- how far a statement reaches --------------------------------------------------------------------------------------- */
const PARTIAL = /\bnot (?:always|all|every|any|necessarily|in every|in all|in each)\b|\b(?:does|do|did|will|would|may|might|need) not (?:always|necessarily)\b/g;   // denies a rule; claims none
const NONE = "no|not|never|none|nothing|nowhere|nobody|neither|nor|cannot|without|impossible|unable|absent|absence|lacks?|lacking|fail(?:s|ed|ure)?";
const REACHES: { say: (w: string) => string; re: RegExp; source?: RegExp }[] = [
  { say: (w) => `wider than its source: “${w}” is not in the sentence it cites`, re: /\b(every|each|all|always|any|anything|everything|everywhere|whenever|invariably|universally|inevitably|necessarily|without exception)\b/ },
  { say: (w) => `wider than its source: “${w}” is not in the sentence it cites`,
    re: /\b(most|mostly|usually|generally|typically|often|commonly|normally|frequently|routinely|largely|mainly|tends?|majority|in general|as a rule|many|several|multiple|numerous|various|repeatedly|consistently|reliably)\b/ },
  { say: (w) => `says “${w}” where the sentence it cites does not`, re: new RegExp(`\\b(${NONE})\\b|n't\\b`), source: new RegExp(`\\b(${NONE}|misconceptions?|fallac\\w+|myths?|despite)\\b|n't\\b`) },
];

/* ---- beliefs NASA's guide lists as critical misconceptions (p. 35), as word patterns ------------------------------------- */
const FIRE = /\b(fires?|flames?|blazes?|combustion|burning)\b/;
const OUT = /\b(self-?extinguish\w*|extinguish\w*|extinction|go(?:es|ing)? out|went out|gone out|put(?:s|ting)? (?:\w+ ){0,3}out|die[sd]?\b|dying|quench\w*|snuff\w*|blow[sn]? out|blew out|burn(?:s|ed|t)? (?:itself |themselves )?out|stop(?:s|ped)? burning|ceas\w+|starv\w+|smother\w*|suffocat\w*)|\b(?:fires?|flames?) (?:\w+ )?(?:stops?|ends?|vanish\w*|disappear\w*)\b/;
const VENT = /\b(fans?|ventilat\w+|air ?flows?|flow|circulation|air supply|forced (?:air|flow|convection)|blowers?|draft)\b/;
const HALT = /\b(stop\w*|shut\w*|cut\w*|off|halt\w*|ceas\w+|cessation|without|no|absent|absence|kill\w*|remov\w+|loss|lost|lack\w*)\b/;
const SELF = /\b(self-?extinguish\w*|(?:go(?:es)?|went) out (?:by|on) (?:itself|themselves|its own|their own)|puts? (?:itself|themselves) out|burns? (?:itself|themselves) out|die[sd]? (?:out )?(?:by|on) (?:itself|themselves|its own|their own))\b/;
const SPACE = /\b(microgravity|micro-gravity|weightless\w*|zero[- ]?g(?:ravity)?|free ?fall|space|spacecraft|orbit|station|quiescent|still air|stagnant)\b/;
const CANNOT = /\b(cannot|can not|never|impossible|unable|no)\b|\bcan't\b/;
const EXIST = /\b(exist\w*|burn\w*|persist\w*|surviv\w+|last\w*|sustain\w*|continu\w+)\b/;
const EARTH = /\b(earth|terrestrial|ground|1-?g|normal[- ]gravity)\b/;
const TESTS = /\b(tests?|testing|standards?)\b/;
const CAUTIOUS = /\b(conservative|worst[- ]case|upper bound|safe bound|safer|more severe|margin)\b/;
/** `outcome`: the belief is about how a flame ends, so one flame told in the past tense is a report. `negative`: the belief is itself a denial. */
const BELIEFS: { id: string; all: RegExp[]; outcome: boolean; negative?: boolean }[] = [
  { id: "fans", all: [FIRE, OUT, VENT, HALT], outcome: true },
  { id: "still-air", all: [FIRE, CANNOT, EXIST, SPACE], outcome: false, negative: true },
  { id: "still-air", all: [FIRE, SELF, SPACE], outcome: true },
  { id: "one-g-tests", all: [EARTH, TESTS, CAUTIOUS], outcome: false },
];
/** Named as a belief, not asserted. */
const FRAMED = /(?<!\bnot an? |\bno |\bnever an? )\b(misconceptions?|myths?|fallac\w+|beliefs?|believed|mistaken|assum\w+)\b/;
/** Limited in its own words: sometimes, under a condition, or not always. */
const LIMITED = /\b(?:can|could|may|might)(?: (?!not\b)\w+){0,2} (?:self-?extinguish|extinguish|go out|die|be (?:extinguished|put out|conservative)|stop|starve|quench|fail|keep|continue|persist|outlive)\b|\b(?:may|might|could) not\b|\bsometimes\b|\bin some\b|\bnot (?:always|necessarily|every|all|in every|in all|guaranteed|enough|sufficient)\b|\b(?:does|do|did|will|would|need) not (?:always|necessarily)\b|\bonly (?:when|if|where|while|as long as)\b|\bunless\b|\bas long as\b|\bdepends?\b|\bunder (?:certain|some|these|those|specific) (?:conditions?|circumstances)\b/;
/** Opens by naming its case: "In a BASS-II test, …". */
const CASE_FIRST = /^(?:in|during|on|for|at) (?:a|an|one|this|that|the)\b[^,;:]{0,48}\b(?:tests?|experiments?|runs?|burns?|flights?|investigations?)\b/;
/** The ending is told as something that happened … */
const HAPPENED = /\b(?:went|gone) out\b|\bdied\b|\bblew out\b|\b(?:was|were) (?:not |never )?(?:observed|seen|found|reported) to\b|\bstopped burning\b|\bburn(?:ed|t) (?:itself )?out\b|(?<!\b(?:is|are|be|been|being|gets?|becomes?|will|can|may|might|should|must|would|could|to|always|never|usually|often|typically|generally) )\b(?:self-?)?(?:extinguished|quenched|starved|smothered|snuffed|suffocated)\b/;
/** … not as something that happens. */
const HAPPENS = /\b(?:self-?)?extinguishes\b|\bgo(?:es)? out\b|\bdies?\b|\bwill\b|\b(?:is|are|gets?|be) (?:always |usually )?(?:extinguished|put out|starved|quenched)\b|\bputs? (?:\w+ ){0,3}out\b|\bstops? burning\b|\bstarves?\b|\bquench(?:es)?\b|(?<!\bto |\bto self-)\b(?:self-?)?extinguish\b|\b(?:fires?|flames?) (?:\w+ )?(?:stops?|ends?|vanish(?:es)?|disappears?)\b/;
const MANY = /(?<!\b(?:the|these|those|both|two|three|four|five|six|several|some|its|their|\d+) )\b(?:fires|flames)\b/;

const DENIES = /\b(not|never|cannot|nor|neither|none|nothing)\b|n't\b/;
/** The belief a clause states as a rule, if any; `denied` when the clause states its opposite as a rule. */
export function beliefAsRule(sentence: string): { id: string; denied: boolean } | null {
  for (const clause of sentence.toLowerCase().replace(/[’‘]/g, "'").split(/;|\s[–—]\s/)) {
    const c = clause.trim();
    for (const b of BELIEFS) {
      if (!b.all.every((re) => re.test(c))) continue;
      if (FRAMED.test(c) || LIMITED.test(c) || CASE_FIRST.test(c)) continue;
      if (b.outcome && HAPPENED.test(c) && !HAPPENS.test(c) && !MANY.test(c)) continue;      // one flame, in the past tense: a report
      return { id: b.id, denied: !b.negative && DENIES.test(c) };
    }
  }
  return null;
}

/** The guide's own words for each belief, read from passages the pipeline wrote, so that no NASA sentence is typed here. */
export function beliefQuotes(passages: { id: string; x: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of passages) {
    const m = p.id.startsWith("myth:") ? /^Misconception \d+ in NASA's guide: "([^"]+)"/.exec(p.x) : null;
    if (m) out[p.id.slice(5)] = m[1];
  }
  return out;
}

/** Judge one stretch of a sentence (citations already removed) against the passages it cites. */
export function checkSentence(body: string, cites: number[], hits: Hit[], quotes: Record<string, string> = {}): Checked {
  const known = { ...beliefQuotes(hits.map((h) => h.passage)), ...quotes };
  const belief = beliefAsRule(body);
  if (belief) {
    const quote = known[belief.id] ? `: “${known[belief.id].replace(/\.$/, "")}”` : "";
    return { ok: false, reason: belief.denied ? `states as a rule the opposite of a belief NASA's guide lists as a misconception${quote}; NASA's sources report cases both ways`
      : `states as a rule a belief NASA's guide lists as a misconception${quote}` };
  }

  const cited = cites.map((c) => hits[c - 1].passage);
  const titles = cited.map((p) => read(p.t));
  const sources = cited.flatMap((p, pi) => sentencesOf(p.x).map((text, j) => ({ cite: cites[pi], pi, j, text, toks: read(text) })));
  const pool = [...sources.flatMap((s) => stemsOf(s.toks)), ...titles.flatMap(stemsOf)];
  const have = new Set([...sources.flatMap((s) => s.toks), ...titles.flat()].flatMap((t) => (t.n ? [t.n] : [])));
  const claim = read(body);

  const missing = claim.filter((t) => t.n && !have.has(t.n)).map((t) => t.n!);
  if (missing.length) return { ok: false, reason: `number not in the cited passage: ${missing.join(", ")}` };

  // every word that carries meaning must be in the cited passage
  const words = claim.map((t, i) => ({ ...t, first: i === 0 })).filter((t) => t.st && !REPORT.has(t.lw) && !REACH.has(t.lw));
  const seen = new Set<string>();
  for (const t of words) seen.add(t.st!);
  const absent = words.filter((t, i) => words.findIndex((u) => u.st === t.st) === i && !holds(pool, t.st!)).map((t) => t.w);
  if (absent.length) return { ok: false, reason: `not in the cited passage: ${absent.map((w) => `“${w}”`).join(", ")}` };
  if (seen.size === 0) return { ok: false, reason: "says nothing a passage could support" };

  // the one sentence of the cited passages that the claim rests on
  let at = -1;
  let best = 0;
  sources.forEach((s, i) => {
    const st = stemsOf(s.toks);
    let n = 0;
    seen.forEach((w) => { if (holds(st, w)) n++; });
    if (n > best) { best = n; at = i; }
  });
  if (at < 0 || best < Math.ceil(seen.size / 2)) return { ok: false, reason: "no one sentence of the cited passage says this" };
  const base = sources[at];
  const basis: Basis = { cite: base.cite, text: base.text };
  const title = titles[base.pi];
  const core = [...stemsOf(base.toks), ...stemsOf(title)];
  const around = [...core, ...sources.filter((s) => s.pi === base.pi && Math.abs(s.j - base.j) === 1).flatMap((s) => stemsOf(s.toks))];

  // names, places and gravity levels come from that sentence itself; other words from it or from the sentence before or after
  const text = cited.map((p) => `${p.t} ${p.x}`).join(" ");
  const lowerSeen = new Set((plain(text).match(WORD) ?? []).filter((w) => w === w.toLowerCase()));
  const isName = (t: { w: string; lw: string; first: boolean }) => /[A-Z]{2}/.test(t.w) || (/\d/.test(t.w) && /[A-Za-z]/.test(t.w)) || (/^[A-Z]/.test(t.w) && (!t.first || !lowerSeen.has(t.lw)));
  for (const t of words) {
    if ((isName(t) || WHERE.has(t.lw)) && !holds(core, t.st!)) return { ok: false, reason: `“${t.w}” is not in the sentence it rests on` };
    if (!holds(around, t.st!)) return { ok: false, reason: `joins parts of the passage that stand apart: “${t.w}” is not near the sentence it rests on` };
  }

  // a number must be in that sentence too, next to the same word: the nearest word that carries meaning, after it or else before it
  for (let i = 0; i < claim.length; i++) {
    const n = claim[i].n;
    if (!n) continue;
    const beside = claim.slice(i + 1).find((t) => t.st)?.st ?? claim.slice(0, i).reverse().find((t) => t.st)?.st;
    const spots = [base.toks, title].flatMap((toks) => toks.flatMap((t, j) => (t.n === n ? [[...stemsOf(toks.slice(0, j)).slice(-3), ...stemsOf(toks.slice(j + 1)).slice(0, 3)]] : [])));
    if (spots.length === 0) return { ok: false, reason: `${n} is not in the sentence it rests on` };
    if (beside && !spots.some((near3) => holds(near3, beside))) return { ok: false, reason: `the cited sentence has ${n} next to other words` };
  }

  const low = (t: string) => t.toLowerCase().replace(/[’‘]/g, "'");
  const mine = low(body);
  const theirs = low(basis.text);
  // the part of that sentence the claim shares most words with: if it presents them as a misconception, so must the claim
  const part = theirs.split(/,\s+and\s+|;\s+/).map((t) => ({ text: t, st: stemsOf(read(t)) }))
    .map((p) => ({ ...p, n: Array.from(seen).filter((w) => holds(p.st, w)).length })).sort((a, b) => b.n - a.n)[0];
  if (/\bmisconceptions?\b|\bfallac\w+\b|\bmyths?\b/.test(part.text) && !FRAMED.test(mine) && !REACHES[2].re.test(mine))
    return { ok: false, reason: "the cited passage gives this as a misconception; the sentence does not say so" };
  // what the source denies, plans or hedges may not come out as a plain fact: such a word binds the next word that carries meaning
  const mineToks = claim.map((t) => t.lw);
  const qualifiers: [Set<string>, (w: string) => string][] = [
    [NOT, (w) => `leaves out the “${w}” of the sentence it cites`],
    [PLAN, (w) => `tells as done what its source gives as planned (“${w}”)`],
    [HEDGE, (w) => `states as fact what its source hedges (“${w}”)`],
  ];
  for (const [kind, say] of qualifiers) {
    if (mineToks.some((w) => kind.has(w)) || (kind === NOT && REACHES[2].re.test(mine))) continue;
    for (let i = 0; i < base.toks.length; i++) {
      if (!kind.has(base.toks[i].lw)) continue;
      const bound = base.toks.slice(i + 1, i + 5).find((t) => t.st && !REACH.has(t.lw));
      if (bound && !REPORT.has(bound.lw) && seen.has(bound.st!)) return { ok: false, reason: say(base.toks[i].w) };
    }
  }
  const bare = (t: string) => t.replace(PARTIAL, " not ");
  for (const r of REACHES) {
    const m = r.re.exec(bare(mine));
    if (m && !(r.source ? r.source.test(theirs) : r.re.test(bare(theirs)))) return { ok: false, reason: r.say(m[0]) };
  }
  return { ok: true, basis };
}
