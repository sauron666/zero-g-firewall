/**
 * Research planner (section 10): which hypothetical test would answer the most registered questions?
 *
 * The registry is this project's list of mission questions (version below), not NASA's. A candidate experiment is a
 * hypothetical combination of conditions taken from an unanswered question: it has no NASA record ID and no outcome.
 * Coverage gain = the number of distinct unanswered questions whose every condition the candidate would match, under
 * the same tolerances as Material Evidence. It is a transparent count, unweighted: not expected information gain,
 * not a NASA priority, and no promise that the test would succeed.
 */
import type { ScenarioState, FuelForm, Material } from "./scenario";
import { defaultScenario } from "./scenario";
import { Candidate, rankEvidence, TOL } from "./pmma";

export const REGISTRY_VERSION = "1.0.0";
export interface Question { id: string; asker: string; text: string; material: Material; form: FuelForm; o2: number; p_kpa: number; u_m_s: number; g: number; target: string }
export const QUESTIONS: Question[] = [
  { id: "Q1", asker: "station crew", text: "How does an acrylic panel burn in station air with the fans on?", material: "PMMA", form: "sheet", o2: 0.2095, p_kpa: 101.3, u_m_s: 0.2, g: 0, target: "spread rate and products" },
  { id: "Q2", asker: "lunar habitat design", text: "How does an acrylic sheet burn in a lunar habitat atmosphere?", material: "PMMA", form: "sheet", o2: 0.34, p_kpa: 56.5, u_m_s: 0.1, g: 0.165, target: "spread rate and products" },
  { id: "Q3", asker: "lunar surface operations", text: "Will acrylic keep burning in the habitat's air on the Moon?", material: "PMMA", form: "sheet", o2: 0.34, p_kpa: 56.5, u_m_s: 0.1, g: 0.165, target: "spread rate and products" },
  { id: "Q4", asker: "Gateway outfitting", text: "An acrylic sheet in an exploration atmosphere, in free fall", material: "PMMA", form: "sheet", o2: 0.34, p_kpa: 56.5, u_m_s: 0.2, g: 0, target: "spread rate and products" },
  { id: "Q5", asker: "Mars transit design", text: "An acrylic sheet in a habitat atmosphere at Martian gravity", material: "PMMA", form: "sheet", o2: 0.34, p_kpa: 56.5, u_m_s: 0.1, g: 0.38, target: "spread rate and products" },
  { id: "Q6", asker: "Saffire follow-up", text: "Repeat of Saffire VI-3 conditions", material: "PMMA", form: "sheet", o2: 0.303, p_kpa: 54.6, u_m_s: 0.2, g: 0, target: "products at far sensors" },
  { id: "Q7", asker: "fuel-spill analysis", text: "Burning rate of a methanol droplet in station air", material: "Methanol", form: "droplet", o2: 0.21, p_kpa: 101.3, u_m_s: 0, g: 0, target: "burning-rate constant K" },
  { id: "Q8", asker: "fuel-spill analysis", text: "Burning rate of a heptane droplet in an exploration atmosphere", material: "Heptane", form: "droplet", o2: 0.34, p_kpa: 56.5, u_m_s: 0, g: 0, target: "burning-rate constant K" },
];

export const qKey = (q: Pick<Question, "material" | "form" | "o2" | "p_kpa" | "u_m_s" | "g" | "target">) => [q.material, q.form, q.o2.toFixed(3), q.p_kpa.toFixed(1), q.u_m_s.toFixed(2), q.g.toFixed(3), q.target].join("|");

/** One test (real or hypothetical) matches a question when material and form are the same and every number is within the match tolerance. */
export function conditionsMatch(a: Omit<Question, "id" | "asker" | "text" | "target">, b: Omit<Question, "id" | "asker" | "text" | "target">): boolean {
  return a.material === b.material && a.form === b.form && Math.abs(a.o2 - b.o2) <= TOL.o2.match && Math.abs(a.p_kpa - b.p_kpa) / b.p_kpa <= TOL.p.match
    && Math.abs(a.u_m_s - b.u_m_s) <= TOL.u.match && Math.abs(a.g - b.g) <= TOL.g.match;
}

export interface DropRow { fuel: string; x_o2: number; p_kpa: number; x_co2: number; x_he: number }
export interface Coverage { q: Question; dups: string[]; covered: boolean; by: string | null }
/** Is there a recorded test, with all conditions jointly, for each distinct question? */
export function coverage(qs: Question[], pmma: Candidate[], flex: DropRow[]): Coverage[] {
  const seen = new Map<string, Coverage>();
  for (const q of qs) {
    const k = qKey(q);
    const prev = seen.get(k);
    if (prev) { prev.dups.push(q.id); continue; }
    let by: string | null = null;
    if (q.material === "PMMA") {
      const s: ScenarioState = { ...defaultScenario(), material: "PMMA", form: q.form, o2: q.o2, p_kpa: q.p_kpa, u_m_s: q.u_m_s, g: q.g };
      const best = rankEvidence(pmma, s)[0];
      by = best?.joint ? best.id : null;
    } else {
      const r = flex.find((x) => x.fuel === q.material && x.x_co2 === 0 && x.x_he === 0 && q.u_m_s === 0 && q.g === 0 && Math.abs(x.x_o2 - q.o2) <= TOL.o2.match && Math.abs(x.p_kpa - q.p_kpa) / q.p_kpa <= TOL.p.match);
      by = r ? `FLEX ${q.material.toLowerCase()} rows` : null;
    }
    seen.set(k, { q, dups: [q.id], covered: !!by, by });
  }
  return Array.from(seen.values());
}

export interface CandidateExp { id: string; from: string; conds: Omit<Question, "id" | "asker" | "text" | "target">; answers: string[]; gain: number; planned: string | null; unknown: string[] }
/** Candidates from the unanswered questions, each scored by how many distinct unanswered questions it would match. */
export function candidates(cov: Coverage[], planned: { o2_pct: number; p_kpa: number }[] = []): CandidateExp[] {
  const open = cov.filter((c) => !c.covered);
  const out: CandidateExp[] = open.map((c, i) => {
    const conds = { material: c.q.material, form: c.q.form, o2: c.q.o2, p_kpa: c.q.p_kpa, u_m_s: c.q.u_m_s, g: c.q.g };
    const answers = open.filter((o) => conditionsMatch(conds, o.q)).map((o) => o.q.id);
    const plan = Math.abs(c.q.g - 0.165) < 0.01 ? planned.find((p) => Math.abs(p.o2_pct / 100 - c.q.o2) <= TOL.o2.near && Math.abs(p.p_kpa - c.q.p_kpa) / c.q.p_kpa <= TOL.p.near) : undefined;
    return { id: `C${i + 1}`, from: c.q.id, conds, answers, gain: answers.length, planned: plan ? `FM² plans a test at ${plan.o2_pct}% O₂ and ${plan.p_kpa} kPa on the Moon (planned, not measured; sample material not stated in our source)` : null,
      unknown: ["sample geometry and thickness of a real test", "platform: a facility that sustains this gravity long enough", "duration and ignition method"] };
  });
  return out.sort((a, b) => b.gain - a.gain || a.id.localeCompare(b.id));
}
