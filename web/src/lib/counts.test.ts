import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SCENARIOS, SCORE_SEEDS } from "../trust/lab";
import type { FalsifyDoc, MatrixDoc, MythsDoc, RankDoc, ReportedDoc } from "./types";
import { KLASS } from "./klass";

const data = <T,>(name: string) => JSON.parse(readFileSync(new URL(`../../public/data/v1/${name}`, import.meta.url), "utf8")) as T;
const page = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const WORD = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/**
 * Some counts are written as a word inside a sentence ("nine situations", "five larger fires").
 * Each such sentence is listed here with the count it has to agree with, so a change in the data
 * or in the lab fails the build until the sentence is changed too.
 */
describe("counts written as words", () => {
  const rep = data<ReportedDoc>("reported.json"), rank = data<RankDoc>("rank_features.json");
  const CLAIMS: [string, RegExp, number][] = [
    ["pages/Alarm.tsx", /Then (\w+) synthetic situations/, SCENARIOS.length],
    ["pages/Alarm.tsx", /The lab: (\w+) situations/, SCENARIOS.length],
    ["pages/Alarm.tsx", /the same (\w+) situations over many seeds/, SCENARIOS.length],
    ["pages/Home.tsx", /then (\w+) synthetic situations/, SCENARIOS.length],
    ["pages/Home.tsx", /(\w+) such situations in the lab/, SCENARIOS.length],
    ["pages/Alarm.tsx", /what rose in the cabin in (\w+) larger fires/, rep.saffire.rows.length],
    ["viz/Reported.tsx", /in (\w+) Saffire tests/, rep.saffire.rows.length],
    ["pages/Envelope.tsx", /the (\w+) tests NASA plans on the Moon/, rep.fm2.tests.length],
    ["pages/Home.tsx", /from (\w+) stated factors/, rank.factors.length],
    ["pages/Rank.tsx", /weighted sum of (\w+) stated factors/, rank.factors.length],
    ["pages/Rank.tsx", />The (\w+) factors and their rules</, rank.factors.length],
    ["app/nav.ts", /(\w+) conclusions of this site/, data<FalsifyDoc>("falsify.json").items.length],
    ["app/nav.ts", /NASA's (\w+) misconceptions/, data<MythsDoc>("myths.json").items.length],
    ["pages/About.tsx", /(\w+) classes of content/, Object.keys(KLASS).length],
    ["pages/Lessons.tsx", /The challenge's (\w+) resources/, data<{ nasa: { official_resources_total: number } }>("manifest.json").nasa.official_resources_total],
  ];

  it("the tour says nothing has been measured on the Moon only while that is so", () => {
    expect(page("mascot/Tour.tsx")).toContain("on the Moon not one behaviour has been measured");
    expect(data<MatrixDoc>("matrix.json").coverage.lunar.evidence).toBe(0);
  });
  for (const [file, re, n] of CLAIMS) {
    it(`${file}: “${re.source.replace(/\\/g, "").replace("(w+)", WORD[n] ?? String(n))}”`, () => {
      const m = page(file).match(re);
      expect(m, "the sentence is no longer on the page; remove or update this line").not.toBeNull();
      expect(m![1].toLowerCase()).toBe(WORD[n]);
    });
  }

  it("the matrix describes the test runs of the alarm lab as the test file runs them", () => {
    const said = /In the test runs, (\w+) seeds for each of (\w+) situations/.exec(JSON.stringify(data<MatrixDoc>("matrix.json")));
    expect(said, "the sentence is no longer in the matrix; remove or update this test").not.toBeNull();
    const seeds = /scorecard\(keys, \[([\d, ]+)\]\)/.exec(page("trust/lab.test.ts"))![1].split(",").length;
    expect([said![1], said![2]]).toEqual([WORD[seeds], WORD[SCENARIOS.length]]);
  });

  it("the scorecard runs every situation with every seed", () => {
    expect(new Set(SCORE_SEEDS).size).toBe(SCORE_SEEDS.length);
    expect(page("pages/Alarm.tsx")).toContain("SCENARIOS.length * SCORE_SEEDS.length");
  });
});
