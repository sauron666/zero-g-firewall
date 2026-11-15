# Coverage of the plan, feature by feature

Checked on 14 November 2026 at 18:58 Sofia time; rows changed on 15 November are listed in `docs/IMPLEMENTATION_STATUS.md` under 'Added on 15 November' against the 130 features of the pre-event specification (`docs/pack/01_MASTER_SPEC.md`). Kept truthful: 'done' means it is on the site and tested or visibly working; 'partial' says what is missing.

| Priority | Features | Done | Partial | Not built |
|---|---|---|---|---|
| P0 | 28 | 28 | 0 | 0 |
| P1 | 59 | 43 | 6 | 10 |
| P2 | 38 | 10 | 6 | 22 |
| P3 | 5 | 1 | 1 | 3 |
| All | 130 | 82 | 13 | 35 |

Counts recomputed from the table below on 15 November. The FLEX regressor, the 3-D Fire Lab and Material Evidence are additions outside the 130 rows and are listed in `docs/IMPLEMENTATION_STATUS.md`.

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
| A14 | P2 | **partial** | Literature-only investigations (Saffire IV–VI, LUCI, FM2, SoFIE, FLARE ) as `NASA_LITERATURE` cards sourced from NTRS and from the NASA Glenn pages | Saffire IV to VI, LUCI and FM2 now carry numbers read from NASA's documents with cross-checks (Alarm page, coverage chart, atmosphere map, Gaps panel); SoFIE and FLARE remain plans with quotations; no record-style cards |
| A15 | P2 | **not built** | Re-sync command with a diff report |  |
| B01 | P0 | done | Investigation Cards | cards with NASA's text, what varied, table, files, people, publications; no separate fuel and condition summary block |
| B02 | P0 | done | "What varied / what stayed constant" per investigation, computed from the real table |  |
| B03 | P0 | done | Explorer with search and facets (pillar, fuel phase, hardware family, platform, gravity regime, oxygen, pressure, flow, data richness) | search, scope, flight or ground, hardware, and facets for pillar (three written rules), what burns, and what the table states (oxygen, pressure, air flow, outcome); the rules are shown under the facets; data richness is a sort order, not a facet |
| B04 | P0 | done | Ranking engine, deterministic and transparent | ten factors, five missions, weights, stability |
| B05 | P0 | done | Compare two to four investigations | up to four records side by side, factor by factor, under cautions read from the records: different things burning, flight against ground, a table that does not state what another states, no table, same or different hardware |
| B06 | P0 | done | Atmosphere Envelope Map (oxygen fraction against pressure) |  |
| B07 | P0 | done | Gap Explorer | six measured gaps with plans, and a coverage chart of fuel form by oxygen for free fall and for lunar and Martian gravity (empty), with a table view, receipts and a count of the rows that cannot be placed |
| B08 | P0 | done | Mission lens | five missions re-rank; choosing one (or arriving from the ranking page) marks its atmosphere on the map with the window that counts as near; a spacecraft in transit is read under the station or the rover and lander lens |
| B09 | P0 | done | Evidence Q&A with claim-level citations, abstention and deterministic fallback | offline engine, checker, local, cloud and hybrid modes |
| B10 | P1 | **not built** | Audience lens (student, researcher, engineer) |  |
| B11 | P1 | done | Sensor and measurement inventory across investigations | second view of the Investigations page (What was measured): 17 quantities placed by header patterns, a picker for what a model needs, how 26 BASS-II tests ended in the words of the flow columns, PSI's raw-data listing by kind of file, CSV, receipts |
| B12 | P1 | **not built** | Hardware-family graph and knowledge graph (facilities, fuels, instruments, investigations) |  |
| B13 | P1 | done | Controls view | on the fire matrix page: prevention, detection and suppression, each with its fire behaviours as marks for the station and the Moon, the NASA records that inform it (by the written pillar rules) and a link that opens those records |
| B14 | P1 | done | Earth applications with NASA sources | three Spinoff articles; water mist is not in the ledger, so it is not shown |
| B15 | P1 | done | Report generator with citations, figures, methods, limitations, AI disclosure and a ledger receipt | on the ranking page: a brief for the chosen mission as Markdown, saved or copied: the five records to read first with the strongest factors and what each does not cover, the measured gaps, the weights and rules, limits, the ledger head and the data file's hash; assembled by code (4 tests) |
| B16 | P2 | **not built** | Tension finder | partly covered by Myths and Try to refute it |
| B17 | P2 | done | Next-best-experiment suggestions from the gap matrix, labelled as suggestions | Research planner under Material Evidence: question registry v1.0.0 (8 questions, 7 distinct after merging duplicates), hypothetical candidates from unanswered questions, unweighted coverage gain, FM² planned overlap marked 'planned, not measured', JSON export (`web/src/lib/planner.ts`, 3 tests) |
| B18 | P2 | done | Shareable deep links and saved sessions | Fire Lab, Material Evidence and Model Lab keep their state in a versioned, validated URL (`web/src/lib/scenario.ts`, 4 tests); presets add a history entry so Back/Forward restores the case; JSON import/export of the scenario is validated the same way |
| B19 | P1 | done | Incident timeline (Apollo 1, Apollo 13, Mir, Artemis II alarm) with sources | Apollo 1, Apollo 13, Mir; the Artemis II alarm is left out because no document about it is in the ledger |
| B20 | P0 | done | Official Resources Coverage panel | 10 of 10 |
| B21 | P1 | done | Myth vs Evidence | three cards, 25 quotations checked |
| B22 | P1 | done | Gap-to-plan map |  |
| B23 | P1 | done | Nearest-evidence finder at row level | as before on the atmosphere map, plus Material Evidence: PMMA against BASS-II, Saffire-II, BASS, Saffire VI and LUCI on material, geometry, O2, pressure, airflow and gravity with Match / Near / Different / Not reported and a joint-condition gate (`web/src/lib/pmma.ts`, 11 tests) |
| C01 | P1 | done | Thermochemistry engine validated against NASA's `Tad` and `Zst` columns (PSI-10, PSI-159) | 587 rows, mean difference 2.1 K |
| C02 | P1 | done | Atmosphere explorer |  |
| C03 | P1 | done | Droplet engine | the d-squared law checked on four columns of NASA's FLEX table (195 rows, 152 within 10%), the measured rates against oxygen, and a calculator that takes its rate only from tests near the chosen oxygen |
| C04 | P1 | done | 2D tracer transport solver (conservative finite volume) with numerical tests |  |
| C05 | P1 | **partial** | Detection-time calculator (source → transport → sensor) | alarm times in Two realities; no calculator of its own |
| C06 | P1 | done | Partial-gravity bounding | 'a fan you cannot switch off' on the Flame physics page |
| C07 | P1 | done | Platform-fidelity calculator (rotation rate, radius, Coriolis fraction, gravity gradient, duration) |  |
| C08 | P1 | done | Cabin well-mixed gas model (oxygen consumed, CO2 rise, bounded temperature and pressure rise) with Saffire-scale presets |  |
| C09 | P2 | **not built** | Thin-fuel spread and U-shaped flammability boundary, shown as uncalibrated illustration unless calibrated on transcribed NASA values |  |
| C10 | P2 | **not built** | Dimensionless-number panel with definitions and where each matters |  |
| C11 | P2 | **not built** | Electric-field / gravity analogy explainer for E-FIELD Flames |  |
| C12 | P2 | **not built** | Multi-zone ventilation graph linked to the twin |  |
| C13 | P2 | **partial** | Sensitivity analysis and uncertainty bands | ensemble in Two realities; stability in the ranking; FLEX model shows the empirical out-of-fold error distribution, explicitly not a calibrated interval |
| C14 | P3 | **not built** | Cool-flame kinetics, true 3D solver |  |
| D01 | P1 | done | Flame and chamber visual driven by computed quantities (for example a droplet shrinking by the d² law), labelled schematic | flame windows driven by gravity and flow; a droplet drawn at the size the d-squared law gives it, beside the line of its squared diameter, labelled as an illustration |
| D02 | P2 | done | Conceptual three-module habitat with ventilation paths and sensors | Fire Lab, Habitat: three conceptual modules with written sizes, fans, three sensors (overhead position selectable), a cutaway, flow arrows and the site's 2-D transport solution drawn on one slice, labelled '2D transport visualized in 3D'; the sensor chart reads the same solution |
| D03 | P2 | done | Timeline scrubber and scenario replay | one slider moves both realities |
| D04 | P2 | done | Legend separating observation, model and synthetic layers | class badge on every panel and every 3-D HUD (computed, schematic, model, illustration); layer toggles in the Fire Lab |
| D05 | P2 | done | Gravity explainer (0 g, lunar, Martian, 1 g), conceptual | Fire Lab, Gravity comparison: 0 g against Moon, Mars or Earth on one clock; 'change gravity only' and 'mission preset' (which names the four changed conditions); scaling table; illustration label |
| D06 | P3 | **partial** | XR | implemented, device-unverified: WebXR capability detection, Enter VR / Enter AR (tabletop, transparent background) only when supported, controller ray selection of sensors and pins, a floating panel (play, restart, labels), session end restores the desktop view; no headset was available to test |
| E01 | P1 | **partial** | Detector evidence cards from SAME, SAME-R, DAFT/DAFT-2 and PSI-115 | the Saffire-III recording shows a real vehicle's smoke detector during a fire; the four smoke records are listed with links; no cards from the SAME, SAME-R and DAFT workbooks, which are in the ledger since 14 November 17:20 |
| E02 | P1 | done | Synthetic telemetry generated by the transport solver plus noise | generated from the site's transport model plus seeded noise; truth declared |
| E03 | P1 | done | Signed telemetry envelope (Ed25519 from a vetted library), key IDs, canonical encoding | Ed25519 through WebCrypto (ECDSA P-256 where a browser lacks it), one key per sensor, fixed byte encoding |
| E04 | P1 | done | Freshness checks | sequence, duplicates, clock skew, silence |
| E05 | P1 | done | Physics plausibility | rate of rise, two separated detectors at once, frozen value, combustion gas and heat as corroboration |
| E06 | P1 | done | Hypothesis triage | five explanations with signs for and against; inconclusive is a result |
| E07 | P1 | done | Scenario set mapped to SPARTA technique IDs | EX-0014.03, EX-0001.02, EX-0014.01 on the three tampering scenarios |
| E08 | P1 | done | Alert timeline and hash-chained audit log with export | alert timeline and a hash-chained audit log of every run, saved as JSON with the scenario, the seed and the chaining rule |
| E09 | P1 | **partial** | Cost-of-action panel | a short panel linked to Two realities; no costed comparison |
| E10 | P1 | done | Detection scorecard | 72 seeded runs in the browser; counts per scenario; tampering never lowered a fire alarm |
| E11 | P2 | done | Detection rules as readable, versioned files with unit tests | `web/src/trust/policy.ts`: zgf-alarm-policy/1 with schema (8 rules of 7 types, numbers only, no code), SHA-256 of canonical JSON, version shown on every verdict; a changed threshold changes the verdict (test) |
| E12 | P2 | done | Coordinated multi-sensor attack | added scenarios: detector drift, silent feed, threshold tampering in memory (caught by the pinned policy hash), alarm-output suppression (decision and delivery judged apart) and a coordinated replay of all four sensors, where the lab reports insufficient evidence instead of 'clear'; receiver comparison (single threshold, corroboration, integrity-aware) on the same seeded runs; 11 tests |
| E13 | P2 | **not built** | Live ISS telemetry integrity monitor (feed health on real data) |  |
| E14 | P3 | done | Threat model and trust-zone diagram | trust-zone panel on Alarm Trust: sensor, transport, verifier, decision, simulated output, what each protects and what stays trusted |
| E15 | P1 | **not built** | Detector lineage |  |
| F01 | P0 | done | Build-time card generation with validators | a two-sentence AI brief for each of the 24 investigations, written during the build and checked by code (no number the record lacks, no verdict, no invented curator note); shown on the list and on each record, labelled as our reading |
| F02 | P0 | done | Deterministic fallback with no key and no network |  |
| F03 | P1 | done | Orchestrator with typed tools (search, card, compare, envelope, thermo, transport, triage) | a rule-based planner calls typed tools (screen, count near an atmosphere, rank for a mission, matrix coverage, curator notes, fetch a record, search, compose, check); counts and rankings are computed by code |
| F04 | P1 | done | Validation agent | every sentence is checked against its cited passage; model answers also for numbers and verdicts |
| F05 | P1 | done | Agent activity pane (tool trace, sources, duration, errors) | the trace under each answer lists every tool call with arguments, result and time, as it ran |
| F06 | P1 | done | Structured outputs and a fail-closed citation resolver |  |
| F07 | P1 | done | Prompt-injection defences and a poisoned-document demonstration | on the Ask page: a planted note, two gates, the checker, and what the checker alone would have let through; can be sent to a connected model |
| F08 | P1 | done | Evaluation harness | 60 questions (gold, computed, abstention, adversarial; 29 held out) run in the browser and in the test suite; 58 pass, held out 27 of 29 |
| F09 | P2 | **not built** | MCP server exposing the evidence tools to any assistant |  |
| F10 | P2 | **partial** | Multi-provider adapter, cost telemetry, response cache labelled as cached | Anthropic, OpenAI, Gemini, OpenAI-compatible and local endpoints; no cost telemetry or cache; not run against live services |
| F11 | P2 | **not built** | Narration with captions, disclosed as AI-generated |  |
| F12 | P2 | **not built** | Grounded "explain this chart" |  |
| G01 | P2 | **not built** | Fetch a few small BASS-II videos through the PSI API |  |
| G02 | P2 | **not built** | Classical segmentation and leading-edge tracking in pixel units |  |
| G03 | P2 | **not built** | Physical scale only when a sample dimension is known from the table |  |
| G04 | P3 | **not built** | Learned segmentation |  |
| H01 | P1 | done | Judge Tour | ten stops in 85 seconds, each named by the challenge verb it serves; starts from the opening page, the companion or a link with tour=1; arrow keys, pause, works offline |
| H02 | P1 | done | Animated companion (working name ISKRA) | ISKRA, a lantern with a flame in a glass core, drawn by code; lives at the foot of the navigation and in the tour; states for searching, pointing, gap, sceptical, alarm, success; hide is remembered; reduced motion gives still pictures |
| H03 | P1 | **partial** | Accessibility | keyboard, labels, phone layout, both themes; no full audit |
| H04 | P1 | done | Physics-true flame core | the companion's flame and the flame windows follow gravity (cube root) and the fans; partial gravity always carries the question mark |
| H05 | P1 | done | "Fans off" demonstration | on the opening page and in the companion's own panel, for the station and the Moon, each with its caption |
| H06 | P1 | done | Evidence pointer | after an answer a thin line runs from the companion to each cited source in turn, and the source is outlined |
| H07 | P1 | done | Provenance ring | the companion's ring is drawn differently for each of the eight classes and follows the page |
| H08 | P2 | **partial** | Triage ring in the Alarm Trust Lab | the companion turns sceptical on an integrity anomaly and still on a fire alarm; the ring does not split into weighted segments |
| H09 | P2 | **not built** | Orbital motion extras and live ISS air as flame context |  |
| H10 | P2 | **not built** | Lines in English and Bulgarian |  |
| I01 | P0 | done | Mission Overview with real counts only |  |
| I02 | P0 | done | About, Methods, Limitations, Scope, AI disclosure and Sources pages | Method and limits page with the eight classes, limits, in scope and out of scope, the ten official sources with ledger entries and the pages that use them, AI use and the build |
| I03 | P0 | done | Downloads with a data dictionary | Downloads on the Data page: 22 tidy tables, long file, conditions file, data dictionary, column map |
| I04 | P0 | done | Offline mode | a service worker keeps the shell, the loaded scripts and fonts and every data file; tested by a second visit with the server stopped (home, an answer, a record) |
| I05 | P1 | **not built** | English first |  |
| I06 | P1 | **not built** | Demo mode with separately labelled real-data and synthetic flows |  |
| I07 | P2 | **not built** | Glossary |  |
| I08 | P2 | done | Print-friendly briefs | Material Evidence: 'Print or PDF' opens a light, print-ready brief (tables do not split rows; sources and dataset ID included); Markdown and CSV carry the same values (tested) |
| J01 | P1 | done | Matrix data model | 22 behaviours in 7 phases with pillar, evidence items, coverage per habitat and the response steps that meet each (pipeline/zgf/matrix.py) |
| J02 | P1 | done | Matrix view with a coverage overlay per habitat | matrix with a habitat switch (station, lunar) and a pillar filter; a tile opens its evidence |
| J03 | P1 | done | Response playbooks for the ISS and for a lunar habitat | six steps, each resting on a checked quotation from a NASA page; a badge per habitat; every lunar badge states where its evidence was taken. Quotations from NASA's fire protection brief appear after the next sync |
| J04 | P2 | **not built** | Layer export and import as JSON |  |
| J05 | P2 | **partial** | Scenario drill through playbook and Alarm Trust together | behaviours link to the matching alarm-lab situation; no guided drill |
| K01 | P0 | done | Content-addressed raw store and manifest with SHA-256 |  |
| K02 | P1 | **partial** | Hash-chained append-only log of ingest and transform events | the chain covers every fetch; transform steps are not logged |
| K03 | P1 | done | Signed release bundle (Ed25519), public key published, verification in the browser | `tools/release/sign_release.py` signs a canonical release manifest of every data file with Ed25519; private key outside the repository (refused inside it); public key, key ID and trust model published; the Evidence ledger page verifies the signature and re-hashes every file in the browser, with three tamper buttons; 4 Python and 3 TypeScript tests |
| K04 | P1 | done | Provenance receipt on every chart and answer | receipts on map points, table rows, quotations, passages, model rows |
| K05 | P2 | done | Tamper demonstration | three buttons on the ledger page change a copy in memory (one character, a removed entry, a forged entry with its hash recomputed) and show where the chain breaks |
| K06 | P2 | **partial** | Reproducibility manifest (code version, parameters, model versions) | FLEX model: seed, versions, feature allow-list, groups, folds, exclusions, dataset hash and one command; Alarm Trust run export with seed, policy hash, frames, decisions and audit chain; no single bundle for the whole site yet |
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
