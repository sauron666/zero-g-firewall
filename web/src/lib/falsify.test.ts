import { describe, expect, it } from "vitest";
import { firstPass } from "./falsify";
import { buildIndex } from "./search";

const ix = buildIndex([
  { id: "a", k: "literature", t: "Guide, p. 35", x: "This resulted in several critical misconceptions about fires. A fire will self-extinguish if ventilation is shut off." },
  { id: "b", k: "literature", t: "BASS-II", x: "The flow was abruptly cut off and the flame was observed to extinguish within 2 s." },
  { id: "c", k: "observed", t: "FLEX", x: "FLEX burned fuel droplets in a sealed chamber." },
]);

describe("first pass at refuting a typed conclusion", () => {
  it("separates passages that carry a limiting phrase from those that do not", () => {
    const r = firstPass("A fire goes out when ventilation stops", ix);
    expect(r.against.map((h) => [h.passage.id, h.cue])).toEqual([["a", "misconception"]]);
    expect(r.alongside.map((h) => h.passage.id)).toContain("b");
  });
  it("names the untested regimes a claim touches, and flags absolutes", () => {
    const r = firstPass("Fabric in a lunar habitat is always safe once the fans stop", ix);
    expect(r.untested).toHaveLength(3);
    expect(r.untested[0]).toMatch(/^Partial gravity/);
    expect(r.untested[2]).toMatch(/^The claim is absolute/);
  });
  it("returns nothing for words the evidence does not hold", () => {
    const r = firstPass("penguins prefer jazz", ix);
    expect(r.against.length + r.alongside.length).toBe(0);
  });
});
