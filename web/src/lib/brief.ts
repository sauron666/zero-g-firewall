import type { Manifest } from "./data";
import type { Ranked, Stability } from "./rank";
import type { GapsDoc, RankDoc, RankLens } from "./types";

const SITE = "https://sauron666.github.io/zero-g-firewall/";
const pct = (x: number) => `${Math.round(100 * x)}%`;
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);          // "Data held in PSI" keeps its PSI

/**
 * A brief for the designer of one mission, as Markdown: what to read first and why, what has not been measured,
 * how the order was made, and where every number comes from. Assembled by code from the site's data files;
 * no sentence in it is written by a language model.
 */
export function missionBrief(o: { doc: RankDoc; lens: RankLens; weights: Record<string, number>; ranked: Ranked[]; stab: Map<string, Stability> | null; draws: number; gaps: GapsDoc | null; manifest: Manifest | null; changed: boolean }): string {
  const { doc, lens, ranked, stab, gaps, manifest } = o;
  const nasa = manifest?.nasa;
  const total = Object.values(o.weights).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const L: string[] = [];
  L.push(`# Fire-safety evidence brief: ${lens.name.toLowerCase()}`, "");
  L.push(`${lens.about} Atmosphere${lens.atmospheres.length > 1 ? "s" : ""} looked for: ${lens.atmospheres.map((a) => `${a[0]} (${a[2].toFixed(1)} kPa)`).join(" or ")}.`, "");
  L.push(`Source: NASA Physical Sciences Informatics (PSI), combustion records${nasa ? `, fetched ${nasa.synced_at_utc}` : ""}. Site: ${SITE}`, "");
  L.push("## Read these first", "");
  ranked.slice(0, 5).forEach((r) => {
    const s = stab?.get(r.item.accession);
    const best = [...r.parts].filter((p) => p.contribution > 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3);
    const none = r.parts.filter((p) => p.score === 0).map((p) => lc(p.label));
    L.push(`${r.rank}. **${r.item.acronym || r.item.accession}** (${r.item.accession}): ${r.item.title}. Score ${(100 * r.total).toFixed(0)} of 100${s ? `; in the top five in ${pct(s.top)} of ${o.draws} changes of the weights` : ""}.`);
    best.forEach((p) => L.push(`   - ${p.label} (${p.score.toFixed(2)}): ${p.why}`));
    if (none.length) L.push(`   - Not covered: ${none.join("; ")}.`);
    L.push(`   - Record and table: ${SITE}#evidence--${r.item.accession}`);
  });
  L.push("");
  if (gaps) {
    L.push("## What has not been measured", "");
    gaps.items.forEach((g) => L.push(`- ${g.title}: ${g.measure} ${g.unit}.${g.plans.length ? ` Planned or flown to fill it: ${g.plans.map((p) => p.name).join("; ")}.` : ""}`));
    if (gaps.coverage) {
      const c = gaps.coverage;
      L.push(`- Oxygen stated by the test rows: ${c.kinds.filter((k) => k.rows).map((k) => `${k.label.toLowerCase()} ${(100 * (k.min as number)).toFixed(1)}% to ${(100 * (k.max as number)).toFixed(1)}% (${k.rows} rows)`).join("; ")}.`);
    }
    L.push("");
  }
  L.push("## How the order was made", "");
  L.push(`A weighted sum of ${doc.factors.length} stated factors, each computed from NASA's tables and records. ${doc.note}`, "");
  L.push(`Weights${o.changed ? " (changed by the reader)" : " (the site's defaults for this mission)"}: ${doc.factors.map((f) => `${lc(f.label)} ${pct(Math.max(0, o.weights[f.id] ?? 0) / total)}`).join(", ")}.`, "");
  doc.factors.forEach((f) => L.push(`- ${f.label}: ${f.rule}`));
  L.push("");
  L.push("## Limits", "");
  if (lens.gravity === "partial") L.push("- No record was taken in the gravity of this mission. Free-fall data bound it from one side and 1 g data from the other.");
  L.push("- A score orders reading. It is not a probability and not a safety rating.");
  L.push("- A missing value in NASA's tables stays missing; nothing was filled in.", "");
  L.push("## Provenance", "");
  if (nasa) L.push(`- ${nasa.files_in_ledger.toLocaleString("en-US")} files fetched from NASA are in a hash-chained ledger. Ledger head: \`${nasa.ledger_head}\`.`);
  const art = manifest?.artifacts["rank_features.json"];
  if (art) L.push(`- Ranking data file: rank_features.json, SHA-256 \`${art.sha256}\`.`);
  L.push(`- Verify in a browser: ${SITE}#ledger`);
  L.push("- This brief was assembled by code from those files. Independent project, not endorsed by NASA.", "");
  return L.join("\n");
}
