import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { authorsOf, citation } from "./cite";
import type { InvestigationsDoc } from "./types";

const doc = JSON.parse(readFileSync(new URL("../../public/data/v1/investigations.json", import.meta.url), "utf8")) as InvestigationsDoc;
const of = (acc: string) => doc.items.find((i) => i.accession === acc)!;

describe("a citation for a PSI record", () => {
  it("is composed from the record's own fields and names the file that was read", () => {
    const inv = of("PSI-25"), c = citation(inv, "2026-11-14T11:08:57Z");
    expect(c.text).toContain(inv.title);
    expect(c.text).toContain(`https://doi.org/${inv.doi}`);
    expect(c.text).toContain(`${inv.accession}, version ${inv.psi_version}`);
    expect(c.text).toContain(`SHA-256 ${inv.tables[0].sha256}`);
    expect(c.text).toContain("read on 2026-11-14");
    expect(c.year).toBe(/(\d{4})/.exec(inv.released!)![1]);
    for (const a of c.authors) expect(inv.people.some((p) => p.name.trim() === a)).toBe(true);
    expect(c.bibtex.startsWith(`@misc{${c.key},`)).toBe(true);
    expect(c.bibtex).toContain(`doi       = {${inv.doi}}`);
    expect(c.bibtex.trim().endsWith("}")).toBe(true);
  });

  it("puts the principal investigator first and invents nobody", () => {
    for (const inv of doc.items) {
      const a = authorsOf(inv);
      expect(a.length).toBe(new Set(a).size);
      for (const n of a) expect(inv.people.some((p) => p.name.trim().replace(/\s+/g, " ") === n), `${inv.accession}: ${n}`).toBe(true);
      const pi = inv.people.find((p) => /principal investigator/i.test(p.role) && p.name.trim());
      if (pi) expect(a[0]).toBe(pi.name.trim().replace(/\s+/g, " "));
    }
  });

  it("works for every record, with or without a table, and escapes what BibTeX reads as syntax", () => {
    for (const inv of doc.items) {
      const c = citation(inv, null);
      expect(c.text.includes("undefined") || c.text.includes("null") || c.bibtex.includes("undefined")).toBe(false);
      expect((c.bibtex.match(/{/g) ?? []).length).toBe((c.bibtex.match(/}/g) ?? []).length);
      expect(/(^|[^\\])[&%#]/.test(c.bibtex.replace(/url\s+= {[^}]*}/, ""))).toBe(false);
    }
    const none = doc.items.find((i) => i.tables.length === 0);
    if (none) expect(citation(none, "2026-11-14T11:08:57Z").text).toContain("Record read on 2026-11-14");
  });
});
