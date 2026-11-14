# Coverage of the plan, feature by feature

Checked on 14 November 2026 at 14:38 Sofia time against the 130 features of the pre-event specification (`docs/pack/01_MASTER_SPEC.md`). Kept truthful: 'done' means it is on the site and tested or visibly working; 'partial' says what is missing.

| Priority | Features | Done | Partial | Not built |
|---|---|---|---|---|
| P0 | 28 | 22 | 6 | 0 |
| P1 | 59 | 21 | 12 | 26 |
| P2 | 38 | 1 | 8 | 29 |
| P3 | 5 | 0 | 0 | 5 |
| All | 130 | 44 | 26 | 60 |

## Definition of done (specification, section 0)

| Item | State |
|---|---|
| Public static site, one-command local run | done |
| All in-scope PSI investigations from NASA's API during the event, with DOI, licence, version, hash, time | done |
| Search, facets, ranking, comparison, what varied, atmosphere map, gap explorer, with no language model | done, with fewer facets and a simpler comparison than specified |
| Evidence Q&A with citations, abstention, deterministic fallback | done |
| One physics result validated against NASA's numbers | done |
| Alarm Trust Lab with at least three scenarios | done: nine scenarios, signatures, freshness, plausibility, triage, audit log, scorecard |
| North-star question answered in under 60 seconds | done (opening page, Myths and evidence) |
| Official Resources Coverage | done |
| Myth vs Evidence card for the fans | done |
| **The companion's 'Fans off' demonstration** | partial: on the opening page, without the companion |
| AI-use disclosure, sources, limitations, legal and brand checks | partial: no sources page of its own |
| **Submitted project page** | not done |

## Order of work from here

1. Finish the P0 rows: tidy exports with a data dictionary (L01, I03, A05, A06), more facets (B03), coverage matrix (B07), the mission on the map (B08), version drift (A10), the research-area reconciliation (A02), a build check with a planted unsourced row (F01), scope and sources pages (I02), offline cache (I04).
2. Alarm Trust Lab (E01 to E10, E15): the last missing item of the definition of done.
3. Judge tour (H01) and the companion ISKRA (H02, H05, H06, H07).
4. ISS live telemetry (M01, M02), matrix and playbooks (J01 to J03), signed release (K03), tamper button (K05).
5. Sensor inventory (B11), controls view (B13), nearest-evidence finder (B23), droplet check (C03), evaluation scorecard (F08), activity pane (F05), model-bridge files (L02, L03), report generator (B15).
6. Video re-recorded from the final site, slides, question sheet, submission.

## Every feature

| ID | Priority | State | Feature | What is there, what is missing |
|---|---|---|---|---|
| A01 | P0 | done | Official Resources verification | all ten resources are in the ledger and used; table on the Incidents page |
| A02 | P0 | done | PSI search sync through the public API | search synced; 2 off-topic hits shown with reasons; NASA's research-area page lists 19 combustion investigations and all 19 match records |
| A03 | P0 | done | Investigation metadata sync for every in-scope accession |  |
| A04 | P0 | done | Experimental-table download for every investigation that has one |  |
| A05 | P0 | done | Per-table column map (original header → canonical name, unit, type, note), kept as reviewable config | column map for every table (exports/column_map.json), overrides in pipeline/zgf/canonical.py |
| A06 | P0 | done | Unit normalisation in the derived layer (mmHg, atm, bar → kPa | mmHg, atm, bar to kPa and percent to fraction, tested; in the exports and on the map |
| A07 | P0 | done | Row identity and provenance pointers on every row | row number plus the table's ledger entry on every row |
| A08 | P0 | done | Data-quality profile per table | profiles.json and the curator report |
| A09 | P0 | done | Static artifacts and manifest (section 8.2) |  |
| A10 | P0 | done | "Synced from NASA at <UTC>" status and PSI version-drift detection | sync time shown; drift between fetches is computed (one fetch so far, so nothing to compare) |
| A11 | P1 | **partial** | Publications index per investigation (DOIs from PSI metadata) plus NTRS anchor documents with abstracts and PDF links | publications on each card; NTRS abstracts searchable in Ask; no index page |
| A12 | P1 | **not built** | Attachment ingestion for key workbooks (SAME-R combined results, DAFT summary, CFI data summary, SPICE smoke point) into tidy tables with sheet and ce | CFI, DAFT and SPICE workbooks are fetched, none is parsed; the SAME-R workbook was not fetched |
| A13 | P2 | **not built** | Selective raw media |  |
| A14 | P2 | **partial** | Literature-only investigations (Saffire IV–VI, LUCI, FM2, SoFIE, FLARE ) as `NASA_LITERATURE` cards sourced from NTRS and from the NASA Glenn pages | FM2, LUCI, SoFIE, FLARE, Saffire IV to VI appear as plans on the Gaps page, not as cards |
| A15 | P2 | **not built** | Re-sync command with a diff report |  |
| B01 | P0 | done | Investigation Cards | cards with NASA's text, what varied, table, files, people, publications; no separate fuel and condition summary block |
| B02 | P0 | done | "What varied / what stayed constant" per investigation, computed from the real table |  |
| B03 | P0 | **partial** | Explorer with search and facets (pillar, fuel phase, hardware family, platform, gravity regime, oxygen, pressure, flow, data richness) | search, scope, flight or ground, hardware; no facets for pillar, fuel phase, oxygen, pressure, flow |
| B04 | P0 | done | Ranking engine, deterministic and transparent | ten factors, five missions, weights, stability |
| B05 | P0 | **partial** | Compare two to four investigations | up to three records compared factor by factor; no shared-hardware or comparability warnings |
| B06 | P0 | done | Atmosphere Envelope Map (oxygen fraction against pressure) |  |
| B07 | P0 | **partial** | Gap Explorer | five measured gaps with plans; no coverage matrix of gravity by fuel by atmosphere |
| B08 | P0 | **partial** | Mission lens | five missions re-rank; no 'spacecraft' lens; the mission is not drawn on the map |
| B09 | P0 | done | Evidence Q&A with claim-level citations, abstention and deterministic fallback | offline engine, checker, local, cloud and hybrid modes |
| B10 | P1 | **not built** | Audience lens (student, researcher, engineer) |  |
| B11 | P1 | **not built** | Sensor and measurement inventory across investigations |  |
| B12 | P1 | **not built** | Hardware-family graph and knowledge graph (facilities, fuels, instruments, investigations) |  |
| B13 | P1 | **not built** | Controls view |  |
| B14 | P1 | done | Earth applications with NASA sources | three Spinoff articles; water mist is not in the ledger, so it is not shown |
| B15 | P1 | **not built** | Report generator with citations, figures, methods, limitations, AI disclosure and a ledger receipt |  |
| B16 | P2 | **not built** | Tension finder | partly covered by Myths and Try to refute it |
| B17 | P2 | **not built** | Next-best-experiment suggestions from the gap matrix, labelled as suggestions |  |
| B18 | P2 | **partial** | Shareable deep links and saved sessions | every page, record, mission and card has its own address |
| B19 | P1 | done | Incident timeline (Apollo 1, Apollo 13, Mir, Artemis II alarm) with sources | Apollo 1, Apollo 13, Mir; the Artemis II alarm is left out because no document about it is in the ledger |
| B20 | P0 | done | Official Resources Coverage panel | 10 of 10 |
| B21 | P1 | done | Myth vs Evidence | three cards, 25 quotations checked |
| B22 | P1 | done | Gap-to-plan map |  |
| B23 | P1 | **not built** | Nearest-evidence finder at row level |  |
| C01 | P1 | done | Thermochemistry engine validated against NASA's `Tad` and `Zst` columns (PSI-10, PSI-159) | 587 rows, mean difference 2.1 K |
| C02 | P1 | done | Atmosphere explorer |  |
| C03 | P1 | **not built** | Droplet engine |  |
| C04 | P1 | done | 2D tracer transport solver (conservative finite volume) with numerical tests |  |
| C05 | P1 | **partial** | Detection-time calculator (source → transport → sensor) | alarm times in Two realities; no calculator of its own |
| C06 | P1 | done | Partial-gravity bounding | 'a fan you cannot switch off' on the Flame physics page |
| C07 | P1 | done | Platform-fidelity calculator (rotation rate, radius, Coriolis fraction, gravity gradient, duration) |  |
| C08 | P1 | done | Cabin well-mixed gas model (oxygen consumed, CO2 rise, bounded temperature and pressure rise) with Saffire-scale presets |  |
| C09 | P2 | **not built** | Thin-fuel spread and U-shaped flammability boundary, shown as uncalibrated illustration unless calibrated on transcribed NASA values |  |
| C10 | P2 | **not built** | Dimensionless-number panel with definitions and where each matters |  |
| C11 | P2 | **not built** | Electric-field / gravity analogy explainer for E-FIELD Flames |  |
| C12 | P2 | **not built** | Multi-zone ventilation graph linked to the twin |  |
| C13 | P2 | **partial** | Sensitivity analysis and uncertainty bands | ensemble in Two realities; stability in the ranking |
| C14 | P3 | **not built** | Cool-flame kinetics, true 3D solver |  |
| D01 | P1 | **partial** | Flame and chamber visual driven by computed quantities (for example a droplet shrinking by the d² law), labelled schematic | flame windows driven by gravity and flow; no droplet visual |
| D02 | P2 | **not built** | Conceptual three-module habitat with ventilation paths and sensors |  |
| D03 | P2 | done | Timeline scrubber and scenario replay | one slider moves both realities |
| D04 | P2 | **partial** | Legend separating observation, model and synthetic layers | class badges and receipts on every panel |
| D05 | P2 | **partial** | Gravity explainer (0 g, lunar, Martian, 1 g), conceptual |  |
| D06 | P3 | **not built** | XR |  |
| E01 | P1 | **partial** | Detector evidence cards from SAME, SAME-R, DAFT/DAFT-2 and PSI-115 | the four smoke records are listed with links; no evidence cards of their own |
| E02 | P1 | done | Synthetic telemetry generated by the transport solver plus noise | generated from the site's transport model plus seeded noise; truth declared |
| E03 | P1 | done | Signed telemetry envelope (Ed25519 from a vetted library), key IDs, canonical encoding | Ed25519 through WebCrypto (ECDSA P-256 where a browser lacks it), one key per sensor, fixed byte encoding |
| E04 | P1 | done | Freshness checks | sequence, duplicates, clock skew, silence |
| E05 | P1 | done | Physics plausibility | rate of rise, two separated detectors at once, frozen value, combustion gas and heat as corroboration |
| E06 | P1 | done | Hypothesis triage | five explanations with signs for and against; inconclusive is a result |
| E07 | P1 | done | Scenario set mapped to SPARTA technique IDs | EX-0014.03, EX-0001.02, EX-0014.01 on the three tampering scenarios |
| E08 | P1 | **partial** | Alert timeline and hash-chained audit log with export | hash-chained audit log of every run; no export button |
| E09 | P1 | **partial** | Cost-of-action panel | a short panel linked to Two realities; no costed comparison |
| E10 | P1 | done | Detection scorecard | 72 seeded runs in the browser; counts per scenario; tampering never lowered a fire alarm |
| E11 | P2 | **not built** | Detection rules as readable, versioned files with unit tests |  |
| E12 | P2 | **not built** | Coordinated multi-sensor attack |  |
| E13 | P2 | **not built** | Live ISS telemetry integrity monitor (feed health on real data) |  |
| E14 | P3 | **not built** | Threat model and trust-zone diagram |  |
| E15 | P1 | **not built** | Detector lineage |  |
| F01 | P0 | done | Build-time card generation with validators | build check with planted-row tests (pipeline/zgf/validate.py); every quotation searched in the stored text |
| F02 | P0 | done | Deterministic fallback with no key and no network |  |
| F03 | P1 | **not built** | Orchestrator with typed tools (search, card, compare, envelope, thermo, transport, triage) |  |
| F04 | P1 | **partial** | Validation agent | the checker covers citations, numbers and verdicts |
| F05 | P1 | **not built** | Agent activity pane (tool trace, sources, duration, errors) | the Ask page shows sources and removed sentences, not a tool trace |
| F06 | P1 | done | Structured outputs and a fail-closed citation resolver |  |
| F07 | P1 | **partial** | Prompt-injection defences and a poisoned-document demonstration | tested with a poisoned passage; not demonstrated on a page |
| F08 | P1 | **not built** | Evaluation harness |  |
| F09 | P2 | **not built** | MCP server exposing the evidence tools to any assistant |  |
| F10 | P2 | **partial** | Multi-provider adapter, cost telemetry, response cache labelled as cached | Anthropic, OpenAI, Gemini, OpenAI-compatible and local endpoints; no cost telemetry or cache; not run against live services |
| F11 | P2 | **not built** | Narration with captions, disclosed as AI-generated |  |
| F12 | P2 | **not built** | Grounded "explain this chart" |  |
| G01 | P2 | **not built** | Fetch a few small BASS-II videos through the PSI API |  |
| G02 | P2 | **not built** | Classical segmentation and leading-edge tracking in pixel units |  |
| G03 | P2 | **not built** | Physical scale only when a sample dimension is known from the table |  |
| G04 | P3 | **not built** | Learned segmentation |  |
| H01 | P1 | **not built** | Judge Tour |  |
| H02 | P1 | **not built** | Animated companion (working name ISKRA) |  |
| H03 | P1 | **partial** | Accessibility | keyboard, labels, phone layout, both themes; no full audit |
| H04 | P1 | **partial** | Physics-true flame core | the flame windows on the opening page |
| H05 | P1 | **partial** | "Fans off" demonstration | works on the opening page for the station and the Moon with its labels; not yet through the companion |
| H06 | P1 | **not built** | Evidence pointer |  |
| H07 | P1 | **not built** | Provenance ring |  |
| H08 | P2 | **not built** | Triage ring in the Alarm Trust Lab |  |
| H09 | P2 | **not built** | Orbital motion extras and live ISS air as flame context |  |
| H10 | P2 | **not built** | Lines in English and Bulgarian |  |
| I01 | P0 | done | Mission Overview with real counts only |  |
| I02 | P0 | **partial** | About, Methods, Limitations, Scope, AI disclosure and Sources pages | Method and limits page with classes, limits and AI use; sources are on the Incidents page; no separate scope page |
| I03 | P0 | done | Downloads with a data dictionary | Downloads on the Data page: 22 tidy tables, long file, conditions file, data dictionary, column map |
| I04 | P0 | **partial** | Offline mode | runs with no key and no server; no offline cache for a second visit |
| I05 | P1 | **not built** | English first |  |
| I06 | P1 | **not built** | Demo mode with separately labelled real-data and synthetic flows |  |
| I07 | P2 | **not built** | Glossary |  |
| I08 | P2 | **not built** | Print-friendly briefs |  |
| J01 | P1 | **not built** | Matrix data model |  |
| J02 | P1 | **not built** | Matrix view with a coverage overlay per habitat |  |
| J03 | P1 | **not built** | Response playbooks for the ISS and for a lunar habitat |  |
| J04 | P2 | **not built** | Layer export and import as JSON |  |
| J05 | P2 | **not built** | Scenario drill through playbook and Alarm Trust together |  |
| K01 | P0 | done | Content-addressed raw store and manifest with SHA-256 |  |
| K02 | P1 | **partial** | Hash-chained append-only log of ingest and transform events | the chain covers every fetch; transform steps are not logged |
| K03 | P1 | **not built** | Signed release bundle (Ed25519), public key published, verification in the browser |  |
| K04 | P1 | done | Provenance receipt on every chart and answer | receipts on map points, table rows, quotations, passages, model rows |
| K05 | P2 | **partial** | Tamper demonstration | tested in code (a changed byte, a removed entry); no button on the page |
| K06 | P2 | **partial** | Reproducibility manifest (code version, parameters, model versions) | manifest with hashes, engine and species lists |
| L01 | P0 | done | Tidy, unit-normalised, ML-ready exports with dictionary and provenance | tidy CSV per table, long format, conditions of 887 tests, dictionary, provenance on every row |
| L02 | P1 | **not built** | Scenario → FDS input template (gravity vector, ambient oxygen, pressure, ventilation), labelled untested unless run |  |
| L03 | P1 | **not built** | Scenario → thermochemistry conditions file |  |
| L04 | P2 | **not built** | Analysis notebook generated during the event |  |
| L05 | P3 | **not built** | One real FDS run of a small case |  |
| M01 | P1 | **not built** | ISS live telemetry panel |  |
| M02 | P1 | **not built** | Feed-health indicator and a recording made during the event as fallback, labelled |  |
| M03 | P2 | **not built** | NASA Image Library gallery with credits |  |
| M04 | P2 | **not built** | Snapshot of recent related NTRS reports |  |
| N01 | P1 | done | Automatically generated data-quality findings per table (truncated headers, lost subscripts, encodings, unit ambiguities, impossible values) | 40 findings by stated rules |
| N02 | P1 | done | Respectful, constructive curator page with a downloadable report | report on the Data page, also as JSON |
| N03 | P2 | **not built** | Suggested metadata improvements (controlled vocabularies for fuel and units) |  |
