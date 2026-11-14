import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalBody, parseLedger, verifyChain } from "./ledger";

// the ledger the team's sync wrote on 14 November 2026, hashed by Python; the browser code must agree with it
const text = readFileSync(new URL("../../../nasa_raw/ledger/ledger.jsonl", import.meta.url), "utf8");

describe("ledger chain, re-verified by the browser code", () => {
  const { lines, entries } = parseLedger(text);

  it("accepts the real ledger and ends on its recorded head", async () => {
    const r = await verifyChain(lines);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(entries.length);
    expect(r.head).toBe(entries[entries.length - 1].entry_hash);
  });

  it("detects a changed byte and names the entry", async () => {
    const bad = [...lines];
    bad[5] = bad[5].replace(/"size": (\d+)/, (_, n) => `"size": ${Number(n) + 1}`);
    const r = await verifyChain(bad);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(5);
  });

  it("detects a removed entry", async () => {
    const r = await verifyChain([...lines.slice(0, 3), ...lines.slice(4)]);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(4);
  });

  it("keeps numbers in the form they were hashed in", () => {
    expect(canonicalBody('{"a": 437766.0, "entry_hash": "' + "0".repeat(64) + '", "b": "x y"}')).toBe('{"a":437766.0,"b":"x y"}');
  });
});
