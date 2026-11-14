import type { MythCard, MythItem } from "./types";

type Quote = Extract<MythItem, { kind: "quote" }>;
export interface BranchReceipt { label: string; source: string; ref: Quote["ref"]; quotes: string[] }

/**
 * The checked quotations that stand behind one branch of the fans model: one receipt per document and page,
 * holding every quotation found there. A quotation that was not found word for word is left out.
 */
export function receipts(card: MythCard | undefined, branch: string): BranchReceipt[] {
  const out: BranchReceipt[] = [];
  for (const g of card?.groups ?? []) {
    if (g.branch !== branch) continue;
    for (const it of g.items) {
      if (it.kind !== "quote" || !it.quote_verified) continue;
      const loc = it.ref.loc && /^p\. /.test(it.ref.loc) ? `, ${it.ref.loc}` : "";
      const label = `${it.short ?? it.source}${loc}`;
      const at = out.find((r) => r.label === label);
      if (at) at.quotes.push(it.quote);
      else out.push({ label, source: it.source, ref: it.ref, quotes: [it.quote] });
    }
  }
  return out;
}
