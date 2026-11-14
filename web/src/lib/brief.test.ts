import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missionBrief } from "./brief";
import { rankAll, stability } from "./rank";

const load = (n: string) => JSON.parse(readFileSync(`public/data/v1/${n}`, "utf8"));
const doc = load("rank_features.json"), gaps = load("gaps.json"), manifest = load("manifest.json");

describe("mission brief", () => {
  const lens = doc.lenses.find((l: { id: string }) => l.id === "lunar");
  const ranked = rankAll(doc, "lunar", lens.weights);
  const md = missionBrief({ doc, lens, weights: lens.weights, ranked, stab: stability(doc, "lunar", lens.weights, 50), draws: 50, gaps, manifest, changed: false });

  it("lists the five records the ranking page shows, in the same order", () => {
    const names = ranked.slice(0, 5).map((r) => r.item.accession);
    const found = Array.from(md.matchAll(/^\d\. \*\*.+?\*\* \((PSI-\d+)\)/gm)).map((m) => m[1]);
    expect(found).toEqual(names);
  });
  it("carries the gaps, the limit on gravity and the ledger head", () => {
    for (const g of gaps.items) expect(md).toContain(g.title);
    expect(md).toContain("No record was taken in the gravity of this mission.");
    expect(md).toContain(manifest.nasa.ledger_head);
    expect(md).toContain("It is not a probability and not a safety rating.");
  });
  it("gives no verdict", () => expect(md).not.toMatch(/\bis safe\b|\bare safe\b|\bsafe to\b/i));
  it("says when the reader changed the weights", () => {
    const other = missionBrief({ doc, lens, weights: { ...lens.weights, flow: 0.5 }, ranked, stab: null, draws: 0, gaps: null, manifest: null, changed: true });
    expect(other).toContain("(changed by the reader)");
    expect(other).not.toContain("## What has not been measured");
  });
});
