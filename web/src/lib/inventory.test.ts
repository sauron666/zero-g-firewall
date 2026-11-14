import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MODEL_NEEDS, SAYS_ENDING, WORD_LANES, answer, columnLine, inWords, inWordsSay, inventoryCsv, markOf, nearest, nearestSay, rawByKind, stack, stating, worded } from "./inventory";
import type { InventoryDoc, RankDoc } from "./types";

const load = <T,>(name: string) => JSON.parse(readFileSync(new URL(`../../public/data/v1/${name}`, import.meta.url), "utf8")) as T;
const doc = load<InventoryDoc>("inventory.json");
const rank = load<RankDoc>("rank_features.json");

describe("what the tables state", () => {
  it("accounts for every column it read", () => {
    const c = doc.counts;
    expect(c.placed + c.set_aside + c.not_placed).toBe(c.columns);
    expect(doc.items.reduce((a, it) => a + Object.values(it.cells).reduce((b, cell) => b + cell.columns.length, 0), 0)).toBe(c.placed);
    expect(doc.items.filter((it) => it.tables.length > 0).length).toBe(c.with_table);
    expect(doc.items.reduce((a, it) => a + it.rows, 0)).toBe(c.rows);
  });

  it("agrees with the marks on the list of records", () => {
    const by = new Map(doc.items.map((it) => [it.accession, it]));
    for (const r of rank.items) {
      const cells = by.get(r.accession)!.cells;
      expect(!!cells.flow, `${r.accession} air flow`).toBe(r.facets.flow);                      // one pattern serves both
      if (r.facets.oxygen) expect(cells.oxygen, `${r.accession} is on the atmosphere map`).toBeTruthy();
      if (r.facets.pressure) expect(cells.pressure, `${r.accession} states pressure on the map`).toBeTruthy();
    }
  });

  it("counts the records that state all of a model's needs", () => {
    for (const m of MODEL_NEEDS) {
      const hit = stating(doc, m.needs);
      for (const it of hit) for (const q of m.needs) expect(it.cells[q]).toBeTruthy();
      expect(hit.length).toBeLessThanOrEqual(Math.min(...m.needs.map((q) => doc.totals[q].records)));
      expect(m.needs.every((q) => doc.quantities.some((x) => x.id === q))).toBe(true);
    }
    expect(stating(doc, [])).toEqual([]);
  });

  it("says so plainly when no table states them together", () => {
    const fans = MODEL_NEEDS.find((m) => m.id === "fans")!;
    const hit = stating(doc, fans.needs);
    const text = answer(doc, fans.needs);
    if (hit.length === 0) {
      expect(text).toMatch(/^No record's table states .* together\./);
      for (const q of fans.needs) expect(text).toContain(`${doc.totals[q].records} state ${doc.quantities.find((x) => x.id === q)!.phrase}`);
    } else expect(text).toContain(`${hit.length} of the ${doc.counts.with_table} records`);
    const one = answer(doc, ["fuel"]);
    expect(one).toContain(`${doc.totals.fuel.records} of the ${doc.counts.with_table} records with a table state what burned`);
    expect(one).toContain(`${stating(doc, ["fuel"]).reduce((a, it) => a + it.rows, 0).toLocaleString("en-US")} test rows`);
  });

  it("names the records that lack only one of the things asked for", () => {
    for (const m of MODEL_NEEDS) {
      const groups = nearest(doc, m.needs);
      if (stating(doc, m.needs).length) { expect(groups).toEqual([]); expect(nearestSay(doc, m.needs)).toBe(""); continue; }
      for (const g of groups) for (const it of g.records) expect(m.needs.filter((q) => !it.cells[q]).length).toBe(1);
      expect(groups.reduce((a, g) => a + g.records.length, 0)).toBe(doc.items.filter((it) => m.needs.filter((q) => !it.cells[q]).length === 1).length);
    }
    expect(nearest(doc, ["oxygen"])).toEqual([]);
  });

  it("reads how tests ended only from words that are in the table", () => {
    const table = load<{ columns: string[]; rows: string[][] }>;
    for (const w of doc.flow_words.tables) {
      const t = table(w.table);
      const heads = t.columns.map((h) => h.split(/\s+/).filter(Boolean).join(" "));
      expect(w.rows.length + w.silent).toBe(w.n_rows);
      expect(w.classes.reduce((a, c) => a + c.rows, 0)).toBe(w.rows.length);
      for (const x of w.rows) {
        for (const [name, text] of Object.entries(x.cells)) expect(t.rows[x.r][heads.indexOf(name)].split(/\s+/).filter(Boolean).join(" ")).toBe(text);
        expect(new RegExp(w.classes.find((c) => c.id === x.class)!.pattern, "i").test(Object.values(x.cells).join(" | "))).toBe(true);
      }
      expect(worded(w).every((x) => SAYS_ENDING(x.class))).toBe(true);
      expect(WORD_LANES.flatMap((l) => l.classes).sort()).toEqual(w.classes.map((c) => c.id).sort());       // every class has a lane, and only one
    }
  });

  it("names the table that holds the ending in words when no table has a column for it", () => {
    const fans = MODEL_NEEDS.find((m) => m.id === "fans")!.needs;
    for (const w of inWords(doc, fans)) {
      const it = doc.items.find((x) => x.accession === w.accession)!;
      expect(it.cells.ending).toBeUndefined();
      expect(inWordsSay(doc, fans)).toContain(`how ${worded(w).length} of its ${w.n_rows} tests ended`);
    }
    expect(inWords(doc, ["oxygen", "pressure"])).toEqual([]);
  });

  it("spreads dots at one oxygen level so none hides another", () => {
    const placed = stack([{ o2: 20.8 }, { o2: 20.8 }, { o2: 20.84 }, { o2: 15 }, { o2: null }], (v) => v * 100, 10);      // 100 px to a percent, dots 10 px wide
    expect(placed.map((p) => [p.row.o2, p.k])).toEqual([[15, 0], [20.8, 0], [20.8, 1], [20.84, 2]]);
    expect(stack([{ o2: 20.8 }, { o2: 20.95 }], (v) => v * 100, 10).map((p) => p.k)).toEqual([0, 0]);                      // far enough apart to share a line
    expect(stack([{ o2: 20.8 }, { o2: 20.95 }], (v) => v * 20, 10).map((p) => p.k)).toEqual([0, 1]);                       // on a narrow chart they no longer are
  });

  it("draws numbers as circles and words as squares", () => {
    const flex2 = doc.items.find((it) => it.acronym === "FLEX-2");
    if (flex2?.cells.oxygen) expect(markOf(flex2.cells.oxygen)).toBe("word");                   // one cell of text listing several fractions
    for (const it of doc.items) for (const cell of Object.values(it.cells)) {
      const m = markOf(cell);
      expect(m.startsWith("number")).toBe(cell.columns.some((c) => c.kind === "number" || c.kind === "quantity"));
      expect(m.endsWith("s")).toBe(cell.columns.some((c) => c.distinct > 1));
    }
  });

  it("describes a column by what it holds", () => {
    expect(columnLine({ table: "t", name: "O2", kind: "number", filled: 127, distinct: 50, of: 129, min: 13.6, max: 22.2 })).toBe("13.6 to 22.2 · 50 different values · 127 of 129 rows");
    expect(columnLine({ table: "t", name: "Material", kind: "text", filled: 2, distinct: 1, of: 2, example: "SIBAL Fabric" })).toBe("for example “SIBAL Fabric” · one value · 2 of 2 rows");
  });

  it("writes one CSV line for each column, with the hash of its table", () => {
    const lines = inventoryCsv(doc).trim().split("\n");
    expect(lines.length).toBe(1 + doc.counts.placed + doc.counts.not_placed);
    expect(lines[0].split(",")).toContain("table_sha256");
    const bass = lines.find((l) => l.startsWith("PSI-25,") && l.includes("Final CO (ppm)"))!;
    expect(bass).toContain(doc.items.find((it) => it.accession === "PSI-25")!.tables[0].sha256);
  });

  it("adds up PSI's raw files by kind", () => {
    const kinds = rawByKind(doc);
    expect(kinds.reduce((a, k) => a + k.files, 0)).toBe(doc.counts.raw_files);
    expect(kinds.map((k) => k.files)).toEqual([...kinds.map((k) => k.files)].sort((a, b) => b - a));
  });
});
