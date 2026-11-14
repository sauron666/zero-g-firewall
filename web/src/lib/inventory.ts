import type { FlowWordsTable, InventoryCell, InventoryColumn, InventoryDoc, InventoryItem } from "./types";

/** Questions a model of a cabin fire asks of the data. Each is only a choice of columns; the answer is counted from NASA's tables. */
export const MODEL_NEEDS: { id: string; ask: string; needs: string[] }[] = [
  { id: "fans", ask: "Will it go out when the fans stop?", needs: ["oxygen", "flow", "ending"] },
  { id: "limit", ask: "Where does a flame stop burning?", needs: ["oxygen", "pressure", "ending"] },
  { id: "air", ask: "What does a fire put in the air?", needs: ["gases_after"] },
  { id: "spread", ask: "How fast does it burn in moving air?", needs: ["flow", "rates"] },
];

/** Records whose table has a column for every chosen quantity. */
export const stating = (doc: InventoryDoc, ids: string[]): InventoryItem[] => (ids.length ? doc.items.filter((it) => ids.every((q) => it.cells[q])) : []);

const list = (w: string[]) => (w.length <= 1 ? w.join("") : w.length === 2 ? w.join(" and ") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`);
const name = (it: InventoryItem) => it.acronym || it.accession;

/** The answer for a choice of quantities, in one or two sentences, every number counted from the artifact. */
export function answer(doc: InventoryDoc, ids: string[]): string {
  if (!ids.length) return "Choose what a model needs, and the records whose tables state all of it are counted.";
  const phrase = (q: string) => doc.quantities.find((x) => x.id === q)?.phrase ?? q;
  const words = list(ids.map(phrase));
  const hit = stating(doc, ids);
  const of = doc.counts.with_table;
  if (!hit.length) {
    if (ids.length === 1) return `No record's table states ${words}.`;
    return `No record's table states ${words} together. Of the ${of} records with a table, ${list(ids.map((q) => `${doc.totals[q]?.records ?? 0} state ${phrase(q)}`))}.`;
  }
  const rows = hit.reduce((a, it) => a + it.rows, 0);
  const names = hit.map(name);
  return `${hit.length} of the ${of} records with a table state${hit.length === 1 ? "s" : ""} ${words}: ${names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : list(names)} ` +
    `(${rows.toLocaleString("en-US")} test rows).`;
}

/** When no table states everything asked for: the records that lack exactly one of the quantities, grouped by the one they lack. */
export function nearest(doc: InventoryDoc, ids: string[]): { lacks: string; records: InventoryItem[] }[] {
  if (ids.length < 2 || stating(doc, ids).length) return [];
  return ids.map((q) => ({ lacks: doc.quantities.find((x) => x.id === q)?.phrase ?? q, records: doc.items.filter((it) => !it.cells[q] && ids.every((o) => o === q || it.cells[o])) }))
    .filter((g) => g.records.length > 0).sort((a, b) => b.records.length - a.records.length);
}
/** The same as a sentence. */
export function nearestSay(doc: InventoryDoc, ids: string[]): string {
  const g = nearest(doc, ids);
  if (!g.length) return "";
  return "Nearest: " + g.map((x) => `${x.records.length} record${x.records.length === 1 ? " lacks" : "s lack"} only ${x.lacks} (${x.records.map(name).join(", ")})`).join("; ") + ".";
}

/** Classes that say something about the flame. A display that reads 0 says nothing about it. */
export const SAYS_ENDING = (cls: string) => cls !== "zero";
/** Rows of a table whose flow columns say in words how the test ended. */
export const worded = (w: FlowWordsTable) => w.rows.filter((x) => SAYS_ENDING(x.class));
/** Tables that hold the ending in words although they have no column for it, for records that state everything else asked for. */
export function inWords(doc: InventoryDoc, ids: string[]): FlowWordsTable[] {
  if (!ids.includes("ending")) return [];
  return doc.flow_words.tables.filter((w) => { const it = doc.items.find((x) => x.accession === w.accession); return !!it && !it.cells.ending && ids.every((q) => q === "ending" || it.cells[q]); });
}
export function inWordsSay(doc: InventoryDoc, ids: string[]): string {
  return inWords(doc, ids).map((w) => `${w.acronym || w.accession} comes closest: it has no column for the ending, but its flow columns say in words how ${worded(w).length} of its ${w.n_rows} tests ended.`).join(" ");
}

/** Lanes of the strip chart: classes drawn together when they say the same kind of thing. */
export const WORD_LANES: { id: string; label: string; classes: string[] }[] = [
  { id: "went_out", label: "the flow columns say the flame went out", classes: ["went_out"] },
  { id: "blowoff", label: "they say the flame blew off", classes: ["blowoff"] },
  { id: "never", label: "they say it would not ignite, or would not stay lit", classes: ["no_ignition", "not_lit"] },
  { id: "zero", label: "a display reads 0, with no word on the flame", classes: ["zero"] },
];
/**
 * Dots of one lane placed so that none hides another: each takes the first level on which no dot already sits within
 * `gap` of it, measured on the drawn axis. `at` gives a row's place on that axis.
 */
export function stack<T extends { o2: number | null }>(rows: T[], at: (o2: number) => number = (v) => v * 100, gap = 10): { row: T; k: number }[] {
  const levels: number[][] = [];
  return rows.filter((x) => x.o2 != null).sort((a, b) => a.o2! - b.o2!).map((row) => {
    const x = at(row.o2!);
    let k = 0;
    while (levels[k]?.some((px) => Math.abs(px - x) < gap)) k++;
    (levels[k] ??= []).push(x);
    return { row, k };
  });
}

export type Mark = "numbers" | "number" | "words" | "word";
/** Circle for numbers, square for words; filled when the column holds more than one value. */
export const markOf = (c: InventoryCell): Mark => (c.as_text ? (c.state === "varied" ? "words" : "word") : c.state === "varied" ? "numbers" : "number");
export const MARK_WORDS: Record<Mark, string> = { numbers: "numbers that vary", number: "one number in every row", words: "words that vary", word: "the same words in every row" };

const g = (v: number) => String(+v.toPrecision(4));
/** One column as the reader should see it: what it holds, and in how many rows. */
export function columnLine(c: InventoryColumn): string {
  const what = c.min != null && c.max != null ? (c.min === c.max ? g(c.min) : `${g(c.min)} to ${g(c.max)}`) : c.example ? `for example “${c.example}”` : "";
  const many = c.distinct > 1 ? `${c.distinct} different values` : "one value";
  return [what, many, `${c.filled} of ${c.of} rows`].filter(Boolean).join(" · ");
}

const q = (s: string | number | undefined) => { const t = String(s ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** The whole inventory as rows a spreadsheet can read: one line per column of a NASA table, with the file's hash. */
export function inventoryCsv(doc: InventoryDoc): string {
  const head = ["record", "investigation", "quantity", "column_as_written", "kind", "distinct_values", "filled_rows", "rows_in_table", "min", "max", "table_file", "table_sha256", "ledger_entry"];
  const lines = [head.join(",")];
  for (const it of doc.items) {
    const file = new Map(it.tables.map((t) => [t.artifact, t]));
    for (const quantity of doc.quantities) {
      for (const c of it.cells[quantity.id]?.columns ?? []) {
        const t = file.get(c.table);
        lines.push([it.accession, it.acronym, quantity.label, c.name, c.kind, c.distinct, c.filled, c.of, c.min, c.max, t?.file_name, t?.sha256, t?.ledger_seq].map(q).join(","));
      }
    }
  }
  for (const c of doc.not_placed) lines.push([c.accession, "", "not placed by a rule", c.name, c.kind, c.distinct, c.filled, c.of, c.min, c.max, "", "", ""].map(q).join(","));
  return lines.join("\n") + "\n";
}

/** Raw files of all records by kind, largest first, with what no kind names. */
export function rawByKind(doc: InventoryDoc): { id: string; label: string; files: number; records: number }[] {
  const out = doc.file_kinds.map((k) => ({ id: k.id, label: k.label, files: doc.items.reduce((a, it) => a + (it.files.raw[k.id]?.files ?? 0), 0), records: doc.items.filter((it) => (it.files.raw[k.id]?.files ?? 0) > 0).length }));
  const other = doc.items.reduce((a, it) => a + Object.values(it.files.other_extensions).reduce((x, y) => x + y, 0), 0);
  if (other) out.push({ id: "other", label: "Other formats", files: other, records: doc.items.filter((it) => Object.keys(it.files.other_extensions).length > 0).length });
  return out.sort((a, b) => b.files - a.files);
}
