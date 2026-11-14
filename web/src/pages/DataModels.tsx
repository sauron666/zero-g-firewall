import { useMemo, useState } from "react";
import { fmtBytes, fmtInt, useData } from "../lib/data";
import { KLASS, Klass, KlassBadge } from "../lib/klass";
import type { CuratorDoc } from "../lib/types";
import { ValidationPanel } from "../components/ValidationPanel";
import { FindingRow } from "./Evidence";
import { PageProps, stub } from "./stubs";

const Waiting = stub("/data");
const RULE: Record<string, string> = {
  tad_pressure_convention: "Flame temperature column computed at a different pressure than the test",
  fill_series: "Spreadsheet fill series inside a text column",
  spreadsheet_error: "Spreadsheet error values exported as data",
  percent_over_100: "Percentage above 100",
  swapped_columns: "Two columns swapped between related tables",
  same_dates_in_two_records: "Two records with identical dates",
  zero_pressure: "Pressure of zero",
  composition_closure: "Subscripts lost from composition headers",
  header_symbol_lost: "Symbol lost from a header",
  unit_in_header: "Unit in a header does not fit the quantity",
  header_typo: "Typing errors",
  spelling_variants: "One value written in several ways",
  dash_as_missing: "A dash used for 'no value'",
  negative_concentration: "Negative concentrations",
  empty_lines: "Empty lines after the data",
  encoding: "Text encoding other than UTF-8",
  dates_missing: "Dates missing from a record",
  hardware_missing: "Hardware missing from a record",
  near_duplicate_tables: "Two nearly identical tables in one record",
};

export function DataModels({ route, manifest }: PageProps) {
  const ready = !!manifest?.nasa;
  const cur = useData<CuratorDoc>(ready ? "curator_report.json" : null);
  const ex = useData<{ files: { file: string; record: string; source: string; rows: number; columns: number }[]; long_rows: number; condition_rows: number; dictionary_rows: number }>(ready ? "exports/index.json" : null);
  const [level, setLevel] = useState<"caution" | "all">("caution");
  const [rule, setRule] = useState("all");
  const [scopeAll, setScopeAll] = useState(false);
  const items = useMemo(() => (cur.data?.items ?? []).filter((f) => (level === "all" || f.level === "caution") && (rule === "all" || f.rule === rule) && (scopeAll || f.in_scope)), [cur.data, level, rule, scopeAll]);
  if (!ready) return <Waiting route={route} manifest={manifest} />;
  const all = cur.data?.items ?? [];
  const rules = Array.from(new Set(all.map((f) => f.rule)));
  const nCaution = all.filter((f) => f.level === "caution" && f.in_scope).length;
  const arts = Object.entries(manifest?.artifacts ?? {}).filter(([n]) => !n.startsWith("exports/")).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="stack" style={{ ["--gap" as string]: "26px" }}>
      <h1 className="page-title">Data and models</h1>
      <p className="lede">
        Reading every table row by rule turned up {all.filter((f) => f.in_scope).length} things a user of this data should know, {nCaution} of them able to mislead.
        None was corrected here: each is reported with the rows it rests on, so NASA's curators can check it.
      </p>

      <section>
        <div className="section__head"><h2 className="h2">Report for the PSI curators</h2><KlassBadge k="derived" note="found by stated rules, re-run at every build" /></div>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="seg" role="group" aria-label="Level">
            <button type="button" aria-pressed={level === "caution"} onClick={() => setLevel("caution")}>Can mislead ({nCaution})</button>
            <button type="button" aria-pressed={level === "all"} onClick={() => setLevel("all")}>Everything ({all.filter((f) => f.in_scope).length})</button>
          </div>
          <label><span className="sr">Kind of finding</span>
            <select className="select" style={{ maxWidth: 360 }} value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="all">All kinds of finding</option>
              {rules.map((r) => <option key={r} value={r}>{RULE[r] ?? r} ({cur.data?.by_rule[r]})</option>)}
            </select></label>
          <label className="row" style={{ ["--gap" as string]: "8px", fontSize: 13 }}><input type="checkbox" checked={scopeAll} onChange={(e) => setScopeAll(e.target.checked)} />Include records set aside</label>
          <a className="src-btn" href="./data/v1/curator_report.json" target="_blank" rel="noreferrer">Open as JSON</a>
        </div>
        {cur.error && <p className="note">The report could not be loaded: {cur.error}</p>}
        <div className="panel panel--tight">
          {items.map((f) => <FindingRow key={f.id} f={f} link />)}
          {items.length === 0 && <p className="note">Nothing matches these filters.</p>}
        </div>
      </section>

      <section id="downloads">
        <div className="section__head"><h2 className="h2">Downloads: tidy tables with a data dictionary</h2><KlassBadge k="observed" note="NASA's cells, renamed columns, nothing corrected" /></div>
        <p className="note" style={{ maxWidth: "92ch", marginBottom: 10 }}>
          One CSV per experimental table, one row per test, with oxygen as a mole fraction and pressure in kPa where the table states them, and the NASA file's hash and ledger entry on every row.
          Ready for a notebook or a model. Pressure stays empty where NASA's table gives none.
        </p>
        <div className="row" style={{ ["--gap" as string]: "8px", marginBottom: 12 }}>
          <a className="btn btn--primary btn--sm" href="./data/v1/exports/test_conditions.csv" target="_blank" rel="noreferrer">Conditions of every test with oxygen{ex.data ? ` (${fmtInt(ex.data.condition_rows)} rows)` : ""}</a>
          <a className="btn btn--quiet btn--sm" href="./data/v1/exports/tests_long.csv" target="_blank" rel="noreferrer">Every filled cell, long format{ex.data ? ` (${fmtInt(ex.data.long_rows)} lines)` : ""}</a>
          <a className="btn btn--quiet btn--sm" href="./data/v1/exports/data_dictionary.csv" target="_blank" rel="noreferrer">Data dictionary{ex.data ? ` (${ex.data.dictionary_rows} columns)` : ""}</a>
          <a className="src-btn" href="./data/v1/exports/column_map.json" target="_blank" rel="noreferrer">Column map</a>
          <a className="src-btn" href="./data/v1/exports/README.txt" target="_blank" rel="noreferrer">Read me</a>
        </div>
        {ex.data && (
          <details className="fold">
            <summary>The {ex.data.files.length} tables, one file each</summary>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>Record</th><th>NASA's file</th><th className="r">Tests</th><th className="r">Columns</th><th>CSV</th></tr></thead>
                <tbody>{ex.data.files.map((f) => (
                  <tr key={f.file}><td>{f.record}</td><td className="note" style={{ overflowWrap: "anywhere" }}>{f.source}</td><td className="r num">{fmtInt(f.rows)}</td><td className="r num">{f.columns}</td>
                    <td><a href={`./data/v1/${f.file}`} target="_blank" rel="noreferrer">open</a></td></tr>
                ))}</tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <ValidationPanel />

      <section>
        <div className="section__head"><h2 className="h2">Files this site is built from</h2><span className="note">{arts.length} files · each hash is in manifest.json</span></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>File</th><th>Class</th><th className="r">Size</th><th>SHA-256</th></tr></thead>
            <tbody>{arts.map(([name, a]) => (
              <tr key={name}>
                <td style={{ overflowWrap: "anywhere" }}><a href={`./data/v1/${name}`} target="_blank" rel="noreferrer">{name}</a></td>
                <td className="note">{KLASS[a.klass as Klass]?.label ?? a.klass}</td>
                <td className="r num">{fmtBytes(a.bytes)}</td>
                <td className="hash" title={a.sha256}>{a.sha256.slice(0, 16)}…</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 8 }}>Tables are NASA's cells as text, one file per experimental table. The ledger page checks every file here against its hash, {fmtInt(arts.length)} in all.</p>
      </section>
    </div>
  );
}
