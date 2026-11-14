/**
 * Shapes of the artifacts under public/data/v1. The pipeline writes them (pipeline/zgf/derive_core.py);
 * the site reads them. Change a shape here and in docs/CONTRACTS.md together.
 */
import type { Klass } from "./klass";

/** Where a value, a row or a sentence comes from. Resolves to an entry of ledger.jsonl. */
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
  mission?: string;
  proposal_title?: string;
  core_files?: (SourceRef & { file: string; bytes: number })[];
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
  n_lines?: number;
  n_empty_lines?: number;
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

/** One line of ledger.jsonl, exactly as sync_nasa.py wrote it. */
export interface LedgerEntry {
  seq: number;
  key: string;
  kind: string;
  url: string;
  final_url?: string;
  sha256: string;
  size: number;
  status?: number;
  local_path?: string;
  retrieved_at_utc: string;
  entry_hash: string;
  prev_hash: string;
  accession?: string;
  file_name?: string;
  role?: string;
  selection?: string;
  doc_id?: string;
  resource_id?: string;
  official_resource?: string;
  linked_from?: string;
  ntrs_id?: string;
  http_date?: string;
  last_modified?: string;
  etag?: string;
  content_type?: string;
  psi_file_version?: number;
  psi_study_version?: number;
  doi?: string;
  term?: string;
}
export interface LedgerIndex {
  klass: Klass;
  chain_ok: boolean;
  head: string;
  entries: number;
  first_utc: string;
  last_utc: string;
  by_kind: Record<string, { entries: number; bytes: number }>;
  used: number[];
  not_in_cache: number;
  hash_rule: string;
  note: string;
}

/** profiles.json: what each column holds, and so what varied and what stayed constant. */
export interface ColumnProfile {
  name: string;
  filled: number;
  missing: number;
  distinct: number;
  kind: "number" | "quantity" | "text" | "empty";
  role: "varied" | "constant" | "constant_where_given" | "identifier" | "when" | "notes" | "empty";
  min?: number;
  max?: number;
  units?: string[];
  top: [string, number][];
}
export interface TableProfile {
  accession: string;
  file: string;
  n_rows: number;
  columns: ColumnProfile[];
  varied: string[];
  constant: [string, string][];
  rule: string;
}
export interface ProfilesDoc {
  klass: Klass;
  items: Record<string, TableProfile>;
}

/** curator_report.json: data-quality findings, each found by a stated rule. Nothing is corrected. */
export interface CuratorFinding {
  id: string;
  rule: string;
  level: "note" | "caution";
  accession: string;
  also?: string[];
  file?: string;
  table?: string;
  column?: string;
  rows?: number[];
  n_rows?: number;
  detail: string;
  handling: string;
  found_by: string;
  in_scope: boolean;
}
export interface CuratorDoc {
  klass: Klass;
  note: string;
  count: number;
  by_rule: Record<string, number>;
  items: CuratorFinding[];
}

/** envelope.json: every table row that states oxygen (and pressure, where the table gives it). */
export interface EnvelopePoint {
  s: string;           // series id
  a: string;           // accession
  t: string;           // table artifact
  r: number;           // row index
  x: number;           // oxygen mole fraction
  p: number | null;    // kPa, null when the table gives no pressure
  f: string;           // fuel or material, as written
  o?: string;          // outcome, as written
  approx?: string;     // the cell text, when the oxygen value was read from wording such as "~ 21.5"
}
export interface EnvelopeSeries {
  id: string;
  kind: "droplet" | "gas" | "solid";
  gravity: "micro";
  accessions: string[];
  n: number;
  n_with_pressure: number;
  no_oxygen: number;
  pressure_not_usable: number;
  pressure_in_table: boolean;
  oxygen_from: string;
  oxygen_factor: number;
  pressure_from: string | null;
  pressure_factor: number | null;
}
export interface EnvelopeDoc {
  klass: Klass;
  note: string;
  near_rule: string;
  series: EnvelopeSeries[];
  points: EnvelopePoint[];
  near_presets: { id: string; label: string; x_o2: number; p_kpa: number; n_near: number; by_kind: Record<string, number> }[];
  gravity_counts: { micro: number; partial: number; note: string };
}

/** validation.json: the equilibrium model against NASA's own Tad and Zst columns. */
export interface ErrStats {
  n: number;
  mean_abs?: number;
  median_abs?: number;
  max_abs?: number;
  bias?: number;
}
export interface ValidationDoc {
  klass: Klass;
  title: string;
  method: string;
  engine: string;
  species: string[];
  limits: string;
  tables: {
    accession: string;
    file: string;
    table: string;
    n_rows: number;
    n_compared: number;
    skipped: Record<string, number>;
    Tad: { row_pressure: ErrStats; one_atmosphere: ErrStats; closer: "row_pressure" | "one_atmosphere" };
    Zst: { n: number; mean_abs?: number; max_abs?: number };
    by_fuel: { fuel: string; row_pressure: ErrStats; one_atmosphere: ErrStats }[];
    conditions: string;
  }[];
  points: { a: string; t: string; r: number; f: string; p: number; T: number; Tr: number; Ta: number; Z: number; Zm: number }[];
  overall: { closer_convention_per_table: ErrStats; row_pressure: ErrStats; one_atmosphere: ErrStats };
}

/** myths.json: NASA's three misconceptions against NASA's own documents and tables. */
export type MythItem =
  | { kind: "quote"; quote: string; says: string; quote_verified: boolean; source: string; resource?: string | null; ref: SourceRef & { loc?: string; match?: string } }
  | { kind: "reading"; text: string }
  | { kind: "data" | "model"; klass: Klass; text: string; accession?: string; also?: string[]; table?: string; ledger_seq?: number; sha256?: string; link?: string; columns?: string[]; rows?: string[][] };
export interface MythGroup {
  side: "holds" | "warns" | "fails" | "open";
  title: string;
  items: MythItem[];
}
export interface MythCard {
  id: string;
  n: number;
  myth: string;
  myth_verified: boolean;
  myth_ref: SourceRef & { loc?: string };
  question: string;
  answer: string;
  groups: MythGroup[];
}
export interface MythsDoc {
  klass: Klass;
  note: string;
  source: string;
  quotes: number;
  quotes_verified: number;
  items: MythCard[];
}

/** rank_features.json: factors per record, lenses with default weights. The browser combines them. */
export interface RankFactor { score: number; why: string }
export interface RankLens {
  id: string;
  name: string;
  gravity: "micro" | "partial" | "any";
  about: string;
  atmospheres: [string, number, number][];
  weights: Record<string, number>;
}
export interface RankItem {
  accession: string;
  acronym: string;
  title: string;
  gravity: "micro" | "ground" | "unknown";
  kind: string;
  rows: number;
  shared: Record<string, RankFactor>;
  by_lens: Record<string, Record<string, RankFactor>>;
}
export interface RankDoc {
  klass: Klass;
  note: string;
  near_rule: string;
  factors: { id: string; label: string; rule: string }[];
  lenses: RankLens[];
  items: RankItem[];
}

/** index.json: passages for retrieval, each with its evidence class, a link into the site and a receipt. */
export interface Passage {
  id: string;
  k: Klass;
  t: string;      // where it is from
  x: string;      // the text
  l?: string;     // a page of this site
  r?: { ledger_seq: number; sha256: string; url: string };
  loc?: string;
}
export interface IndexDoc { klass: Klass; note: string; count: number; chunks: Passage[] }
