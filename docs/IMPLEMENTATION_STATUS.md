# Implementation status

Updated: 14 November 2026, 13:44 Sofia time. Kept truthful: nothing is listed as working without a passing test or a visible result.

## Working

| Part | Evidence |
|---|---|
| NASA sync script (`pipeline/sync_nasa.py`, 1.1) | Logic tested against a local mock of the endpoints: version fallback, signed links, caching, ledger chain, core selection, budgets, interrupt, pack-only. Run against NASA by the team on a laptop: version 1.0 worked but fetched far too many small files (over 300 MB); 1.1 limits the core set. **The cloud build environment itself has no route to nasa.gov.** |
| Ledger tools and derivation stage 1 (`pipeline/zgf/ledger.py`, `derive_core.py`) | Chain verification, hash check on every read, investigations, tables as text, resource registry, public ledger, manifest. 3 tests on a throw-away fixture, including a changed byte and an edited ledger line. Run on the real cache of 14 November: 1,219 ledger entries with an intact chain, 26 investigations (24 in scope, 2 excluded with reasons), 25 experimental tables parsed (2,092 rows; 2,009 in scope). |
| Derivation stage 2 (`pipeline/zgf/derive_evidence.py`) | Column profiles (what varied, what stayed constant), 40 curator findings by stated rules, 887 atmosphere points (746 with pressure), model check on 587 rows. 10 tests on synthetic tables. |
| Flame model checked against NASA | Stoichiometric equilibrium temperature against NASA's own `Tad` column in four tables (PSI-10, PSI-159): mean difference 2.1 K over 587 rows; `Zst` to 1e-4. Found on the way: PSI-159's `Tad` matches a one-atmosphere calculation, not the row's pressure. |
| Investigations page and record cards | 26 records with search and filters; each card shows NASA's text with receipts, what varied and what stayed constant, the table as written with row receipts, curator notes, files, people, publications. |
| Atmosphere map | Real test rows in oxygen against pressure, crew atmospheres, the normoxic curve, historical points, a strip for rows without pressure, and counts of rows near each crew atmosphere. |
| Evidence ledger page | Lists all 1,219 entries; re-computes the hash chain in the browser from the raw ledger (tested against the real ledger) and checks every data file against the manifest. |
| Literature layer and quotation check (`pipeline/zgf/literature.py`, `claims.py`) | Text of the stored NASA documents by page or section; every quotation the site shows is searched in the stored text at build time. 25 of 25 found. |
| Myths and evidence | NASA's three misconceptions (Researcher's Guide, p. 35), each against NASA's documents and PSI tables: where it held, where it may fail, what is open. Readings of our own are labelled. |
| Rank for a mission | Five missions; ten factors per record computed by stated rules (`pipeline/zgf/rank.py`); weights the reader can change; score breakdown with the reason for each factor; stability over 500 seeded weight changes; side-by-side comparison. 5 tests. A score orders reading; it is not a probability. |
| Ask the evidence, offline engine | 464 passages from records, table profiles, curator notes, the guide, NASA pages and report abstracts (`pipeline/zgf/index.py`); BM25 in the browser; answers made only of sentences taken from the passages, each with its source; abstains on questions the evidence does not cover. Tested. |
| Answer checker for language models | Every model sentence must cite a passage that was given, its numbers must be in that passage, and it may give no verdict or probability; anything else is removed and shown as removed. Tested, including a poisoned passage. |
| Data and models page | Report for the PSI curators, the model check with a parity plot, and the list of data files with hashes. |
| Closed-form physics and equilibrium thermochemistry | 16 Python tests reproduce the check values (LUCI spin, buoyant flow ranges, Coriolis fractions, normoxic curve, cabin bounds, methane flame temperatures). |
| Tracer-transport solver, browser and Python | The TypeScript solver matches the Python reference on three golden cases to 1e-9; mass balance, positivity, walls and open ends are tested. 20 TypeScript tests. |
| Model artifacts (`web/public/data/v1/model/*.json`) | Built by `pipeline/build_models.py`; listed with SHA-256 in `manifest.json`. |
| Site shell, light and dark themes, phone layout | Screens reviewed at 1440 px and 390 px; no horizontal overflow; no console errors. |
| "Kill the fans?" opening with the fan switch | Flames follow gravity and forced flow; the station flame carries the "not a rule" wording. Illustration. |
| Two realities (the Fan Paradox) | Two simulations from the same start, one time slider, detector readings, a comparison table, and an ensemble over flame responses, mixing, alarm level and buoyant speed. Model, illustrative. |
| Flame physics page | Atmospheres chart with table view, "a fan you cannot switch off", spinning-platform calculator, cabin bounds. |
| Method and limits page | Classes, limits, AI use. |

## Prototype (built, tested against formats, not against live services)

| Part | State |
|---|---|
| Local, cloud and hybrid model modes of Ask the evidence | Connectors for Anthropic, OpenAI, Google Gemini and any OpenAI-compatible endpoint (which covers local servers such as Ollama, LM Studio and llama.cpp). Request and reply formats are unit-tested with a stand-in for the network; the hybrid path (local drafts, cloud checks, verifier judges) is tested the same way. **No live model was called from the build environment**: it has no keys and no route to those services. An in-browser model (WebGPU) is not built. |

## Data is in, pages not built yet (nothing is shown in their place)

Gaps and plans, Official Resources Coverage (4 of 10 resources are used so far), incident timeline, Earth applications, sensor inventory, tidy CSV exports.

## Next in the build order

Alarm trust lab (synthetic, signed telemetry; triage of smoke, dust, sensor fault, tampering), the falsification engine, an evaluation scorecard for the evidence engine (gold, adversarial and abstention sets), the companion, ISS live telemetry, matrix and playbooks, judge tour.

## Simulated or illustrative by design

The flame windows (illustration), the Fan Paradox (model, relative units, prescribed flow), and all alarm and cyber scenarios (synthetic). None controls anything real.

## Known limits of what exists

- The Fan Paradox prescribes buoyancy as a plume fixed above the source; it does not travel with the smoke. Smoke units and the alarm level are relative; the ensemble varies them.
- Flame temperatures are equilibrium bounds for gaseous fuels. They say nothing about solid materials.
- The statement that BASS-II flames always went out when the fan stopped (ICES-2019-101) is not in the ledger. The site says only what the stored BASS-II Summary Report says: one test, flow cut, flame out within 2 s.
- The equilibrium check covers gas flames only. Nothing on the site predicts what a solid material does.
