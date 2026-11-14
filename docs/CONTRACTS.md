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

## Artifacts that exist (stage 1)

| File | Type | Class | Notes |
|---|---|---|---|
| `manifest.json` | `Manifest` (`lib/data.ts`) | - | `nasa` is null until `derive.py` has run |
| `investigations.json` | `InvestigationsDoc` | observed | one item per search hit; `scope` says which are excluded and why; `refs` per field; `derivations` names each rule |
| `tables/index.json`, `tables/<ACC>__<file>.json` | `TableSummary[]`, `TableDoc` | observed | cells are text exactly as in the file; row index is the row identity; `findings` feed the curator report |
| `official_resources.json` | `OfficialResource[]` | literature | `used_in` and `takeaways` are filled as features use each resource; the "10 of 10" counter counts a resource only with a receipt and at least one use |
| `ledger.json` | `LedgerDoc` | observed | public view of the ledger |
| `model/atmospheres.json`, `scaling.json`, `platform.json`, `cabin.json` | see `pages/Physics.tsx` | model | built by `build_models.py` |

## Artifacts to add (names are fixed; shapes are yours to define, then record here)

| File | Purpose |
|---|---|
| `tables_canonical/<ACC>.json` | typed columns with units, conversions and the original header for each (FLEX: O2, N2, CO2 mole fractions; mmHg to kPa; burning-rate constant in mm²/s; "no value" stays null) |
| `varied.json` | per investigation: which variables varied, which stayed constant, ranges, tested combinations against the possible grid |
| `envelope.json` | one point per test row that has oxygen fraction and pressure: `x_o2`, `p_kpa`, `flow_cm_s`, gravity, fuel, `ref` |
| `rank_features.json`, `rank_stability.json` | per investigation and mission lens: factor scores with the matched and unmatched items; share of seeded weight perturbations that keep it in the top five |
| `gaps.json`, `planned_experiments.json` | untested regions; gap-to-plan map |
| `sensors.json`, `hardware.json` | sensor and measurement inventory; hardware families |
| `literature/passages.json` | text per page or section of each stored document, with `doc_id`, page, `sha256` |
| `myths.json`, `incidents.json`, `earth_applications.json`, `detector_lineage.json`, `playbooks.json`, `matrix.json` | content built from the literature layer; every quotation carries `quote_verified` |
| `validation/thermo.json` | model against NASA's `Tad` and `Zst` columns (PSI-10, PSI-159): per row and summary statistics |
| `curator_report.json` | findings for PSI curators, each with file and location |
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
