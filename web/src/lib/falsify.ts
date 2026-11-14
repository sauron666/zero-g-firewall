import type { Hit, Index } from "./search";
import { tokens } from "./search";

/**
 * A first pass at refuting a conclusion the reader types. It cannot judge the claim.
 * It sorts the passages that share the claim's words into those that carry a limiting
 * or negating phrase and those that do not, and names the regimes PSI has never tested
 * that the claim touches. Deterministic and explainable: the cue list is below.
 */
export const CUES = ["misconception", "fallacy", "not conservative", "contrary to", "however", "even when", "although", "may be flammable", "can burn", "lower oxygen", "did not", "does not", "cannot",
  "no row", "none of", "not recorded", "never", "unexpected", "inexplicably", "limit", "fails", "extinguished itself", "is not", "are not", "without"];
export interface FirstPass { against: (Hit & { cue: string })[]; alongside: Hit[]; untested: string[] }

const REGIMES: [RegExp, string][] = [
  [/\b(moon|lunar|mars|martian|partial[- ]gravity|reduced[- ]gravity|habitat)\b/i, "Partial gravity: no row of any PSI combustion table was taken in lunar or Martian gravity."],
  [/\b(suit|spacesuit|eva|pure oxygen|100 ?% oxygen)\b/i, "Suit atmosphere: no PSI test row lies near pure oxygen at 4.3 psia."],
  [/\b(material|materials|solid|solids|fabric|plastic|cabin|wall|panel)\b/i, "Solid materials at a known pressure: the solid-fuel tables (BASS-II, Saffire) record oxygen but not pressure."],
  [/\b(always|never|all|every|any|safe|safely|guarantee[sd]?|cannot|impossible)\b/i, "The claim is absolute. Evidence from tests can show where something happened; it cannot show that it always will."],
];

export function firstPass(claim: string, index: Index, k = 10): FirstPass {
  const hits = tokens(claim).length ? index.search(claim, k).filter((h) => h.matched.length >= 2 || h.score > 4) : [];
  const against: FirstPass["against"] = [];
  const alongside: Hit[] = [];
  for (const h of hits) {
    const low = h.passage.x.toLowerCase();
    const cue = CUES.find((c) => low.includes(c));
    if (cue) against.push({ ...h, cue }); else alongside.push(h);
  }
  return { against, alongside, untested: REGIMES.filter(([re]) => re.test(claim)).map(([, text]) => text) };
}
