import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runAgent } from "./agent";
import { verify } from "./ai";
import { beliefAsRule, beliefQuotes, numbers } from "./check";
import { CHECKSET, runCheckset } from "./checkset";
import { buildIndex } from "./search";
import type { Hit } from "./search";
import type { Passage } from "./types";

/** The check is tested on the passages the site ships: the sentences are ours, the sources are NASA's and the pipeline's. */
const load = (n: string) => JSON.parse(readFileSync(`public/data/v1/${n}`, "utf8"));
const passages: Passage[] = load("index.json").chunks;
const byId = new Map(passages.map((p) => [p.id, p]));
const quotes = beliefQuotes(passages);
const hit = (id: string): Hit => ({ passage: byId.get(id)!, score: 0, matched: [] });
const one = (text: string, id: string) => verify(`${text.replace(/\.$/, "")} [1].`, [hit(id)], quotes);
const BASS = "myth:fans:0:0";
const kit = { index: buildIndex(passages), envelope: load("envelope.json"), rank: load("rank_features.json"), matrix: load("matrix.json") };

describe("the sentence check", () => {
  it("every probe sentence on the page ends as it must", () => {
    const rep = runCheckset(passages);
    expect(rep.results.filter((r) => !r.ok).map((r) => `${r.c.id}: ${r.kept ? "kept" : r.reason}`)).toEqual([]);
    expect(rep.n).toBe(CHECKSET.length);
    expect(CHECKSET.filter((c) => c.keep).length).toBeGreaterThanOrEqual(5);
    expect(CHECKSET.every((c) => !c.cite || byId.has(c.cite))).toBe(true);
  });

  it("does not let one test become a rule, whichever passage the sentence cites", () => {
    const hits = runAgent("Will a fire go out if the fans are stopped?", kit).hits;
    const all = [...hits, hit(BASS), hit("guide:pdf35:1"), hit("inv:PSI-20:impacts:0")];
    const rules = ["Every spacecraft fire extinguishes when ventilation stops", "Spacecraft fires extinguish when ventilation stops", "A fire will go out if the fans are stopped",
      "Stopping the fans puts out a fire", "Without airflow, flames in microgravity die", "A flame is extinguished when the flow is cut off", "Fires put themselves out in microgravity",
      "BASS-II showed that a fire extinguishes when ventilation stops", "Combustion ceases once circulation is halted", "Fires went out when the fans were stopped"];
    for (const r of rules) for (let n = 1; n <= all.length; n++) {
      const v = verify(`${r} [${n}].`, all, quotes);
      expect(v.kept, `${r} [${all[n - 1].passage.id}]`).toEqual([]);
      expect(v.dropped[0].reason).toMatch(/^states as a rule a belief NASA's guide lists as a misconception: “/);
    }
  });

  it("names the misconception in the guide's own words, read from the data", () => {
    expect(Object.keys(quotes).sort()).toEqual(["fans", "one-g-tests", "still-air"]);
    expect(one("Every spacecraft fire extinguishes when ventilation stops.", BASS).dropped[0].reason).toContain(`“${quotes.fans.replace(/\.$/, "")}”`);
    expect(byId.get("guide:pdf35:1")!.x).toContain(quotes.fans);
  });

  it("keeps the same finding when it is told as one test, and shows the sentence it rests on", () => {
    const v = one("In a BASS-II test the flame extinguished within 2 s after the flow was cut off.", BASS);
    expect(v.dropped).toEqual([]);
    expect(v.kept[0].basis![0].text).toContain("observed to extinguish within 2 s");
    expect(byId.get(BASS)!.x).toContain(v.kept[0].basis![0].text);
  });

  it("tells a report from a rule by the wording alone", () => {
    expect(beliefAsRule("The flow was abruptly cut off and the flame was observed to extinguish within 2 s")).toBeNull();
    expect(beliefAsRule("In one test on the space station the flame goes out when the flow is cut")).toBeNull();
    expect(beliefAsRule("A fire may not go out when the fans stop")).toBeNull();
    expect(beliefAsRule("NASA's guide lists the belief that a fire will self-extinguish if ventilation is shut off as a misconception")).toBeNull();
    expect(beliefAsRule("A fire goes out when the fans stop")).toEqual({ id: "fans", denied: false });
    expect(beliefAsRule("A fire does not go out when the fans stop")).toEqual({ id: "fans", denied: true });
    expect(beliefAsRule("A flame cannot burn in still air in microgravity")).toEqual({ id: "still-air", denied: false });
    expect(beliefAsRule("Tests on Earth are a conservative bound for space")).toEqual({ id: "one-g-tests", denied: false });
    expect(beliefAsRule("That is not a misconception; fires go out when the fans stop")?.id).toBe("fans");
  });

  it("allows no word, name, place or number the sentence it rests on does not have", () => {
    const why = (text: string, id = BASS) => { const v = one(text, id); expect(v.kept, text).toEqual([]); return v.dropped[0].reason; };
    expect(why("On Skylab the flame was observed to extinguish within 2 s.")).toBe("not in the cited passage: “Skylab”");
    expect(why("The flame was observed to reignite within 2 s.")).toBe("not in the cited passage: “reignite”");
    expect(why("The flame was observed to extinguish within 2 minutes.")).toBe("not in the cited passage: “minutes”");
    expect(why("The flame was observed to extinguish within 2.2 s.")).toBe("the cited sentence has 2.2 next to other words");
    expect(why("The spread rate was 2.2 cm/s.")).toMatch(/^not in the cited passage/);
    expect(why("The flame was observed to extinguish more than 2 s after the flow was cut off.")).toBe("not in the cited passage: “more”");
    expect(why("On the Moon, cutting the airflow starved the flame NASA tested within two seconds.", "myth:fans")).toBe("“Moon” is not in the sentence it rests on");
    expect(why("In a lunar habitat, stopping the air starved the flame NASA tested.", "pb:ventilation")).toMatch(/is not in the sentence it rests on$/);
    expect(why("In lunar gravity buoyancy starved the flame.", "pb:ventilation")).toMatch(/^joins parts of the passage that stand apart/);
  });

  it("allows no wider reach, no dropped denial and no verdict", () => {
    const why = (text: string, id = BASS) => { const v = one(text, id); expect(v.kept, text).toEqual([]); return v.dropped[0].reason; };
    expect(why("All flames were observed to extinguish within 2 s.")).toBe("wider than its source: “all” is not in the sentence it cites");
    expect(why("The flame was observed to extinguish within 2 s in most tests.")).toMatch(/“most” is not in the sentence it cites$/);
    expect(why("Several flames were observed to extinguish within 2 s.")).toMatch(/“several”/);
    expect(why("The flame was never observed to extinguish.")).toBe("says “never” where the sentence it cites does not");
    expect(why("A duct detector that goes quiet after the fans stop has lost its fire.", "pb:ventilation")).toBe("leaves out the “not” of the sentence it cites");
    expect(why("The table has a column saying whether each flame went out.", "mx:flow-fed")).toBe("leaves out the “no” of the sentence it cites");
    expect(why("This alone puts a fire out.", "pb:ventilation")).toBe("the cited passage gives this as a misconception; the sentence does not say so");
    expect(why("Cutting the airflow makes the space station safe.", "myth:fans")).toMatch(/^gives a verdict/);
    expect(why("Yes, the flame was observed to extinguish within 2 s.")).toBe("not in the cited passage: “Yes”");
  });

  it("judges each cited stretch against its own passage, and words after the last citation cite nothing", () => {
    const hits = [hit(BASS), hit("mx:flow-fed")];
    const two = verify("The flame was observed to extinguish within 2 s [1], and BASS-II in PSI has 129 test rows [2].", hits, quotes);
    expect(two.dropped).toEqual([]);
    expect(two.kept[0].basis!.map((b) => b.cite)).toEqual([1, 2]);
    expect(verify("The flame was observed to extinguish within 2 s [2], and BASS-II in PSI has 129 test rows [1].", hits, quotes).kept).toEqual([]);
    expect(verify("The flame was observed to extinguish within 2 s [1] and the crew was unharmed.", hits, quotes).dropped[0].reason).toBe("no citation for “and the crew was unharmed”");
  });

  it("keeps faithful restatements of the passages retrieved for the fans question", () => {
    const keep: [string, string][] = [
      ["The BASS-II flame was observed to extinguish within 2 s after the flow was abruptly cut off.", BASS],
      ["The steady spread rate was 2.2 mm/s.", BASS],
      ["It held when the forced flow was the flame's only source of oxygen.", BASS],
      ["In lunar gravity buoyancy keeps air moving after the fans stop, and no test exists.", "pb:ventilation"],
      ["A duct detector that goes quiet after the fans stop has lost its air supply, not necessarily its fire.", "pb:ventilation"],
      ["Stopping the air starved the flame NASA tested in free fall.", "pb:ventilation"],
      ["On the Moon gravity keeps air moving after every fan has stopped.", "myth:fans"],
      ["BASS-II in PSI has 129 test rows, with oxygen at the start between 13.6% and 22.2%.", "mx:flow-fed"],
      ["The table has no column saying whether each flame went out.", "mx:flow-fed"],
      ["Of the 20 records with a table, 10 state oxygen, 8 state air flow and 2 state the ending.", "inv:fans"],
      ["The ongoing combustion without air flow was notably seen in elevated-oxygen atmospheres.", "inv:PSI-20:impacts:0"],
      ["A fire will not necessarily self-extinguish if ventilation is shut off.", "guide:pdf35:1"],
    ];
    for (const [text, id] of keep) expect(one(text, id).dropped.map((d) => d.reason), text).toEqual([]);
  });

  it("reads numbers written as words, and leaves 'one' alone", () => {
    expect(numbers("within two seconds, at 2.20 mm/s, in one test of 1,200")).toEqual(["2", "2.2", "1200"]);
  });
});
