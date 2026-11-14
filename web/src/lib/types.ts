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
  /** files of this record in the ledger that are neither the experimental table nor raw data, each with a receipt */
  core_files?: (SourceRef & { file: string; bytes: number; folder?: string })[];
  /** what the ledger holds of this record, by NASA's own folders */
  in_ledger?: { files: number; bytes: number; folders: Record<string, { files: number; bytes: number }>; documents: number; documents_listed: number };
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
  /** the same rule in numbers: oxygen fraction either way, and pressure as a share either way */
  near?: { dx: number; dp: number };
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
  | { kind: "quote"; quote: string; says: string; quote_verified: boolean; source: string; short?: string | null; resource?: string | null; ref: SourceRef & { loc?: string; match?: string } }
  | { kind: "reading"; text: string }
  | { kind: "data" | "model"; id?: string; klass: Klass; text: string; accession?: string; also?: string[]; table?: string; ledger_seq?: number; sha256?: string; link?: string; columns?: string[]; rows?: string[][] };
export interface MythGroup {
  side: "holds" | "warns" | "fails" | "open";
  title: string;
  /** on the fans card: the branch of the fans model this group stands behind */
  branch?: string;
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
export interface RankFacets { pillars: string[]; oxygen: boolean; pressure: boolean; flow: boolean; outcome: boolean }
export interface RankItem {
  accession: string;
  acronym: string;
  title: string;
  gravity: "micro" | "ground" | "unknown";
  kind: string;
  /** the hardware as NASA names it, and the family this site sorts it into */
  hardware?: string;
  family?: string;
  rows: number;
  /** what the record is about and what its table states, each by a written rule (facet_rules) */
  facets: RankFacets;
  shared: Record<string, RankFactor>;
  by_lens: Record<string, Record<string, RankFactor>>;
}
export interface RankDoc {
  klass: Klass;
  facet_rules: { pillars: Record<string, string>; oxygen: string; pressure: string; flow: string; outcome: string };
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

/** falsify.json: conclusions set against the conditions under which they fail. */
export interface FalsifyClaim {
  id: string;
  claim: string;
  origin: string;
  verdict: "holds" | "limited" | "contradicted" | "untested";
  verdict_label: string;
  summary: string;
  scope: string[];
  holds: MythItem[];
  fails: { title: string; items: MythItem[] }[];
  untested: MythItem[];
  next: MythItem[];
}
export interface FalsifyDoc { klass: Klass; note: string; quotes: number; quotes_verified: number; verdicts: Record<string, string>; items: FalsifyClaim[] }

/** gaps.json and lessons.json */
export interface Gap {
  id: string;
  title: string;
  measure: string;
  unit: string;
  why: string;
  evidence: MythItem[];
  plans: { name: string; state: string; items: MythItem[] }[];
}
/** Where the placed test rows sit: fuel form by whole percent of oxygen, in each gravity regime. */
export interface CoverCell { n: number; records: Record<string, number> }
export interface CoverageBlock {
  klass: Klass;
  rule: string;
  axis: { lo: number; hi: number; unit: string };
  kinds: { id: string; label: string; rows: number; with_pressure: number; min: number | null; max: number | null; records: string[] }[];
  cells: Record<string, Record<string, CoverCell>>;
  regimes: { id: "micro" | "partial"; label: string; rows: number }[];
  atmospheres: { id: string; label: string; x_o2: number; p_kpa: number; pct: number }[];
  placed: number;
  total: number;
  top: number;
  not_placed: { id: string; why: string; rows: number; records: string[] }[];
}
/** recorded.json: one raw data file of PSI-100, the Saffire-III fire as the vehicle's own sensors recorded it. Times are seconds from the ignition of sample S1. */
export interface RecordedRadiometer { id: string; column: string; baseline: number; peak: number; peak_t: number; rise_t: number; back_t: number; opposed_rise: number; opposed_t: number }
export interface RecordedEvent { id: string; kind: "smoke_wire" | "igniter"; t: number; to: number; label: string; column: string }
export interface RecordedDoc {
  klass: Klass;
  title: string;
  source: SourceRef & { file: string; bytes: number; lines: number; columns: number; starts_utc: string; ends_utc: string; table: { artifact: string; sha256: string; ledger_seq: number; file: string } };
  samples: Record<string, string | number>[];
  zero: { what: string; utc: string; file_s: number };
  window: { from_t: number; to_t: number; rule: string };
  events: RecordedEvent[];
  series: { t: number[]; radiometers: number[][]; anemometers: number[][] };
  detector: { scatter: [number, number][]; obscuration: [number, number][] };
  units: string;
  derived: {
    klass: Klass;
    rules: string[];
    radiometers: RecordedRadiometer[];
    flame: { from_t: number; until_t: number; first_peak_t: number; last_peak_t: number; ended_in_file: boolean };
    scatter: {
      column: string; n: number; typical_step_s: number; mark: number;
      quiet: { n: number; max: number; minutes: number };
      wire: { t: number; first_above_quiet_after_s: number | null; peak: number; peak_t: number; peak_after_s: number; above_mark_s: number };
      wire_again: null | { t: number; before: number; peak: number; peak_after_s: number; rise: number };
      between: { max: number; min: number };
      fire: { before: number; first_above_before_s: number | null; half: number; half_s: number; peak: number; peak_s: number; above_mark_s: number; last: number; last_s: number };
    };
    obscuration: { column: string; n: number; min: number; max: number; distinct: number };
    cabin: Record<string, { column: string; n: number; min: number; max: number; first: number; last: number }>;
  };
  findings: { kind: string; detail: string }[];
  limits: string[];
}

/** reported.json: numbers NASA reported in papers and presentations, read from the stored text; none is in a PSI table. */
export type DocRef = SourceRef & { loc?: string; source: string; what: string };
export interface ReportedCheck { what: string; ok: boolean }
export interface SaffireRow { id: string; material: string; direction: string; length_cm: number; flow_cm_s: number; p_kpa: number; o2_pct: number; volume_m3: number;
  t_outlet_c: number; t_far_c: number; co2_ppm: number; co2_mmhg: number; co_ppm: number }
export interface LuciRow { id: string; sample: string; measure: string; lunar: number; earth: number; ratio: number; unit: string; as_stated?: string; ref: DocRef }
export interface ReportedDoc {
  klass: Klass;
  note: string;
  saffire: {
    title: string; rows: SaffireRow[]; columns: Record<string, string>;
    limits: { co_1h_ppm: number; co_24h_ppm: number; co2_1h_mmhg: number };
    alarm: { threshold_mg_m3: number; t_s: number; test: string; flow_reduced_s?: number; flow_from_cm_s?: number; flow_to_cm_s?: number; flow_stopped_s?: number };
    refs: { conditions: DocRef; products: DocRef; limits: DocRef }; checks: ReportedCheck[]; not_used: string;
    scale?: { kw_min: number; kw_max: number; volume_min_m3: number; volume_max_m3: number; ref: DocRef };
  };
  luci: {
    title: string; rows: LuciRow[]; checks: ReportedCheck[];
    spin: { rpm: number; radius_m: number; accel_m_s2: number; g: number; rule: string; ref: DocRef; lunar_g_stated?: number; lunar_g_ref?: DocRef };
    oxygen: { sample: string; from_pct: number; to_pct: number; approximate: boolean; ref: DocRef }[];
    launched: null | { as_stated: string; ref: DocRef };
  };
  fm2: { title: string; state: string; tests: { n: number; p_psia: number; tolerance_psi: number; o2_pct: number; p_kpa: number }[]; ref: DocRef; checks: ReportedCheck[] };
  quotes: Record<"saffire" | "luci" | "lunar" | "fm2", MythItem[]>;
  n_quotes: number; n_quotes_verified: number; n_checks: number;
}

export interface GapsDoc { klass: Klass; coverage?: CoverageBlock; note: string; searches: Record<string, number>; outside_the_combustion_search: string[]; outside_note: string; items: Gap[] }
export interface LessonCard { id: string; title: string; when?: string; resource: string; what: MythItem[]; ties: MythItem[] }
export interface LessonsDoc {
  klass: Klass;
  note: string;
  incidents: LessonCard[];
  earth: LessonCard[];
  video: null | { title: string; by: string; url: string; resource: string; ref: SourceRef };
  resources: { id: string; title: string; url: string; type: string; in_ledger: boolean; used_in: { page: string; what: string }[]; receipts: SourceRef[] }[];
}

/** matrix.json: fire behaviours by phase with coverage per habitat, and the documented response steps. */
export type Coverage = "evidence" | "bounded" | "gap" | "na";
export type StepBadge = "supported" | "uncertain" | "gap";
export type Habitat = "iss" | "lunar";
export interface MatrixCell { id: string; phase: string; name: string; pillar: string; iss: Coverage; lunar: Coverage; links: string[]; items: MythItem[]; steps: string[] }
export interface PlaybookStep {
  id: string; n: number; step: string; documented: MythItem[]; iss: StepBadge; lunar: StepBadge;
  /** where the evidence behind the lunar badge was taken: no step has a measurement in lunar gravity */
  lunar_basis: string; why: string; adds: string | null; cells: string[];
}
export interface MatrixDoc {
  klass: Klass; note: string;
  phases: { id: string; name: string; about: string }[];
  pillars: string[];
  cells: MatrixCell[];
  playbook: PlaybookStep[];
  coverage: Record<Habitat, Record<Coverage, number>>;
  playbook_coverage: Record<Habitat, Record<StepBadge, number>>;
  words: Record<Coverage, string>;
  waiting_for_sync: { key: string; name: string }[];
}

/** briefs.json: two sentences per investigation, written with an AI model and checked by the pipeline. Our reading, never NASA's words. */
export interface BriefsDoc {
  klass: Klass; written_by: string; when: string; how: string; note: string;
  items: Record<string, { what: string; why: string }>;
  dropped: { accession: string; problems: string[] }[];
  without_brief: string[];
}

/** droplets.json: the d-squared law against four columns of NASA's FLEX table, row by row. */
export interface DropletPoint { r: number; f: string; x: number | null; p: number | null; dil: string; d0: number | null; de: number | null; k: number | null; tb: number | null; end: string; td?: number; q?: number }
export interface DropletGroup { name: string; n: number; median: number; within10: number }
export interface DropletDoc {
  klass: Klass;
  title: string;
  source: { accession: string; file: string; artifact: string; sha256: string; ledger_seq: number };
  columns: Record<string, string>;
  law: string;
  rate_unit: { header: string; read_as: string; why: string };
  n_rows: number;
  n_usable: number;
  not_usable: { why: string; rows: number }[];
  ratio: { median: number; p10: number; p25: number; p75: number; p90: number; min: number; max: number };
  within: Record<string, number>;
  by_fuel: DropletGroup[];
  by_end: DropletGroup[];
  rate_by_oxygen: { fuel: string; pct: number; n: number; median: number; min: number; max: number }[];
  points: DropletPoint[];
  assumptions: string[];
  limits: string;
}

/* ---- inventory.json: what each record's table states, and what PSI lists for it as files ---- */
export interface InventoryColumn { table: string; name: string; kind: string; filled: number; distinct: number; of: number; min?: number; max?: number; example?: string }
export interface InventoryCell { state: "varied" | "single"; as_text: boolean; rows: number; columns: InventoryColumn[] }
export interface InventoryTable extends SourceRef { artifact: string; rows: number }
export interface InventoryFiles { raw: Record<string, { files: number }>; raw_files: number; raw_bytes: number; analysed_files: number; analysed_bytes: number; other_extensions: Record<string, number> }
export interface InventoryItem {
  accession: string; acronym: string; title: string; gravity: "micro" | "ground" | "unknown"; hardware: string;
  tables: InventoryTable[]; rows: number; cells: Record<string, InventoryCell>; not_placed: number; files: InventoryFiles; in_ledger: number;
}
export interface InventoryQuantity { id: string; group: string; label: string; phrase: string; about: string; pattern: string }
export interface InventoryDoc {
  klass: "derived"; rule: string; files_rule: string;
  groups: { id: string; label: string }[];
  quantities: InventoryQuantity[];
  file_kinds: { id: string; label: string; extensions: string[] }[];
  items: InventoryItem[];
  totals: Record<string, { records: number; varied: number; rows: number }>;
  counts: { records: number; with_table: number; tables: number; rows: number; columns: number; placed: number; set_aside: number; not_placed: number; raw_files: number; raw_bytes: number };
  not_placed: (InventoryColumn & { accession: string })[];
  flow_words: { klass: "derived"; rule: string; tables: FlowWordsTable[] };
}
/** Rows of one table whose flow columns say in words how the test ended; cells are exactly as NASA wrote them. */
export interface FlowWordsRow { r: number; id: string; fuel: string; o2: number | null; cells: Record<string, string>; class: string; down_to: boolean }
export interface FlowWordsTable extends SourceRef {
  acronym: string; table: string; n_rows: number; flow_columns: string[]; oxygen_column: string | null; fuel_column: string | null; id_column: string | null;
  classes: { id: string; label: string; pattern: string; rows: number; o2_min: number | null; o2_max: number | null; down_to: number }[];
  rows: FlowWordsRow[]; silent: number; silent_o2: number[];
}
