import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { candidates, conditionsMatch, coverage, QUESTIONS } from "./planner";
import { collect } from "./pmma";

const load = (n: string) => JSON.parse(readFileSync(new URL(`../../public/data/v1/${n}`, import.meta.url), "utf8"));
const rep = load("reported.json");
const cands = collect({ bass2: load("tables/PSI-25__PSI_25_Experimental_table_BASS_II.json"), saffire2: load("tables/PSI-99__PSI_99_Experimental_table_SAFFIRE_2.json") }, rep);
const flex = load("ml/flex_k_model.json").train;

describe("research planner (AC14)", () => {
  const cov = coverage(QUESTIONS, cands, flex);
  it("counts a question asked twice once", () => {
    expect(cov.length).toBe(QUESTIONS.length - 1);
    expect(cov.find((c) => c.q.id === "Q2")!.dups).toEqual(["Q2", "Q3"]);
  });
  it("finds the recorded Saffire VI-3 and FLEX methanol-in-air cases as covered, and the lunar PMMA question as open", () => {
    expect(cov.find((c) => c.q.id === "Q6")!.by).toBe("Saffire VI-3");
    expect(cov.find((c) => c.q.id === "Q7")!.covered).toBe(true);
    expect(cov.find((c) => c.q.id === "Q2")!.covered).toBe(false);
  });
  it("candidates are hypothetical: computed gain, no record ID, no outcome; one candidate cannot answer a PMMA and a droplet question", () => {
    const c = candidates(cov, rep.fm2.tests);
    for (const x of c) { expect(x).not.toHaveProperty("outcome"); expect(x.id).toMatch(/^C\d+$/); expect(x.gain).toBeGreaterThanOrEqual(1); }
    const lunar = c.find((x) => x.from === "Q2")!;
    expect(lunar.answers).toEqual(["Q2"]);                       // the duplicate Q3 does not inflate the count
    expect(lunar.planned).toMatch(/planned, not measured/);
    const hep = c.find((x) => x.from === "Q8")!;
    expect(conditionsMatch(lunar.conds, { ...hep.conds })).toBe(false);
  });
});
