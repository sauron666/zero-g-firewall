import { useReceipt } from "./Receipt";
import { IconReceipt } from "./icons";
import type { Klass } from "../lib/klass";
import type { SourceRef } from "../lib/types";

/** Rows of a provenance receipt for a value that came from a file in the ledger. */
export function refRows(r: SourceRef): [string, React.ReactNode][] {
  const rows: [string, React.ReactNode][] = [];
  if (r.accession) rows.push(["PSI record", r.accession]);
  if (r.file_name) rows.push(["file", r.file_name]);
  if (r.field) rows.push(["field of the record", r.field]);
  if (r.column) rows.push(["column, as written", r.column]);
  if (r.row != null) rows.push(["row", `${r.row + 1} (counting data rows from 1)`]);
  if (r.doc_id) rows.push(["document", r.doc_id]);
  if (r.page != null) rows.push(["page", String(r.page)]);
  rows.push(["fetched from", <a href={r.url} target="_blank" rel="noreferrer">{r.url}</a>]);
  rows.push(["SHA-256 of the file", <span className="hash">{r.sha256}</span>]);
  rows.push(["ledger entry", `number ${r.ledger_seq}`]);
  return rows;
}

export function SourceBtn({ title, sref, klass = "observed", extra = [], notes, label = "source" }: {
  title: string;
  sref: SourceRef;
  klass?: Klass;
  extra?: [string, React.ReactNode][];
  notes?: string[];
  label?: string;
}) {
  const open = useReceipt();
  return (
    <button type="button" className="src-btn" onClick={() => open({ title, klass, rows: [...extra, ...refRows(sref)], notes })}>
      <IconReceipt size={13} />
      {label}
    </button>
  );
}
