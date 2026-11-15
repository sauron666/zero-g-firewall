# Data contracts

The pipeline writes JSON under `web/public/data/v1/`; the site only reads. Shapes are in `web/src/lib/types.ts`. Every artifact is listed in `manifest.json` with its SHA-256, size and class. Change a shape in the types and here together.

## Raw cache and ledger (`nasa_raw/`, written by `sync_nasa.py`)

`ledger/ledger.jsonl`, one entry per fetched file:

| Field | Meaning |
|---|---|
| `seq`, `prev_hash`, `entry_hash` | the hash chain; `pipeline/zgf/ledger.py` verifies it |
| `key` | stable identity: `psi:search:<term>`, `psi:meta:<ACC>`, `psi:file:<ACC>:<file name>`, `psi:thumb:<ACC>`, `doc:<doc_id>`, `doc:glenn_pdf:<name>`, `doc:glenn_child:<name>`, `ntrs:record:<id>`, `ntrs:text:<id>:<name>` |
| `kind` | `psi_search`, `psi_meta`, `psi_file`, `psi_thumb`, `official`, `official_child`, `extra`, `ntrs_record`, `ntrs_fulltext`, `ntrs_pdf` |
| `url`, `final_url`, `sha256`, `size`, `http_date`, `last_modified`, `retrieved_at_utc`, `local_path` | provenance |
| `accession`, `file_name`, `role` (`experimental_table` or `supporting_file`), `psi_file_version`, `psi_study_version`, `doi` | for PSI files |
| `resource_id` (R1 to R10, X1...), `doc_id`, `ntrs_id` | for documents |

Read files only through `ledger.read(raw_dir, entry)`: it re-checks the hash.

## PSI structures (verified against the live API on 14 November 2026)

- Search: `hits.total` (number), `hits.hits[]._source` with keys `Accession`, `Title`, `Acronym`, `Project Type`, `Research Area`, `SubResearch Area`, `Flight Platform`, `Keywords`, `Objectives`, `Approach`, `Hypothesis`, `Research Impacts/Earth Benefits`, `Experiment Hardware` (`Name`, `Link`), `Related Investigations`, `Investigation Start Date`, `Investigation End Date`, `Publication Title`, `Publication Author List`, `Thumbnail`.
- Investigation record, top-level keys: `accession`, `title`, `investigationAcronym`, `doi`, `licenseIdentifier`, `projectType`, `researchArea`, `subResearchArea`, `experimentHardware`, `experimentHardwareLink`, `flightProgram`, `managingNasaCenter`, `investigationStartDate`, `investigationEndDate` (MM-DD-YYYY), `version`, `versionReason`, `modifiedDate`, `releaseDate`, `objective`, `approach`, `hypothesis`, `researchImpacts`, `description`, `contacts[]`, `publications[]` (`title`, `authorList`, `doi`), `related_glds`, `totalFileSize`, `experimentalTable[]`, `added[]`, `images[]`, `factors[]`, `assays[]`.
- File records (`experimentalTable[]`, `added[]`): `file_name`, `file_size`, `version`, `remote_path` (`/Home/psi-data/<ACC>/<folder>/<file>`), `s3_path`, `restricted`, `visible`, sometimes `psi_legacy`, `subcategory`.
- Contact e-mail addresses are in the records. They are not republished in our artifacts.

## Artifacts that exist

| File | Type | Class | Notes |
|---|---|---|---|
| `manifest.json` | `Manifest` (`lib/data.ts`) | - | `nasa` is null until `derive.py` has run |
| `investigations.json` | `InvestigationsDoc` | observed | one item per search hit; `scope` says which are excluded and why; `refs` per field; `derivations` names each rule |
| `tables/index.json`, `tables/<ACC>__<file>.json` | `TableSummary[]`, `TableDoc` | observed | cells are text exactly as in the file; row index is the row identity; `findings` feed the curator report |
| `official_resources.json` | `OfficialResource[]` | literature | `used_in` and `takeaways` are filled as features use each resource; the "10 of 10" counter counts a resource only with a receipt and at least one use |
| `ledger.jsonl`, `ledger_index.json` | `LedgerEntry` per line, `LedgerIndex` | observed | the raw ledger exactly as the sync wrote it (the browser re-computes the chain from it, see `lib/ledger.ts`); the index lists the head, counts and the entries this build read |
| `profiles.json` | `ProfilesDoc` | derived | per table and column: filled, distinct, range, role (varied, constant, identifier, when, notes). This is "what varied, what stayed constant" |
| `curator_report.json` | `CuratorDoc` | derived | findings by stated rule, each with table, column and rows; hand notes carry the cells they rest on and vanish if those cells change |
| `envelope.json` | `EnvelopeDoc` | observed | one point per table row that states oxygen; `p` is null when the table gives no pressure (never assumed); `near_presets` counts rows near each crew atmosphere |
| `validation.json` | `ValidationDoc` | model | equilibrium model against NASA's `Tad` and `Zst` (PSI-10, PSI-159), per row, at the row's pressure and at one atmosphere |
| `model/atmospheres.json`, `scaling.json`, `platform.json`, `cabin.json` | see `pages/Physics.tsx` | model | built by `build_models.py` |

## Artifacts to add (names are fixed; shapes are yours to define, then record here)

| File | Purpose |
|---|---|
| `tables_canonical/<ACC>.json` | typed columns with units, conversions and the original header for each (FLEX: O2, N2, CO2 mole fractions; mmHg to kPa; burning-rate constant in mm²/s; "no value" stays null) |
| `rank_features.json`, `rank_stability.json` | per investigation and mission lens: factor scores with the matched and unmatched items; share of seeded weight perturbations that keep it in the top five |
| `gaps.json`, `planned_experiments.json` | untested regions; gap-to-plan map |
| `sensors.json`, `hardware.json` | sensor and measurement inventory; hardware families |
| `literature/passages.json` | text per page or section of each stored document, with `doc_id`, page, `sha256` |
| `myths.json`, `incidents.json`, `earth_applications.json`, `detector_lineage.json`, `playbooks.json`, `matrix.json` | content built from the literature layer; every quotation carries `quote_verified` |
| `index.json` | retrieval chunks for the evidence engine: `id`, `text`, `klass`, `ref` |
| `trust/scenarios/*.json`, `trust/scorecard.json`, `eval/scorecard.json` | alarm scenarios and scorecards (synthetic) |
| `ledger/release.sig`, `ledger/pubkey` | signed release of the manifest (Ed25519) |

## Integrity checks the build must run

1. The ledger chain verifies and every file read matches its hash (done in stage 1).
2. Every row in an `observed` artifact has a `ledger_seq` and a row or field; a planted unsourced row fails the build.
3. No synthetic or model file sits under a NASA name; classes in the manifest match file locations.
4. Every quotation equals the stored document text at its page or section.
5. Every entry of `official_resources.json` that counts as used has a receipt and a link to a page that exists.
6. Units convert consistently (mmHg, atm, bar, psia to kPa; fraction and percent; cm/s and m/s).

## `recorded.json` (class NASA data, with a derived block)

One raw data file of PSI-100, the Saffire-III recording. `series.t` is seconds from the ignition of sample S1 (`zero.utc`); `series.radiometers` and `series.anemometers` hold one list per column, all as long as `series.t`; `detector.scatter` and `detector.obscuration` are lists of `[t, reading]` exactly as the vehicle wrote them. `events` come from the igniter and smoke-wire currents. `derived` holds the few numbers stated beside the chart, each with its rule in `derived.rules`; the integrity check recomputes every stated peak from the series. No unit is given because the file gives none. Written only when the file is in the ledger.

## `inventory.json` (class derived)

What each record's experimental table states. `quantities` is the ordered list of `{id, group, label, phrase, about, pattern}`; a header is placed under the first quantity whose `pattern` matches it. `items` holds one entry for each record in scope: `tables` (a receipt for each stored table), `rows`, and `cells[quantity] = {state: "varied" | "single", as_text, rows, columns[]}`, each column with its header as written, `kind`, `filled`, `distinct`, `of`, and `min`/`max` or an `example`. `files` is PSI's own listing of the record's raw and analysed data by kind of file; `in_ledger` counts what this site fetched. `totals[quantity]` and `counts` are sums of the cells; `counts.placed + counts.set_aside + counts.not_placed` equals `counts.columns`. `not_placed` lists every header no pattern names, as written. The integrity check re-reads each named column in its table and re-matches it against its pattern.

## `reported.json` (class NASA document)

Numbers NASA reported outside PSI, read from the stored text of each document by a pattern: `saffire.rows` (five tests: conditions and what rose in the cabin), `saffire.limits`, `saffire.alarm`, `saffire.scale` (the fire sizes in kW and the free volumes in cubic metres, from the paper's own sentence; checked against the volumes of Table 1 in whole cubic metres); `luci.rows` (spread rates in simulated lunar gravity and on Earth), `luci.spin`, `luci.oxygen`, `luci.launched`; `fm2.tests` (planned). Every set has `checks`, each `{what, ok}`; a failed check stops the build. Every value has a `ref` with the ledger entry, the SHA-256, the address and the page. `atmospheres.items` are the cabin atmospheres the site marks (`id`, `kind`, `name`, `label`, `o2_pct`, `p_psia`, `p_kpa`, `note`), each with `words`, the sentence of the NASA document that states the pair, and its `ref`; the list itself lives in `pipeline/zgf/atmospheres.py`, and `model/atmospheres.json` may hold no other atmosphere. `quotes` are checked quotations in the same shape as on the Myths page. None of these numbers may be added to a count of PSI rows.

## Laboratory contracts (15 November)

Types in `web/src/lib/scenario.ts`; SI inside (m, s, m/s, kPa, O2 mole fraction, g as a fraction of 9.80665 m/s²). The 3-D world is in metres, +y up in the drawing; with g > 0 gravity points along −y.

| Contract | Fields | Rule |
|---|---|---|
| `ScenarioState` | v, material, form, size_m, o2, p_kpa, u_m_s, g, preset, evidence[], layers[], seed, t_s | null means unknown and is never replaced by a default; URL keys v, m, f, size, o2, p, u, g, pre, ev, lay, seed, t ("na" = unknown) |
| `EvidenceMatch` | id, title, checks[] (dim, asked, recorded, status, why, tolerance), missing[], similarity, role, joint, klass, source, observed[] | status ∈ match, near, different, not_reported; joint only when every check of one test matches |
| `ModelResult` | task, model_id, target, unit, input, estimate (null on abstain), status, reasons[], uncertainty, nearest[] | no number when status is abstain |
| `LabRun` | kind "LabRun", model, params, seed, t[], series{}, labels{} | a model or synthetic run; never a NASA record |
| `ViewState` | camera, selected, speed, quality | never changes scientific data |

Artifacts added: `ml/flex_k_model.json` (model, support, training rows, golden vectors; class model), `ml/flex_k_eval.json` (audit, OOF rows, metrics, stress test), `ml/MODEL_CARD_FLEX.md`, `release/release.json`, `release/release.sig`, `release/pubkey.json` (not in the manifest: they sign it). Alarm policy: `zgf-alarm-policy/1` in `web/src/trust/policy.ts`; run export `zgf-alarm-run/1`; research plan export `zgf-research-plan/1`.
