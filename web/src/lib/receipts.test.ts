import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { receipts } from "./receipts";
import { BRANCHES } from "../physics/paradox";
import type { EnvelopeDoc, MythsDoc } from "./types";

const load = <T,>(name: string) => JSON.parse(readFileSync(new URL(`../../public/data/v1/${name}`, import.meta.url), "utf8")) as T;
const fans = load<MythsDoc>("myths.json").items.find((c) => c.id === "fans")!;

describe("the branches of the fans model", () => {
  it("each rest on quotations found word for word in the stored NASA documents", () => {
    for (const b of Object.values(BRANCHES)) {
      const said = receipts(fans, b.id).flatMap((r) => r.quotes);
      expect(said.length, b.id).toBeGreaterThan(0);
      for (const words of b.cites) expect(said.some((q) => q.includes(words)), `${b.id}: “${words}”`).toBe(true);
    }
  });

  it("state no number that their quotations do not state", () => {
    const WORDS: Record<string, string> = { "2": "2 s", "45": "45 minutes", "40": "40 minutes", "10": "10 cm/s" };
    for (const b of Object.values(BRANCHES)) {
      const said = receipts(fans, b.id).flatMap((r) => r.quotes).join(" ");
      for (const n of b.evidence.match(/\d+(?:\.\d+)?/g) ?? []) {
        if (n === "1997") continue;                                                  // the year of the Mir fire stands in the name of the group's source, not in a quotation
        expect(said.includes(WORDS[n] ?? `no rule for ${n}`), `${b.id}: ${n}`).toBe(true);
      }
    }
  });

  it("put the quotations of one page under one receipt", () => {
    const d = receipts(fans, "diffusion");
    expect(d).toHaveLength(1);
    expect(d[0].quotes).toHaveLength(2);
    expect(d[0].label).toBe("Researcher's Guide, p. 30");
    expect(receipts(fans, "selffed").map((r) => r.label)).toEqual(["Researcher's Guide, p. 31", "NASA History, the Mir fire"]);
    expect(receipts(undefined, "starved")).toEqual([]);
  });

  it("take the count of partial-gravity rows from the data", () => {
    const item = fans.groups.flatMap((g) => g.items).find((it) => it.kind === "data" && it.id === "partial_gravity_rows");
    const n = load<EnvelopeDoc>("envelope.json").gravity_counts.partial;
    expect(item && item.kind === "data" && item.text.includes(`${n} were taken in lunar or Martian gravity`)).toBe(true);
  });
});
