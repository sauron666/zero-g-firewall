import { useRef, useState } from "react";
import { href } from "../app/router";
import { fmtBytes, fmtInt } from "../lib/data";
import { scaleLinear } from "d3-scale";
import { useWidth } from "../lib/hooks";
import { MARK_WORDS, MODEL_NEEDS, Mark, WORD_LANES, answer, columnLine, inWordsSay, inventoryCsv, markOf, nearestSay, rawByKind, stack, stating, worded } from "../lib/inventory";
import type { FlowWordsRow, FlowWordsTable, InventoryCell, InventoryDoc, InventoryItem, InventoryQuantity } from "../lib/types";
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

/** Not a column of its own: the thing is said in words inside another column. */
function InWords({ tone, size = 14 }: { tone: string; size?: number }) {
  return <svg width={size} height={size} viewBox="-7 -7 14 14" aria-hidden="true"><circle r={4.6} fill="none" stroke={tone} strokeWidth={1.8} strokeDasharray="2.4 2.2" /></svg>;
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
  const said = new Map(doc.flow_words.tables.map((w) => [w.accession, w]));
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
      {inWordsSay(doc, need) && <p className="note" style={{ marginTop: 4, maxWidth: "88ch", color: "var(--ink)" }}>{inWordsSay(doc, need)} <a href="#words" onClick={(e) => { e.preventDefault(); document.getElementById("words")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>See the words</a></p>}
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
                        const told = q.id === "ending" && !cell ? said.get(it.accession) : undefined;
                        return (
                          <td key={q.id} className={`${need.includes(q.id) ? "inv__sel" : need.length ? "inv__off" : ""} ${k > 0 && doc.quantities[k - 1].group !== q.group ? "inv__gap" : ""}`}>
                            {told && (
                              <button type="button" className="inv__cell" title={`No column for it: the flow columns say in words how ${worded(told).length} of ${told.n_rows} tests ended`}
                                      aria-label={`${nameOf(it)}, ${q.label}: no column, but the flow columns say in words how ${worded(told).length} of ${told.n_rows} tests ended`}
                                      onClick={() => document.getElementById("words")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                                <InWords tone={tone(it)} />
                              </button>
                            )}
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
        {said.size > 0 && <span className="legend__item"><InWords tone="var(--ink-2)" size={13} />no column, said in words inside another</span>}
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

/**
 * One table whose flow columns say, in words, how some tests ended. Each dot is a row of the table at its oxygen level;
 * the lanes follow the words, and the last lane holds the rows whose flow columns say nothing of the kind.
 */
export function FlowWords({ w, rule }: { w: FlowWordsTable; rule: string }) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<{ x: number; y: number; row: FlowWordsRow } | null>(null);
  const open = useReceipt();
  const label = new Map(w.classes.map((c) => [c.id, c.label]));
  const all = [...w.rows.map((x) => x.o2), ...w.silent_o2].filter((v): v is number => v != null);
  const m = { l: 6, r: 14, t: 6, b: 34 };
  const sx = scaleLinear().domain([Math.floor(Math.min(...all)), Math.ceil(Math.max(...all))]).range([m.l + 8, width - m.r]);
  const R = 4.6, STEP = 2 * R + 1.5;
  const lanes = [...WORD_LANES.map((l) => ({ ...l, dots: stack(w.rows.filter((x) => l.classes.includes(x.class)), sx, STEP), quiet: false })),
    { id: "silent", label: "nothing of the kind in the flow columns", classes: [], dots: stack(w.silent_o2.map((o2) => ({ o2 } as FlowWordsRow)), sx, 2 * (R - 1.4) + 1.5), quiet: true }].filter((l) => l.dots.length > 0);
  const room = (l: typeof lanes[number]) => 26 + Math.max(1, ...l.dots.map((d) => d.k + 1)) * STEP + 8;
  const tops: number[] = [];
  let y = m.t;
  for (const l of lanes) { tops.push(y); y += room(l); }
  const H = y + m.b;
  const receipt = (x: FlowWordsRow) => open({
    title: `${w.acronym || w.accession}, test ${x.id}: ${label.get(x.class)}`, klass: "derived",
    rows: [
      ...Object.entries(x.cells).map(([k, v]): [string, React.ReactNode] => [`${k}, as written`, <b>{v}</b>]),
      ["what burned", x.fuel || "not stated"], [w.oxygen_column ?? "oxygen", x.o2 == null ? "not stated" : `${x.o2}`],
      ["marked by", <>the word matched by <span className="hash">{w.classes.find((c) => c.id === x.class)?.pattern}</span></>],
      ...refRows({ ...w, row: x.r }),
    ],
    notes: [rule],
  });
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", ["--gap" as string]: "10px", flexWrap: "wrap" }}>
        <p className="note" style={{ maxWidth: "74ch" }}>Each dot is one row of the table, placed at the oxygen it states at the start. Columns read: {w.flow_columns.map((c) => `“${c}”`).join(" and ")}.</p>
        <div className="seg" role="group" aria-label="Show as">
          <button type="button" aria-pressed={view === "chart"} onClick={() => setView("chart")}>Chart</button>
          <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}>Table</button>
        </div>
      </div>
      {view === "chart" ? (
        <div className="plot" ref={ref} style={{ marginTop: 8 }} onMouseLeave={() => setHover(null)}>
          <svg width={width} height={H} role="group" style={{ display: "block" }}
               aria-label={`${w.acronym} rows by oxygen at the start: ${lanes.map((l) => `${l.dots.length} where ${l.label}`).join("; ")}`}>
            <g className="grid">{sx.ticks(width < 520 ? 5 : 10).map((t) => <line key={t} x1={sx(t)} x2={sx(t)} y1={m.t} y2={H - m.b} />)}</g>
            {lanes.map((l, i) => {
              const base = tops[i] + 26 + R;
              return (
                <g key={l.id}>
                  <text x={m.l} y={tops[i] + 14} className="t-ink"><tspan className="num" fontWeight={700}>{l.dots.length}</tspan><tspan dx={8}>{l.label}</tspan></text>
                  <line x1={m.l} x2={width - m.r} y1={tops[i] + room(l) - 2} y2={tops[i] + room(l) - 2} stroke="var(--hairline)" />
                  {l.dots.map(({ row, k }, j) => l.quiet
                    ? <circle key={j} cx={sx(row.o2!)} cy={base + k * (2 * (R - 1.4) + 1.5)} r={R - 1.4} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} />
                    : <circle key={j} cx={sx(row.o2!)} cy={base + k * STEP} r={hover?.row === row ? R + 1.6 : R} tabIndex={0} role="button" style={{ cursor: "pointer" }}
                              aria-label={`Test ${row.id}, ${row.o2}% oxygen: ${Object.values(row.cells).join("; ")}`}
                              fill={l.id === "zero" ? "var(--surface)" : "var(--g-micro)"} stroke="var(--g-micro)" strokeWidth={l.id === "zero" ? 1.8 : 0}
                              onMouseEnter={() => setHover({ x: sx(row.o2!), y: base + k * STEP, row })} onFocus={() => setHover({ x: sx(row.o2!), y: base + k * STEP, row })} onBlur={() => setHover(null)}
                              onClick={() => receipt(row)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); receipt(row); } }} />)}
                </g>
              );
            })}
            {sx.ticks(width < 520 ? 5 : 10).map((t) => <text key={t} x={sx(t)} y={H - m.b + 16} textAnchor="middle" className="num">{t}</text>)}
            <text x={width - m.r} y={H - 4} textAnchor="end">{w.oxygen_column && width >= 560 ? `oxygen at the start, percent: “${w.oxygen_column}”` : "oxygen at the start, percent"}</text>
          </svg>
          {hover && (
            <div className="tip" style={{ left: Math.min(Math.max(hover.x - 150, 0), Math.max(0, width - 300)), top: hover.y + 12, width: Math.min(300, width) }}>
              <b>Test {hover.row.id} · {hover.row.o2}% oxygen</b>
              <div>{hover.row.fuel}</div>
              {Object.entries(hover.row.cells).map(([k, v]) => <div key={k} style={{ marginTop: 4 }}>{k}: <span style={{ color: "var(--ink)" }}>{v}</span></div>)}
              <div style={{ marginTop: 5, color: "var(--ink-3)" }}>Click for the receipt</div>
            </div>
          )}
        </div>
      ) : (
        <div className="table-wrap inv__long">
          <table className="table">
            <thead><tr><th>Test</th><th>What burned</th><th className="r">Oxygen, %</th>{w.flow_columns.map((c) => <th key={c}>{c}, as written</th>)}<th>By the words</th></tr></thead>
            <tbody>
              {w.rows.map((x) => (
                <tr key={x.r}>
                  <td className="strong">{x.id}</td><td>{x.fuel}</td><td className="r num">{x.o2 ?? ""}</td>
                  {w.flow_columns.map((c) => <td key={c}>{x.cells[c] ?? ""}</td>)}<td>{label.get(x.class)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="legend" style={{ marginTop: 8 }}>
        <span className="legend__item"><span className="gdot gdot--micro" aria-hidden="true" />a word about the flame</span>
        <span className="legend__item"><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="4" fill="var(--surface)" stroke="var(--g-micro)" strokeWidth="1.8" /></svg>a display reads 0, no word</span>
        <span className="legend__item"><svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="3.2" fill="none" stroke="var(--ink-3)" strokeWidth="1.2" /></svg>nothing of the kind</span>
      </div>
      <p className="note" style={{ marginTop: 8, maxWidth: "96ch" }}>{rule} One flight experiment, small samples in a small wind tunnel; the table does not record pressure.</p>
    </div>
  );
}
