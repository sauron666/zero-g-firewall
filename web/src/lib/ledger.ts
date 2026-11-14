import type { LedgerEntry } from "./types";

/**
 * Re-verifies the evidence ledger in the browser, from the same file the pipeline wrote.
 * entry_hash = SHA-256( prev_hash + the entry without entry_hash, as JSON with sorted keys and no spaces ).
 * The canonical text is rebuilt from the line itself, character by character, so numbers keep
 * the exact form they were hashed in.
 */
export function canonicalBody(line: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch !== " " && ch !== "\n" && ch !== "\r" && ch !== "\t") {
      out += ch;
    }
  }
  return out.replace(/,"entry_hash":"[0-9a-f]{64}"(?=})/, "").replace(/"entry_hash":"[0-9a-f]{64}",/, "");
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const canHash = () => typeof crypto !== "undefined" && !!crypto.subtle;

export function parseLedger(text: string): { entries: LedgerEntry[]; lines: string[] } {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return { entries: lines.map((l) => JSON.parse(l) as LedgerEntry), lines };
}

export interface ChainResult {
  ok: boolean;
  checked: number;
  head: string;
  brokenAt?: number;
  reason?: string;
}

export async function verifyChain(lines: string[], onProgress?: (done: number) => void): Promise<ChainResult> {
  let prev = "0".repeat(64);
  for (let i = 0; i < lines.length; i++) {
    const e = JSON.parse(lines[i]) as LedgerEntry;
    if (e.prev_hash !== prev) return { ok: false, checked: i, head: prev, brokenAt: e.seq, reason: "the link to the previous entry does not hold" };
    const h = await sha256Hex(prev + canonicalBody(lines[i]));
    if (h !== e.entry_hash) return { ok: false, checked: i, head: prev, brokenAt: e.seq, reason: "the entry does not match its hash" };
    prev = h;
    if (onProgress && i % 100 === 99) onProgress(i + 1);
  }
  return { ok: true, checked: lines.length, head: prev };
}

/** A copy of the ledger with one thing changed, for the demonstration on the ledger page. The real file is never touched. */
export type Tamper = "byte" | "remove" | "rehash";
export async function tamper(lines: string[], at: number, how: Tamper): Promise<{ lines: string[]; what: string }> {
  const copy = [...lines];
  const e = JSON.parse(copy[at]) as LedgerEntry;
  if (how === "remove") { copy.splice(at, 1); return { lines: copy, what: `Entry ${e.seq} was removed from the copy.` }; }
  const flipped = e.sha256.replace(/^./, (c) => (c === "0" ? "1" : "0"));
  copy[at] = copy[at].replace(`"sha256": "${e.sha256}"`, `"sha256": "${flipped}"`).replace(`"sha256":"${e.sha256}"`, `"sha256":"${flipped}"`);
  if (how === "byte") return { lines: copy, what: `One character of the file hash in entry ${e.seq} was changed in the copy.` };
  // a careful forger also recomputes that entry's own hash; the next entry still points at the old one
  const prev = at === 0 ? "0".repeat(64) : (JSON.parse(copy[at - 1]) as LedgerEntry).entry_hash;
  const fresh = await sha256Hex(prev + canonicalBody(copy[at]));
  copy[at] = copy[at].replace(e.entry_hash, fresh);
  return { lines: copy, what: `One character of the file hash in entry ${e.seq} was changed, and the forger recomputed that entry's own hash.` };
}
