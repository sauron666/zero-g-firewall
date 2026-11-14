import { beliefQuotes } from "./check";
import { verify } from "./ai";
import type { Hit } from "./search";
import type { Passage } from "./types";

/**
 * Sentences written to probe the sentence check, each with the passage it cites and what must happen to it.
 * They are ours, not a model's and not NASA's; the passages they cite are the real ones. The page runs them in the reader's
 * browser with the same function that judges a model's answer, and the test suite fails if one behaves otherwise.
 */
export interface CheckCase { id: string; text: string; cite: string | null; keep: boolean; probes: string }

const BASS = "myth:fans:0:0";       // the BASS-II test in which the flow was cut
const CARD = "myth:fans";           // this site's reading of the fans question
const GUIDE = "guide:pdf35:1";      // the guide's list of misconceptions
const BRE = "inv:PSI-20:impacts:0"; // burning that went on with no air flow

export const CHECKSET: CheckCase[] = [
  { id: "c1", cite: BASS, keep: false, probes: "one test turned into a rule", text: "Every spacecraft fire extinguishes when ventilation stops." },
  { id: "c2", cite: BASS, keep: false, probes: "the same rule without the word every", text: "Spacecraft fires extinguish when ventilation stops." },
  { id: "c3", cite: BASS, keep: false, probes: "a rule with its test tacked on", text: "A fire goes out when the flow is cut off, as the BASS-II test on the space station observed." },
  { id: "c4", cite: BASS, keep: false, probes: "many flames from one", text: "Flames were observed to extinguish when the flow was cut off." },
  { id: "c5", cite: GUIDE, keep: false, probes: "a misconception copied without its label", text: "A fire will self-extinguish if ventilation is shut off." },
  { id: "c6", cite: GUIDE, keep: false, probes: "another listed misconception", text: "A steady fire cannot exist in a quiescent microgravity environment." },
  { id: "c7", cite: BASS, keep: false, probes: "a number the passage does not have", text: "The flame was observed to extinguish within 5 s." },
  { id: "c8", cite: BASS, keep: false, probes: "a number moved to another quantity", text: "The flame was observed to extinguish within 2.2 s." },
  { id: "c9", cite: BASS, keep: false, probes: "a name the passage does not have", text: "On Skylab the flame was observed to extinguish within 2 s." },
  { id: "c10", cite: BASS, keep: false, probes: "one changed word", text: "The flame was observed to reignite within 2 s." },
  { id: "c11", cite: BASS, keep: false, probes: "a denial the passage does not make", text: "The flame was not observed to extinguish after the flow was cut off." },
  { id: "c12", cite: BASS, keep: false, probes: "a word of frequency", text: "The flame usually propagated across half the sample length." },
  { id: "c13", cite: CARD, keep: false, probes: "a verdict", text: "Cutting the airflow makes the space station safe." },
  { id: "c14", cite: null, keep: false, probes: "no source", text: "Flames need oxygen." },
  { id: "k1", cite: BASS, keep: true, probes: "the test, reported as one test", text: "In a BASS-II test the flame extinguished within 2 s after the flow was cut off." },
  { id: "k2", cite: BASS, keep: true, probes: "the passage's own words", text: "The flow was abruptly cut off and the flame was observed to extinguish within 2 s." },
  { id: "k3", cite: GUIDE, keep: true, probes: "the misconception, named as one", text: "NASA's guide lists the belief that a fire will self-extinguish if ventilation is shut off as a misconception." },
  { id: "k4", cite: CARD, keep: true, probes: "our reading, restated", text: "On the space station, cutting the airflow starved the flame NASA tested within two seconds." },
  { id: "k5", cite: BRE, keep: true, probes: "the other half of the answer", text: "Quasi-steady burning was observed in microgravity despite the absence of air flow." },
];

export interface CheckResult { c: CheckCase; kept: boolean; ok: boolean; reason?: string; basis?: string; source?: Passage }
export interface CheckReport { n: number; ok: number; results: CheckResult[] }
/** Run every case through the verifier that judges a model's answer. */
export function runCheckset(passages: Passage[]): CheckReport {
  const byId = new Map(passages.map((p) => [p.id, p]));
  const quotes = beliefQuotes(passages);
  const results = CHECKSET.map((c): CheckResult => {
    const source = c.cite ? byId.get(c.cite) : undefined;
    const hits: Hit[] = source ? [{ passage: source, score: 0, matched: [] }] : [];
    const v = verify(c.cite ? `${c.text.replace(/\.$/, "")} [1].` : c.text, hits, quotes);
    const kept = v.kept.length === 1;
    return { c, kept, ok: kept === c.keep && (!c.cite || !!source), reason: v.dropped[0]?.reason, basis: v.kept[0]?.basis?.[0]?.text, source };
  });
  return { n: results.length, ok: results.filter((r) => r.ok).length, results };
}
