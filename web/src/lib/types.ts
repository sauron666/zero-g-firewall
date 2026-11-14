/**
 * Shapes of the artifacts under public/data/v1. The pipeline writes them (pipeline/zgf/derive_core.py);
 * the site reads them. Change a shape here and in docs/CONTRACTS.md together.
 */
import type { Klass } from "./klass";

/** Where a value, a row or a sentence comes from. Resolves to an entry of ledger.json. */
export interface SourceRef {
  ledger_seq: number;
  sha256: string;
  url: string;
  kind?: "psi_meta" | "psi_table" | "psi_file" | "document" | "ntrs";
  accession?: string;
  file_name?: string;
  field?: string;        // key of the PSI metadata record
  row?: number;          // 0-based index into TableDoc.rows
  column?: string;       // header text exactly as in the file
  doc_id?: string;
  ntrs_id?: string;
  page?: number | string; // printed page of a PDF
  page_pdf?: number;
  section?: string;      // heading of a web page
}

export interface FileInventory {
  count: number;
  bytes_listed: number;
  total_file_size_stated: number | null;
  by_folder: Record<string, { count: number; bytes: number; extensions: Record<string, number> }>;
}

export interface TableSummary {
  accession: string;
  file: string;
  artifact?: string;     // path of the TableDoc under data/v1
  rows?: number;
  cols?: number;
  sha256: string;
  ledger_seq: number;
  encoding?: string;
  findings?: number;
  note?: string;
}

export type HardwareFamily = "CIR_ACME" | "CIR_MDCA" | "MSG" | "CYGNUS" | "AEROSOL" | "GROUND" | "OTHER";

export interface Investigation {
  accession: string;
  acronym: string;
  title: string;
  doi: string | null;
  license: string | null;
  project_type: string;
  gravity: "micro" | "ground" | "unknown";
  research_area: string;
  sub_research_area: string;
  hardware: string;
  hardware_link: string;
  hardware_family: HardwareFamily;
  platform: string;
  center: string;
  start: string | null;  // ISO date
  end: string | null;
  psi_version: number | null;
  version_reason: string | null;
  modified: string | null;
  released: string | null;
  objective: string;
  approach: string;
  hypothesis: string;
  impacts: string;
  people: { name: string; role: string; affiliation: string }[];
  publications: { title: string; authors: string; doi: string | null }[];
  related: string[];
  files: FileInventory;
  tables: TableSummary[];
  scope: { in_scope: boolean; reason: string };
  derivations: Record<string, string>;   // derived field -> the rule that produced it
  refs: Record<string, SourceRef>;       // field -> where it came from
  psi_url: string;
  missing?: string;
}

export interface InvestigationsDoc {
  klass: Klass;
  source: string;
  search_ledger_seq: number;
  search_total: number;
  items: Investigation[];
}

/** A table exactly as NASA wrote it: nothing coerced, each row addressable by its index. */
export interface TableDoc {
  accession: string;
  file: string;
  sha256: string;
  ledger_seq: number;
  url: string;
  psi_file_version: number | null;
  encoding: string;
  count_rule: string;
  n_rows: number;
  n_cols: number;
  columns: string[];
  rows: string[][];
  findings: { kind: string; detail: string }[];
}

export interface OfficialResource {
  id: string;            // R1 .. R10, in the order of the challenge's Resources tab
  title: string;
  url: string;
  type: "data" | "page" | "video" | "book";
  receipts: SourceRef[];
  in_ledger: boolean;
  used_in: { page: string; what: string }[];
  takeaways: { text: string; ref: SourceRef; quote_verified?: boolean }[];
}

export interface LedgerEntry {
  seq: number;
  kind: string;
  url: string;
  sha256: string;
  size: number;
  retrieved_at_utc: string;
  entry_hash: string;
  prev_hash: string;
  accession?: string;
  file_name?: string;
  role?: string;
  doc_id?: string;
  resource_id?: string;
  ntrs_id?: string;
  http_date?: string;
  last_modified?: string;
  content_type?: string;
  psi_file_version?: number;
  psi_study_version?: number;
  doi?: string;
  term?: string;
}
export interface LedgerDoc {
  klass: Klass;
  chain_ok: boolean;
  head: string;
  entries: LedgerEntry[];
}
