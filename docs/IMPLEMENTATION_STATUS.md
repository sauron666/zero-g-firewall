# Implementation status

Updated: 14 November 2026, 14:38 Sofia time. Kept truthful: nothing is listed as working without a passing test or a visible result.

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
| Try to refute it | Six conclusions, three of them the site's own, each with the evidence for it and its scope, the conditions under which NASA's documents or tables say it fails, what was never tested and what would test it (`pipeline/zgf/falsify.py`; 30 of 30 quotations found). A typed conclusion gets a first pass by word match that names the untested regimes it touches and never judges it. Tested. Counter-arguments proposed by a second model are not built. |
| Gaps and plans | Five gaps, each counted from NASA's tables (no partial-gravity row among 2,009; no solid-material row with pressure; 8 and 11 rows near the exploration atmospheres; outcome columns in 10 of 20 tables; 3 of 6 Saffire flights in PSI), each beside the planned or flown experiment in NASA's words (`pipeline/zgf/lessons.py`). |
| Incidents and Earth uses, resource coverage | Apollo 1, Apollo 13 and Mir, and three Spinoff articles, in checked sentences, each tied to a page of the site; a table of the challenge's ten resources with receipt and uses. **10 of 10 resources are in the ledger and used.** 79 of 79 quotations on the site are found word for word in the stored documents. |
| Public site | https://sauron666.github.io/zero-g-firewall/ is deployed from `main` by GitHub Actions. The served manifest was checked after deployment; the live pages were not viewed from the build environment (no route to github.io). |
| Alarm trust lab (synthetic) | Nine scenarios with declared truth, generated from the site's transport model: quiet cabin, fire, fire with the fans stopped, overheated wire, dust, stuck detector, injected readings, replayed 'all clear' frames over a real fire, a shifted sensor clock over a real fire. Every reading is signed in the browser (Ed25519); signature, sequence and clock are checked; triage weighs five explanations without probabilities; a fire alarm latches and no integrity anomaly can lower it; audit log chained by hash; scorecard over 72 seeded runs. 9 tests. Controls nothing and reads no real sensor. |
| Tidy exports and build check | One CSV per table, a long file, conditions of 887 tests, data dictionary, column map; the build stops if anything can no longer be traced to a NASA file (tests with planted rows). |
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

Matrix and playbooks, sensor inventory, tidy CSV exports, a nearest-evidence finder at row level, ISS live telemetry on the atmosphere map.

## Next in the build order

Matrix and playbooks, an evaluation scorecard for the evidence engine (gold, adversarial and abstention sets), the companion, ISS live telemetry, matrix and playbooks, judge tour.

## Simulated or illustrative by design

The flame windows (illustration), the Fan Paradox (model, relative units, prescribed flow), and all alarm and cyber scenarios (synthetic). None controls anything real.

## Known limits of what exists

- The Fan Paradox prescribes buoyancy as a plume fixed above the source; it does not travel with the smoke. Smoke units and the alarm level are relative; the ensemble varies them.
- Flame temperatures are equilibrium bounds for gaseous fuels. They say nothing about solid materials.
- The statement that BASS-II flames always went out when the fan stopped (ICES-2019-101) is not in the ledger. The site says only what the stored BASS-II Summary Report says: one test, flow cut, flame out within 2 s.
- The equilibrium check covers gas flames only. Nothing on the site predicts what a solid material does.
