import { useRef, useState } from "react";
import { href } from "../app/router";
import { fmtBytes, fmtInt } from "../lib/data";
import { MARK_WORDS, MODEL_NEEDS, Mark, answer, columnLine, inventoryCsv, markOf, nearestSay, rawByKind, stating } from "../lib/inventory";
import type { InventoryCell, InventoryDoc, InventoryItem, InventoryQuantity } from "../lib/types";
import { useReceipt } from "../components/Receipt";
import { refRows } from "../components/Source";

const nameOf = (it: InventoryItem) => it.acronym || it.accession;
const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Circle: numbers. Square: words. Filled: more than one value in the column. The hue is the record's gravity regime. */
function Glyph({ mark, tone, size = 14 }: { mark: Mark; tone: string; size?: number }) {
  const filled = mark === "numbers" || mark === "words";
  const p = { fill: filled ? tone : "none", stroke: tone, strokeWidth: 1.8 };
  return (
    <svg width={size} height={size} viewBox="-7 -7 14 14" aria-hidden="true">
      {mark === "numbers" || mark === "number" ? <circle r={filled ? 5.4 : 4.5} {...p} /> : <rect x={filled ? -5 : -4.2} y={filled ? -5 : -4.2} width={filled ? 10 : 8.4} height={filled ? 10 : 8.4} rx={1.6} {...p} />}
    </svg>
  );
}

interface Tip { x: number; y: number; title: string; lines: [string, string][] }

/**
 * Records down, quantities across: a mark where the record's table has a column for the quantity.
 * A column head adds the quantity to the question asked above the chart; the answer is counted from the same cells.
 */
export function MeasuredMatrix({ doc }: { doc: InventoryDoc }) {
  const [need, setNeed] = useState<string[]>(MODEL_NEEDS[0].needs);
  const [view, setView] = useState<"chart" | "table">("chart");
  const [tip, setTip] = useState<Tip | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const open = useReceipt();
  const hit = new Set(stating(doc, need).map((it) => it.accession));
  const tone = (it: InventoryItem) => (it.gravity === "micro" ? "var(--g-micro)" : "var(--g-earth)");
  const toggle = (q: string) => setNeed(need.includes(q) ? need.filter((x) => x !== q) : [...need, q]);
  const marked = (g: string) => doc.items.some((it) => (g === "micro" ? it.gravity === "micro" : it.gravity !== "micro") && Object.keys(it.cells).length > 0);    // a hue is explained only if a mark wears it

  const show = (el: HTMLElement, it: InventoryItem, q: InventoryQuantity, cell: InventoryCell) => {
    const b = box.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!b) return;
    const w = Math.min(320, b.width - 8);
    setTip({ x: Math.min(Math.max(r.left - b.left + r.width / 2 - w / 2, 4), Math.max(4, b.width - w - 4)), y: r.bottom - b.top + 6,
      title: `${nameOf(it)} · ${q.label}: ${MARK_WORDS[markOf(cell)]}`, lines: cell.columns.map((c) => [c.name, columnLine(c)]) });
  };
  const receipt = (it: InventoryItem, q: InventoryQuantity, cell: InventoryCell) => {
    const used = it.tables.filter((t) => cell.columns.some((c) => c.table === t.artifact));
    open({
      title: `${nameOf(it)}: ${q.about}`, klass: "derived",
      rows: [
        ["record", <a href={href(`/evidence/${it.accession}`)}>{it.accession}{it.acronym ? ` · ${it.acronym}` : ""}</a>],
        ...cell.columns.map((c): [string, React.ReactNode] => [`column, as written`, <><b>{c.name}</b><br />{columnLine(c)}</>]),
        ["placed by", <>header matches <span className="hash">{q.pattern}</span></>],
        ...used.flatMap((t) => refRows(t)),
      ],
      notes: [doc.rule],
    });
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([inventoryCsv(doc)], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "zgf_what_the_tables_state.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div>
      <div className="inv__asks" role="group" aria-label="A question a model asks">
        {MODEL_NEEDS.map((m) => <button key={m.id} type="button" className="facet" aria-pressed={same(need, m.needs)} onClick={() => setNeed(m.needs)}>{m.ask}</button>)}
        {need.length > 0 && !MODEL_NEEDS.some((m) => same(need, m.needs)) && <button type="button" className="linklike note" onClick={() => setNeed([])}>clear</button>}
      </div>
      <p className="claim inv__answer" role="status">{answer(doc, need)}</p>
      {nearestSay(doc, need) && <p className="note" style={{ marginTop: 6, maxWidth: "88ch" }}>{nearestSay(doc, need)}</p>}
      <div className="row" style={{ justifyContent: "space-between", ["--gap" as string]: "10px", flexWrap: "wrap", marginTop: 6 }}>
        <p className="note">Needs: {need.length ? need.map((q) => doc.quantities.find((x) => x.id === q)?.label).join(" + ") : "nothing chosen"}. Press a column head to add or drop a quantity.</p>
        <div className="seg" role="group" aria-label="Show as">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        </div>
      </div>

      {view === "chart" ? (
        <div className="inv__wrap" ref={box} onMouseLeave={() => setTip(null)}>
          <div className="table-wrap">
            <table className="inv" aria-label="What each record's experimental table states">
              <thead>
                <tr className="inv__groups">
                  <td className="inv__rec" />
                  {doc.groups.map((g) => <th key={g.id} scope="colgroup" colSpan={doc.quantities.filter((q) => q.group === g.id).length}><span>{g.label}</span></th>)}
                </tr>
                <tr>
                  <th className="inv__rec" scope="col">Record</th>
                  {doc.quantities.map((q, k) => (
                    <th key={q.id} scope="col" className={`${need.includes(q.id) ? "inv__sel" : ""} ${k > 0 && doc.quantities[k - 1].group !== q.group ? "inv__gap" : ""}`}>
                      <button type="button" className="inv__head" aria-pressed={need.includes(q.id)} title={`${q.about}. ${doc.totals[q.id].records} records state it.`} onClick={() => toggle(q.id)}><span>{q.label}</span></button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doc.items.map((it) => (
                  <tr key={it.accession} className={need.length > 0 && hit.size > 0 && !hit.has(it.accession) ? "inv__row--dim" : hit.has(it.accession) ? "inv__row--hit" : ""}>
                    <th scope="row" className="inv__rec">
                      <a href={href(`/evidence/${it.accession}`)} title={it.title}><span className="num">{it.accession}</span><b className={it.acronym ? "" : "inv__title"}>{it.acronym || it.title}</b></a>
                    </th>
                    {it.tables.length === 0 || Object.keys(it.cells).length === 0
                      ? <td colSpan={doc.quantities.length} className="inv__none">{it.tables.length === 0 ? "no experimental table in PSI" : `its table has ${it.not_placed} columns that no rule places`}</td>
                      : doc.quantities.map((q, k) => {
                        const cell = it.cells[q.id];
                        return (
                          <td key={q.id} className={`${need.includes(q.id) ? "inv__sel" : need.length ? "inv__off" : ""} ${k > 0 && doc.quantities[k - 1].group !== q.group ? "inv__gap" : ""}`}>
                            {cell && (
                              <button type="button" className="inv__cell" aria-label={`${nameOf(it)}, ${q.label}: ${MARK_WORDS[markOf(cell)]}, ${cell.columns.map((c) => c.name).join("; ")}`}
                                      onMouseEnter={(e) => show(e.currentTarget, it, q, cell)} onFocus={(e) => show(e.currentTarget, it, q, cell)} onBlur={() => setTip(null)} onClick={() => receipt(it, q, cell)}>
                                <Glyph mark={markOf(cell)} tone={tone(it)} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="inv__rec">records that state it</th>
                  {doc.quantities.map((q, k) => <td key={q.id} className={`num ${need.includes(q.id) ? "inv__sel" : ""} ${k > 0 && doc.quantities[k - 1].group !== q.group ? "inv__gap" : ""}`}>{doc.totals[q.id].records}</td>)}
                </tr>
              </tfoot>
            </table>
          </div>
          {tip && (
            <div className="tip" style={{ left: tip.x, top: tip.y, width: Math.min(320, (box.current?.clientWidth ?? 328) - 8) }}>
              <b>{tip.title}</b>
              {tip.lines.map(([k, v], i) => <div key={i} style={{ marginTop: 4 }}><span style={{ color: "var(--ink)" }}>{k}</span><br />{v}</div>)}
              <div style={{ marginTop: 5, color: "var(--ink-3)" }}>Click for the receipt</div>
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap inv__long">
          <table className="table">
            <thead><tr><th>Record</th><th>Quantity</th><th>Column, as written</th><th>What it holds</th></tr></thead>
            <tbody>
              {doc.items.flatMap((it) => doc.quantities.flatMap((q) => (it.cells[q.id]?.columns ?? []).map((c, i) => (
                <tr key={`${it.accession}-${q.id}-${c.table}-${i}`}>
                  <td className="strong"><a href={href(`/evidence/${it.accession}`)}>{it.accession}</a> <span className="note">{it.acronym}</span></td>
                  <td>{q.label}</td><td>{c.name}</td><td className="num">{columnLine(c)}</td>
                </tr>
              ))))}
            </tbody>
          </table>
        </div>
      )}

      <div className="legend" style={{ marginTop: 10 }}>
        {(["numbers", "number", "words", "word"] as Mark[]).map((m) => <span key={m} className="legend__item"><Glyph mark={m} tone="var(--ink-2)" size={13} />{MARK_WORDS[m]}</span>)}
        {marked("micro") && <span className="legend__item"><span className="gdot gdot--micro" aria-hidden="true" />flight, in free fall</span>}
        {marked("ground") && <span className="legend__item"><span className="gdot gdot--earth" aria-hidden="true" />ground</span>}
      </div>
      <p className="note" style={{ marginTop: 8, maxWidth: "96ch" }}>
        {fmtInt(doc.counts.placed)} of {fmtInt(doc.counts.columns)} columns in {doc.counts.tables} tables are placed by their header alone; {doc.counts.set_aside} are dates, identifiers and notes; {doc.counts.not_placed} are named by no rule and listed below.
        A mark says the table has such a column, not that every row fills it. What a table leaves out may still be in the record's raw data.{" "}
        <button type="button" className="src-btn" onClick={save}>Save as CSV</button>
      </p>
      <details className="brief__how" style={{ marginTop: 6 }}>
        <summary>How a column is placed, and the {doc.counts.not_placed} that are not</summary>
        <p className="note">{doc.rule}</p>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="table">
            <thead><tr><th>Quantity</th><th>What it means here</th><th>Header pattern</th></tr></thead>
            <tbody>{doc.quantities.map((q) => <tr key={q.id}><td className="strong">{q.label}</td><td>{q.about}</td><td><span className="hash">{q.pattern}</span></td></tr>)}</tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 10 }}>
          Not placed, as written: {doc.not_placed.map((c, i) => <span key={i}>{i > 0 && " · "}{c.accession} “{c.name}”</span>)}.
        </p>
      </details>
    </div>
  );
}

/** What PSI lists behind each table as raw and analysed files. Counts and sizes are NASA's listing; nothing here was downloaded. */
export function RawHoldings({ doc }: { doc: InventoryDoc }) {
  const kinds = rawByKind(doc);
  const top = Math.max(1, ...kinds.map((k) => k.files));
  const rows = [...doc.items].sort((a, b) => b.files.raw_bytes - a.files.raw_bytes || b.files.raw_files - a.files.raw_files);
  const cols = doc.file_kinds.filter((k) => rows.some((it) => (it.files.raw[k.id]?.files ?? 0) > 0));
  const none = rows.filter((it) => it.files.raw_files === 0);
  const n = (v: number) => (v ? fmtInt(v) : <span style={{ color: "var(--ink-3)" }}>·</span>);
  return (
    <div>
      <div className="inv__kinds" role="img" aria-label={`Raw files listed in PSI by kind: ${kinds.map((k) => `${k.label} ${k.files}`).join(", ")}`}>
        {kinds.map((k) => (
          <div key={k.id} className="inv__kind" title={k.id === "other" ? "Formats no kind names, counted under their own extensions" : `Extensions: ${doc.file_kinds.find((x) => x.id === k.id)?.extensions.join(", ")}`}>
            <span>{k.label}</span>
            <span className="inv__bar" style={{ ["--w" as string]: `${(100 * k.files) / top}%` }} />
            <span className="num">{fmtInt(k.files)}</span>
            <span className="note">{k.records} record{k.records === 1 ? "" : "s"}</span>
          </div>
        ))}
      </div>
      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="table inv__files">
          <thead>
            <tr><th>Record</th><th className="r">Raw files</th><th className="r">Size</th>{cols.map((k) => <th key={k.id} className="r">{k.label}</th>)}<th className="r">Analysed data</th><th className="r">Fetched by this site</th></tr>
          </thead>
          <tbody>
            {rows.filter((it) => it.files.raw_files > 0).map((it) => (
              <tr key={it.accession}>
                <td className="strong"><a href={href(`/evidence/${it.accession}`)}>{it.accession}</a> <span className="note">{it.acronym}</span></td>
                <td className="r num">{fmtInt(it.files.raw_files)}</td><td className="r num">{fmtBytes(it.files.raw_bytes)}</td>
                {cols.map((k) => <td key={k.id} className="r num">{n(it.files.raw[k.id]?.files ?? 0)}</td>)}
                <td className="r num">{n(it.files.analysed_files)}</td><td className="r num">{n(it.in_ledger)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" style={{ marginTop: 8, maxWidth: "96ch" }}>
        {none.length > 0 && <>{none.length} records list no raw data: {none.map((it) => it.accession).join(", ")}. </>}{doc.files_rule}
      </p>
    </div>
  );
}
