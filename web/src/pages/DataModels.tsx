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
  const [level, setLevel] = useState<"caution" | "all">("caution");
  const [rule, setRule] = useState("all");
  const [scopeAll, setScopeAll] = useState(false);
  const items = useMemo(() => (cur.data?.items ?? []).filter((f) => (level === "all" || f.level === "caution") && (rule === "all" || f.rule === rule) && (scopeAll || f.in_scope)), [cur.data, level, rule, scopeAll]);
  if (!ready) return <Waiting route={route} manifest={manifest} />;
  const all = cur.data?.items ?? [];
  const rules = Array.from(new Set(all.map((f) => f.rule)));
  const nCaution = all.filter((f) => f.level === "caution" && f.in_scope).length;
  const arts = Object.entries(manifest?.artifacts ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
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
