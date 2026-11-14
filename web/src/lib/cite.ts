import type { Investigation } from "./types";

/**
 * A citation for a PSI record, composed from the record's own fields: people, title, release
 * year, DOI and version. PSI gives no citation line of its own, so this one says what it is.
 * The note names the experimental table this site read and its SHA-256, so a reader can tell
 * whether a later download is the same file.
 */
export interface Citation { text: string; bibtex: string; key: string; authors: string[]; year: string | null }

const yearOf = (s: string | null) => (s && /(\d{4})/.exec(s)?.[1]) || null;
const tex = (s: string) => s.replace(/([&%$#_{}])/g, "\\$1");

/** Investigators first, in the order PSI lists them; everyone listed if the record names no investigator. */
export function authorsOf(inv: Investigation): string[] {
  const named = inv.people.filter((p) => p.name.trim());
  const pi = named.filter((p) => /principal investigator/i.test(p.role));
  const other = named.filter((p) => /investigator/i.test(p.role) && !/principal investigator/i.test(p.role));
  const list = pi.length + other.length ? [...pi, ...other] : named;
  return Array.from(new Set(list.map((p) => p.name.trim().replace(/\s+/g, " "))));
}

export function citation(inv: Investigation, readOn: string | null): Citation {
  const authors = authorsOf(inv);
  const year = yearOf(inv.released) ?? yearOf(inv.modified);
  const title = `${inv.title.trim()}${inv.acronym && !inv.title.includes(inv.acronym) ? ` (${inv.acronym})` : ""}`;
  const version = inv.psi_version != null ? `, version ${inv.psi_version}` : "";
  const url = inv.doi ? `https://doi.org/${inv.doi}` : inv.psi_url;
  const day = readOn ? readOn.slice(0, 10) : null;
  const read = inv.tables.map((t) => `${t.file}, SHA-256 ${t.sha256}`);
  const note = read.length ? `Experimental table${read.length > 1 ? "s" : ""} read${day ? ` on ${day}` : ""}: ${read.join("; ")}` : day ? `Record read on ${day}` : "";
  const who = authors.length ? `${authors.join(", ")}` : "NASA Physical Sciences Informatics";
  const text = `${who} (${year ?? "n.d."}). ${title}. NASA Physical Sciences Informatics (PSI), ${inv.accession}${version}. ${url}${note ? `. ${note}.` : ""}`;
  const key = `${inv.accession.toLowerCase().replace(/[^a-z0-9]/g, "")}${year ? "_" + year : ""}`;
  const fields: [string, string][] = [
    ["title", `{${tex(title)}}`],
    ...(authors.length ? [["author", authors.map(tex).join(" and ")] as [string, string]] : []),
    ...(year ? [["year", year] as [string, string]] : []),
    ["publisher", "NASA Physical Sciences Informatics (PSI)"],
    ...(inv.doi ? [["doi", inv.doi] as [string, string]] : []),
    ["url", url],
    ...(inv.psi_version != null ? [["version", String(inv.psi_version)] as [string, string]] : []),
    ["note", tex(`${inv.accession}${note ? ". " + note : ""}`)],
  ];
  const bibtex = `@misc{${key},\n${fields.map(([k, v]) => `  ${k.padEnd(9)} = {${v}}`).join(",\n")}\n}`;
  return { text, bibtex, key, authors, year };
}
