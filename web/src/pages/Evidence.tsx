import { Readings, Tile } from "../dash/widgets";
import { useMemo, useState } from "react";
import { href } from "../app/router";
import { fmtBytes, fmtInt, useData } from "../lib/data";
import { KlassBadge } from "../lib/klass";
import type { BriefsDoc, CuratorDoc, CuratorFinding, Investigation, InvestigationsDoc, ProfilesDoc, RankDoc, RankFacets, TableDoc, TableProfile, TableSummary } from "../lib/types";
import { SourceBtn } from "../components/Source";
import { useReceipt } from "../components/Receipt";
import { IconArrow, IconWarn } from "../components/icons";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/evidence");

export const FAMILY: Record<string, string> = {
  CIR_ACME: "Combustion Integrated Rack, gas-flame insert (ACME)",
  CIR_MDCA: "Combustion Integrated Rack, droplet apparatus",
  MSG: "Microgravity Science Glovebox",
  CYGNUS: "Cygnus cargo vehicle (Saffire)",
  AEROSOL: "Smoke and aerosol instruments",
  GROUND: "Ground laboratory or modelling",
  OTHER: "Hardware not stated in PSI",
};
const MISSING = new Set(["", "-", "–", "—", "n/a"]);
const accNo = (a: string) => Number(a.split("-")[1] ?? 0);
const tests = (i: Investigation) => i.tables.reduce((s, t) => s + (t.rows ?? 0), 0);

export function Gravity({ g, platform }: { g: Investigation["gravity"]; platform?: string }) {
  const label = g === "micro" ? "Flight, free fall" : g === "ground" ? "Ground, 1 g" : "Not stated";
  return (
    <span className="greg">
      <span className={`gdot gdot--${g}`} aria-hidden="true" />
      <span>{label}{platform && g === "micro" && !/international space station/i.test(platform) ? `, ${platform}` : ""}</span>
    </span>
  );
}

export function FindingRow({ f, link }: { f: CuratorFinding; link?: boolean }) {
  return (
    <div className="finding">
      <span title={f.level === "caution" ? "Caution: this can mislead a reader" : "Note"} style={{ color: "var(--ink-2)", paddingTop: 2 }}>
        {f.level === "caution" ? <IconWarn size={18} /> : <span className="num" style={{ fontSize: 12, color: "var(--ink-3)" }}>note</span>}
      </span>
      <div>
        <p className="finding__what">{f.detail}</p>
        <p className="finding__how">How the site handles it: {f.handling}</p>
        <div className="finding__meta">
          <span className="mono">{f.id}</span>
          {link ? <a href={href(`/evidence/${f.accession}`)}>{f.accession}</a> : <span>{f.accession}</span>}
          {f.column && <span>column "{f.column}"</span>}
          {f.rows && f.rows.length > 0 && <span>rows {f.rows.slice(0, 8).map((r) => r + 1).join(", ")}{(f.n_rows ?? 0) > 8 ? ` and ${(f.n_rows ?? 0) - 8} more` : ""}</span>}
          <span>found by {f.found_by}</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the list */

interface AreaDoc { listed: { name: string; status: string; roses_eligible: string; accession: string | null }[]; listed_n?: number; matched_n?: number; listed_not_in_search?: string[]; search_not_listed?: string[]; drift: { statement: string } }

const PILLAR = ["prevention", "detection", "suppression"] as const;
const FUEL: [string, string][] = [["solid", "Solids"], ["droplet", "Droplets"], ["gas", "Gas flames"], ["smoke", "Smoke"], ["emulator", "Burner as a solid"]];
const STATES: [keyof Omit<RankFacets, "pillars">, string][] = [["oxygen", "Oxygen"], ["pressure", "Pressure"], ["flow", "Air flow"], ["outcome", "Outcome"]];
const flip = (set: Set<string>, v: string) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); return n; };

function Explorer({ doc, findings, briefs, rank, pillar }: { doc: InvestigationsDoc; findings: CuratorFinding[]; briefs: BriefsDoc | null; rank: RankDoc | null; pillar?: string | null }) {
  const area = useData<AreaDoc>("research_area.json");
  const [pillars, setPillars] = useState<Set<string>>(() => new Set(pillar && (PILLAR as readonly string[]).includes(pillar) ? [pillar] : []));     // a link from the controls view arrives with its pillar chosen
  const [fuels, setFuels] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Set<string>>(new Set());
  const feat = useMemo(() => new Map((rank?.items ?? []).map((r) => [r.accession, r])), [rank]);
  const faceted = pillars.size + fuels.size + states.size > 0;
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"in" | "all">("in");
  const [grav, setGrav] = useState<"all" | "micro" | "ground">("all");
  const [fam, setFam] = useState("all");
  const [order, setOrder] = useState<"acc" | "tests" | "data">("acc");
  const nIn = doc.items.filter((i) => i.scope.in_scope).length;
  const fcount = useMemo(() => {
    const m = new Map<string, { n: number; caution: number }>();
    for (const f of findings) {
      const e = m.get(f.accession) ?? { n: 0, caution: 0 };
      e.n++;
      if (f.level === "caution") e.caution++;
      m.set(f.accession, e);
    }
    return m;
  }, [findings]);
  const fams = useMemo(() => Array.from(new Set(doc.items.map((i) => i.hardware_family))).sort(), [doc]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = doc.items.filter((i) =>
      (scope === "all" || i.scope.in_scope) && (grav === "all" || i.gravity === grav) && (fam === "all" || i.hardware_family === fam) &&
      (!faceted || (() => {                       // within a group any choice may match; across groups all must
        const f = feat.get(i.accession);
        if (!f) return false;
        return (pillars.size === 0 || f.facets.pillars.some((p) => pillars.has(p))) && (fuels.size === 0 || fuels.has(f.kind)) &&
          Array.from(states).every((s) => f.facets[s as keyof Omit<RankFacets, "pillars">]);
      })()) &&
      (!needle || [i.accession, i.acronym, i.title, i.sub_research_area, i.hardware, i.objective, i.platform].join(" ").toLowerCase().includes(needle)));
    if (order === "tests") r.sort((a, b) => tests(b) - tests(a));
    else if (order === "data") r.sort((a, b) => b.files.bytes_listed - a.files.bytes_listed);
    else r.sort((a, b) => accNo(a.accession) - accNo(b.accession));
    return r;
  }, [doc, q, scope, grav, fam, order, faceted, feat, pillars, fuels, states]);
  const out = doc.items.filter((i) => !i.scope.in_scope);

  return (
    <div className="stack" style={{ ["--gap" as string]: "22px" }}>
      <h1 className="page-title">Investigations</h1>
      <Readings>
        <Tile label="Combustion records" value={nIn} of={`of ${doc.search_total}`} sub="returned by PSI for &quot;combustion&quot;" />
        <Tile label="Test rows" value={doc.items.filter((i) => i.scope.in_scope).reduce((a, i) => a + i.tables.reduce((b, t) => b + (t.rows ?? 0), 0), 0)} sub="in the experimental tables" />
        <Tile label="Flight experiments" value={doc.items.filter((i) => i.scope.in_scope && i.gravity === "micro").length} sub="taken in free fall" />
        <Tile label="Archive behind them" value={doc.items.filter((i) => i.scope.in_scope).reduce((a, i) => a + (i.files?.bytes_listed ?? 0), 0) / 1e12} decimals={1} unit="TB" sub="listed in PSI, not fetched" tone="flame" />
      </Readings>
      {out.length > 0 && <p className="note" style={{ maxWidth: "88ch" }}>{out.length === 1 ? "One record is" : `${out.length} records are`} set aside ({out.map((i) => i.accession).join(", ")}): the search matched a word, and each is listed with the reason.</p>}
      {briefs && <p className="note" style={{ maxWidth: "88ch" }}>Summaries under each title are AI-written and checked by code against the record's own text and numbers. NASA's words are on each record's page.</p>}
      <div className="toolbar">
        <label className="search">
          <span className="sr">Search the records</span>
          <input type="search" placeholder="Search title, fuel, hardware, purpose" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="seg" role="group" aria-label="Scope">
          <button type="button" aria-pressed={scope === "in"} onClick={() => setScope("in")}>Combustion ({nIn})</button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>All {doc.items.length}</button>
        </div>
        <div className="seg" role="group" aria-label="Where the work was done">
          <button type="button" aria-pressed={grav === "all"} onClick={() => setGrav("all")}>Anywhere</button>
          <button type="button" aria-pressed={grav === "micro"} onClick={() => setGrav("micro")}>Flight</button>
          <button type="button" aria-pressed={grav === "ground"} onClick={() => setGrav("ground")}>Ground</button>
        </div>
        <label><span className="sr">Hardware</span>
          <select className="select" value={fam} onChange={(e) => setFam(e.target.value)}>
            <option value="all">All hardware</option>
            {fams.map((f) => <option key={f} value={f}>{FAMILY[f] ?? f}</option>)}
          </select>
        </label>
        <label><span className="sr">Order</span>
          <select className="select" value={order} onChange={(e) => setOrder(e.target.value as typeof order)}>
            <option value="acc">By record number</option>
            <option value="tests">Most test rows first</option>
            <option value="data">Most data held first</option>
          </select>
        </label>
      </div>
      {rank && (
        <div className="facets" aria-label="Narrow the list">
          <div className="facets__group"><span className="facets__name" title={Object.values(rank.facet_rules.pillars).join(" · ")}>Pillar</span>
            {PILLAR.map((p) => <button key={p} type="button" className="facet" aria-pressed={pillars.has(p)} onClick={() => setPillars(flip(pillars, p))}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div>
          <div className="facets__group"><span className="facets__name">What burns</span>
            {FUEL.map(([k, label]) => <button key={k} type="button" className="facet" aria-pressed={fuels.has(k)} onClick={() => setFuels(flip(fuels, k))}>{label}</button>)}</div>
          <div className="facets__group"><span className="facets__name" title={`Oxygen: ${rank.facet_rules.oxygen}. Pressure: ${rank.facet_rules.pressure}. Air flow: ${rank.facet_rules.flow}. Outcome: ${rank.facet_rules.outcome}.`}>Its table states</span>
            {STATES.map(([k, label]) => <button key={k} type="button" className="facet" aria-pressed={states.has(k)} onClick={() => setStates(flip(states, k))}>{label}</button>)}</div>
          <span className="note facets__count" role="status">{rows.length} of {scope === "all" ? doc.items.length : nIn} shown{faceted && <> · <button type="button" className="linklike" onClick={() => { setPillars(new Set()); setFuels(new Set()); setStates(new Set()); }}>clear</button></>}</span>
          <details className="brief__how facets__how">
            <summary>How a record gets these marks</summary>
            <p className="note" style={{ margin: "6px 0 0" }}>
              These are this project's sorting rules, applied by code to NASA's own text and tables; they are not NASA's categories.
              {PILLAR.map((p) => <span key={p}> <b>{p[0].toUpperCase() + p.slice(1)}</b>: {rank.facet_rules.pillars[p]}.</span>)}
              {" "}<b>What burns</b> is the fuel form in the record's table.
              {STATES.map(([k, label]) => <span key={k}> <b>{label}</b>: {rank.facet_rules[k as keyof Omit<RankFacets, "pillars">]}.</span>)}
              {" "}A record with no mark under Pillar matched none of the three rules; it is still in the list.
            </p>
          </details>
        </div>
      )}

      <div>
        <div className="rec rec--head">
          <span>Record</span><span>Investigation</span><span className="hide-s">Topic</span><span className="hide-s">Where</span>
          <span className="r">Test rows</span><span className="r hide-s">Files in PSI</span><span className="r hide-s">Notes</span>
        </div>
        <div className="rec-list">
          {rows.map((i) => {
            const fc = fcount.get(i.accession);
            const n = tests(i);
            return (
              <a key={i.accession} className={`rec ${i.scope.in_scope ? "" : "rec--out"}`} href={href(`/evidence/${i.accession}`)}>
                <span className="rec__acc">{i.accession}</span>
                <span>
                  <span className="rec__title">{i.acronym ? `${i.acronym}: ` : ""}{i.title}</span>
                  {!i.scope.in_scope && <span className="rec__sub" style={{ display: "block" }}>Set aside: {i.scope.reason}.</span>}
                  {briefs?.items[i.accession] && <span className="rec__brief" title="AI-written summary, checked by code against the record">{briefs.items[i.accession].what}</span>}
                </span>
                <span className="hide-s rec__sub">{i.sub_research_area || "not stated"}</span>
                <span className="hide-s rec__sub"><Gravity g={i.gravity} platform={i.platform} /></span>
                <span className="r num">{n ? fmtInt(n) : <span title="The record has no experimental table" style={{ color: "var(--ink-3)" }}>none</span>}</span>
                <span className="r num hide-s rec__sub">{i.files.count ? `${fmtInt(i.files.count)} · ${fmtBytes(i.files.bytes_listed)}` : "table only"}</span>
                <span className="r hide-s">{fc ? <span className={`tag ${fc.caution ? "tag--caution" : ""}`}>{fc.caution > 0 && <IconWarn size={12} />}{fc.n}</span> : ""}</span>
              </a>
            );
          })}
          {rows.length === 0 && <div className="empty" style={{ marginTop: 16 }}><p className="empty__title">No record matches</p><p style={{ marginTop: 6 }}>Clear the search or widen the filters.</p></div>}
        </div>
      </div>
      {area.data && area.data.listed_n != null && (
        <p className="note" style={{ maxWidth: "96ch" }}>
          Cross-check: NASA's own "investigations by research area" page lists {area.data.listed_n} combustion investigations, and {area.data.matched_n} of them are among these records
          {(area.data.listed_not_in_search ?? []).length > 0 ? ` (missing from the search: ${area.data.listed_not_in_search!.join(", ")})` : ""}.
          {(area.data.search_not_listed ?? []).length > 0 ? ` ${area.data.search_not_listed!.length} records come back from the search but are not on that page: ${area.data.search_not_listed!.join(", ")}.` : ""} {area.data.drift.statement}
        </p>
      )}
      <p className="note">
        <KlassBadge k="observed" note="PSI metadata and tables, fetched from NASA" /> Test rows are counted as rows after the header with at least one filled cell.
        "Files in PSI" is the record's own file list; the site downloads the experimental tables and a few named summaries, not the raw video. Colour marks the gravity regime only.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ one record */

function Doc({ label, text, inv, field }: { label: string; text: string; inv: Investigation; field: string }) {
  const [all, setAll] = useState(false);
  if (!text.trim()) return null;
  const long = text.length > 720;
  const shown = long && !all ? text.slice(0, 640).replace(/\s+\S*$/, "") + " …" : text;
  const ref = inv.refs[field];
  return (
    <div>
      <div className="doc__label">
        <span>{label}, in NASA's words</span>
        {ref && <SourceBtn title={`${inv.accession}: ${label.toLowerCase()}`} sref={ref} />}
      </div>
      <p className="doc">{shown}</p>
      {long && <button type="button" className="linkish" style={{ marginTop: 6, fontSize: 13 }} onClick={() => setAll(!all)}>{all ? "Show less" : "Read all"}</button>}
    </div>
  );
}

function colSummary(c: TableProfile["columns"][number]): string {
  if (c.kind === "number" || c.kind === "quantity") {
    const u = c.units && c.units.length ? " " + c.units.join(" or ") : "";
    return `${c.min} to ${c.max}${u}, ${c.distinct} distinct values`;
  }
  const top = c.top.slice(0, 4).map(([v, n]) => `${v} (${n})`).join("; ");
  return `${c.distinct} distinct: ${top}${c.distinct > 4 ? "; …" : ""}`;
}

function WhatVaried({ p }: { p: TableProfile }) {
  const varied = p.columns.filter((c) => c.role === "varied");
  const constant = p.columns.filter((c) => c.role === "constant" || c.role === "constant_where_given");
  const set = p.columns.filter((c) => c.role === "identifier" || c.role === "when" || c.role === "notes");
  return (
    <div className="grid cols-2" style={{ ["--gap" as string]: "28px", alignItems: "start" }}>
      <div>
        <h4 className="h3">Varied between tests ({varied.length})</h4>
        {varied.length === 0 ? <p className="note" style={{ marginTop: 8 }}>No column changes from row to row.</p> : (
          <div className="varied" style={{ marginTop: 6 }}>
            {varied.map((c) => (
              <div key={c.name} style={{ display: "contents" }}>
                <div className="varied__name">{c.name}</div>
                <div className="varied__val">
                  <span className="meter" title={`${c.filled} of ${p.n_rows} rows filled`}><i style={{ width: `${(100 * c.filled) / Math.max(p.n_rows, 1)}%` }} /></span>
                  {colSummary(c)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h4 className="h3">Held constant ({constant.length})</h4>
        {constant.length === 0 ? <p className="note" style={{ marginTop: 8 }}>No column holds one value in every row.</p> : (
          <div className="varied" style={{ marginTop: 6 }}>
            {constant.map((c) => (
              <div key={c.name} style={{ display: "contents" }}>
                <div className="varied__name">{c.name}</div>
                <div className="varied__val">{c.top[0]?.[0]}{c.role === "constant_where_given" ? ` (given in ${c.filled} of ${p.n_rows} rows)` : ""}</div>
              </div>
            ))}
          </div>
        )}
        {set.length > 0 && <p className="note" style={{ marginTop: 12 }}>Set aside as identifiers, dates or notes: {set.map((c) => c.name).join(", ")}.</p>}
      </div>
    </div>
  );
}

function TableView({ t, inv, findings }: { t: TableSummary; inv: Investigation; findings: CuratorFinding[] }) {
  const doc = useData<TableDoc>(t.artifact ?? null);
  const [all, setAll] = useState(false);
  const open = useReceipt();
  const flags = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of findings) {
      if (f.table !== t.artifact || !f.column || !f.rows) continue;
      for (const r of f.rows) m.set(`${r}|${f.column}`, `${f.id}: ${f.detail}`);
    }
    return m;
  }, [findings, t.artifact]);
  if (!t.artifact) return <p className="note">{t.file}: {t.note ?? "not parsed"}.</p>;
  if (doc.error) return <p className="note">Could not load this table: {doc.error}</p>;
  if (!doc.data) return <p className="note">Loading the table…</p>;
  const d = doc.data;
  const cols = d.columns.map((c) => c.replace(/\s+/g, " ").trim());
  const rows = all ? d.rows : d.rows.slice(0, 12);
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="note">{d.file} · {fmtInt(d.n_rows)} rows, {d.n_cols} columns{d.encoding !== "utf-8" ? `, ${d.encoding}` : ""}</span>
        <SourceBtn title={d.file} sref={{ ledger_seq: d.ledger_seq, sha256: d.sha256, url: d.url, accession: inv.accession, file_name: d.file }} label="file receipt"
                   extra={[["rows counted", d.count_rule]]} />
      </div>
      <div className="scroll-y">
        <table className="datatable">
          <thead><tr><th>row</th>{cols.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="rowno">
                  <button type="button" className="linkish" title="Receipt for this row" onClick={() => open({
                    title: `${inv.accession}, row ${i + 1}`, klass: "observed",
                    rows: [["PSI record", inv.accession], ["file", d.file], ["row", `${i + 1} (counting data rows from 1)`],
                      ...cols.map((c, j) => [c, r[j] || "(empty)"] as [string, React.ReactNode]),
                      ["fetched from", <a href={d.url} target="_blank" rel="noreferrer">{d.url}</a>], ["SHA-256 of the file", <span className="hash">{d.sha256}</span>], ["ledger entry", `number ${d.ledger_seq}`]],
                  })}>{i + 1}</button>
                </td>
                {cols.map((c, j) => {
                  const v = r[j] ?? "";
                  const flag = flags.get(`${i}|${c}`);
                  return <td key={j} className={`${MISSING.has(v.trim()) ? "miss" : ""} ${flag ? "flag" : ""}`} title={flag}>{v || "·"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.rows.length > 12 && <button type="button" className="btn btn--quiet btn--sm" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>{all ? "Show the first 12 rows" : `Show all ${fmtInt(d.n_rows)} rows`}</button>}
      <p className="note" style={{ marginTop: 8 }}>Cells are shown exactly as NASA wrote them. An underlined cell has a curator note; hover to read it. Click a row number for its receipt.</p>
    </div>
  );
}

function Card({ inv, findings, profiles, brief }: { inv: Investigation; findings: CuratorFinding[]; profiles: ProfilesDoc | null; brief: BriefsDoc | null }) {
  const mineBrief = brief?.items[inv.accession];
  const mine = findings.filter((f) => f.accession === inv.accession || f.also?.includes(inv.accession));
  const folders = Object.entries(inv.files.by_folder).sort((a, b) => b[1].bytes - a[1].bytes);
  const [pubsAll, setPubsAll] = useState(false);
  const pubs = pubsAll ? inv.publications : inv.publications.slice(0, 6);
  const n = tests(inv);
  return (
    <div className="stack" style={{ ["--gap" as string]: "26px" }}>
      <a className="back" href={href("/evidence")}><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><IconArrow size={14} /></span>All investigations</a>
      <header className="stack" style={{ ["--gap" as string]: "10px" }}>
        <div className="row" style={{ ["--gap" as string]: "12px" }}>
          <span className="tag mono">{inv.accession}</span>
          <Gravity g={inv.gravity} platform={inv.platform} />
          {!inv.scope.in_scope && <span className="tag tag--caution"><IconWarn size={12} />Set aside: not combustion science</span>}
        </div>
        <h1 className="claim claim--l">{inv.title}</h1>
        {inv.acronym && <p className="note" style={{ fontSize: 14 }}>{inv.acronym}{inv.sub_research_area ? ` · ${inv.sub_research_area}` : ""}</p>}
      </header>

      {mineBrief && brief && (
        <section className="brief" aria-label="Summary">
          <div className="brief__head"><span className="ev__tag">Summary</span><span className="note">AI-written, checked by code against this record · NASA's words follow below</span></div>
          <p className="brief__what">{mineBrief.what}</p>
          <p className="brief__why">{mineBrief.why}</p>
          <details className="brief__how"><summary>How it was written and checked</summary>
            <p>{brief.how}</p><p>Written by {brief.written_by}, {brief.when}. {brief.dropped.length === 0 ? "No brief was dropped in this build." : `${brief.dropped.length} briefs were dropped in this build.`}</p></details>
        </section>
      )}

      <section className="panel" data-klass="observed">
        <div className="grid cols-2" style={{ ["--gap" as string]: "10px 36px" }}>
          <dl className="kv">
            <dt>Where</dt><dd>{inv.platform || (inv.gravity === "ground" ? "Ground investigation" : "not stated")}</dd>
            <dt>Hardware</dt><dd>{inv.hardware || "not stated in PSI"}</dd>
            <dt>Group</dt><dd>{FAMILY[inv.hardware_family]} <span className="note" title={inv.derivations.hardware_family}>(grouped by a rule on the hardware name)</span></dd>
            <dt>Dates in PSI</dt><dd>{inv.start ?? "not stated"} to {inv.end ?? "not stated"}</dd>
            <dt>NASA centre</dt><dd>{inv.center || "not stated"}</dd>
          </dl>
          <dl className="kv">
            <dt>Test rows</dt><dd className="num">{n ? fmtInt(n) : "no experimental table"}</dd>
            <dt>Files in PSI</dt><dd className="num">{inv.files.count ? `${fmtInt(inv.files.count)} files, ${fmtBytes(inv.files.bytes_listed)}` : "none listed beyond the table"}</dd>
            <dt>DOI</dt><dd>{inv.doi ? <a href={`https://doi.org/${inv.doi}`} target="_blank" rel="noreferrer">{inv.doi}</a> : "none"}</dd>
            <dt>Licence</dt><dd>{inv.license ?? "not stated"}</dd>
            <dt>Record version</dt><dd>{inv.psi_version ?? "not stated"}{inv.version_reason ? ` (${inv.version_reason})` : ""}</dd>
          </dl>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <KlassBadge k="observed" note="PSI metadata record" />
          {inv.refs.title && <SourceBtn title={`${inv.accession}: metadata record`} sref={{ ...inv.refs.title, field: undefined }} label="record receipt" />}
          <a className="src-btn" href={inv.psi_url} target="_blank" rel="noreferrer">Open in PSI</a>
        </div>
        {!inv.scope.in_scope && <p className="note" style={{ marginTop: 12 }}>Why it is set aside: {inv.scope.reason}. The combustion search still returns it, so it is listed and not hidden.</p>}
      </section>

      <section className="stack" style={{ ["--gap" as string]: "20px" }}>
        <Doc label="Objective" text={inv.objective} inv={inv} field="objective" />
        <Doc label="Hypothesis" text={inv.hypothesis} inv={inv} field="hypothesis" />
        <Doc label="Approach" text={inv.approach} inv={inv} field="approach" />
        <Doc label="Why it matters" text={inv.impacts} inv={inv} field="impacts" />
      </section>

      {inv.tables.map((t) => {
        const prof = t.artifact && profiles ? profiles.items[t.artifact] : null;
        return (
          <section key={t.file} className="stack" style={{ ["--gap" as string]: "16px" }}>
            <div className="section__head" style={{ marginBottom: 0 }}>
              <h2 className="h2">What varied, what stayed constant</h2>
              <KlassBadge k="derived" note="computed from the table below" />
            </div>
            <p className="note">{t.file}</p>
            {prof ? <WhatVaried p={prof} /> : <p className="note">No profile for this table.</p>}
            <h3 className="h3" style={{ marginTop: 8 }}>The table as NASA wrote it</h3>
            <TableView t={t} inv={inv} findings={mine} />
          </section>
        );
      })}
      {inv.tables.length === 0 && (
        <section className="empty"><p className="empty__title">This record has no experimental table</p>
          <p style={{ marginTop: 6 }}>PSI holds {inv.files.count ? `${fmtInt(inv.files.count)} files for it` : "no file list for it"}. Nothing is shown in place of a table.</p></section>
      )}

      {mine.length > 0 && (
        <section>
          <div className="section__head"><h2 className="h2">Curator notes on this record ({mine.length})</h2><KlassBadge k="derived" note="found by stated rules; nothing was corrected" /></div>
          <div className="panel panel--tight">{mine.map((f) => <FindingRow key={f.id} f={f} />)}</div>
        </section>
      )}

      <section className="grid cols-2" style={{ ["--gap" as string]: "28px", alignItems: "start" }}>
        <div>
          <h2 className="h2">What PSI holds</h2>
          {folders.length === 0 ? <p className="note" style={{ marginTop: 8 }}>The record lists no files beyond its experimental table.</p> : (
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Folder</th><th className="r">Files</th><th className="r">Size</th><th>Types</th></tr></thead>
                <tbody>{folders.map(([name, f]) => (
                  <tr key={name}><td>{name}</td><td className="r num">{fmtInt(f.count)}</td><td className="r num">{fmtBytes(f.bytes)}</td>
                    <td className="note">{Object.entries(f.extensions).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([e, k]) => `${e} ${k}`).join(", ")}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {inv.core_files && inv.core_files.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="note">Summary files fetched for this site, each with a receipt:</p>
              <ul style={{ marginTop: 6 }}>{inv.core_files.map((c) => (
                <li key={c.file} className="row" style={{ ["--gap" as string]: "8px", fontSize: 13, padding: "3px 0" }}>
                  <span style={{ overflowWrap: "anywhere" }}>{c.file}</span><span className="note num">{fmtBytes(c.bytes)}</span>
                  <SourceBtn title={c.file} sref={c} label="receipt" />
                </li>))}</ul>
            </div>
          )}
        </div>
        <div>
          <h2 className="h2">People</h2>
          <ul style={{ marginTop: 8, fontSize: 14 }}>{inv.people.map((p, k) => <li key={k} style={{ padding: "3px 0" }}>{p.name}{p.role ? <span className="note"> · {p.role}</span> : null}</li>)}</ul>
          {inv.people.length === 0 && <p className="note" style={{ marginTop: 8 }}>None listed.</p>}
        </div>
      </section>

      <section>
        <div className="section__head"><h2 className="h2">Publications listed in PSI ({inv.publications.length})</h2>
          {inv.refs.publications && <SourceBtn title={`${inv.accession}: publications`} sref={inv.refs.publications} />}</div>
        {inv.publications.length === 0 ? <p className="note">None listed.</p> : (
          <ol style={{ paddingLeft: 20, listStyle: "decimal" }}>
            {pubs.map((p, k) => (
              <li key={k} style={{ padding: "5px 0", maxWidth: "90ch" }}>
                <span className="claim" style={{ fontSize: "1.02rem", fontWeight: 400 }}>{p.title}</span>
                <span className="note"> {p.authors}{p.doi ? <> · <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">{p.doi}</a></> : null}</span>
              </li>
            ))}
          </ol>
        )}
        {inv.publications.length > 6 && <button type="button" className="btn btn--quiet btn--sm" style={{ marginTop: 8 }} onClick={() => setPubsAll(!pubsAll)}>{pubsAll ? "Show fewer" : `Show all ${inv.publications.length}`}</button>}
      </section>
    </div>
  );
}

export function Evidence({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const inv = useData<InvestigationsDoc>(ready ? "investigations.json" : null);
  const cur = useData<CuratorDoc>(ready ? "curator_report.json" : null);
  const prof = useData<ProfilesDoc>(ready && route.segs[1] ? "profiles.json" : null);
  const briefs = useData<BriefsDoc>(ready ? "briefs.json" : null);
  const rank = useData<RankDoc>(ready ? "rank_features.json" : null);
  if (!ready) return <Waiting route={route} manifest={manifest} />;
  if (inv.error) return <div className="empty"><p className="empty__title">The investigations could not be loaded</p><p style={{ marginTop: 6 }}>{inv.error}</p></div>;
  if (!inv.data) return <p className="note">Loading the records fetched from NASA…</p>;
  const findings = cur.data?.items ?? [];
  const acc = route.segs[1];
  if (acc) {
    const one = inv.data.items.find((i) => i.accession.toLowerCase() === acc.toLowerCase());
    if (!one) return <div className="empty"><p className="empty__title">No record {acc} in the combustion search</p><p style={{ marginTop: 6 }}><a href={href("/evidence")}>See all investigations</a></p></div>;
    return <Card key={one.accession} inv={one} findings={findings} profiles={prof.data} brief={briefs.data} />;
  }
  return <Explorer doc={inv.data} findings={findings} briefs={briefs.data} rank={rank.data} pillar={route.query.get("pillar")} />;
}
