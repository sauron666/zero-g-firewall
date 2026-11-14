# Implementation status

Updated: 14 November 2026, 14:38 Sofia time. Kept truthful: nothing is listed as working without a passing test or a visible result.

## Working

| Part | Evidence |
|---|---|
| NASA sync script (`pipeline/sync_nasa.py`, 1.1) | Logic tested against a local mock of the endpoints: version fallback, signed links, caching, ledger chain, core selection, budgets, interrupt, pack-only. Run against NASA by the team on a laptop: version 1.0 worked but fetched far too many small files (over 300 MB); 1.1 limits the core set. **The cloud build environment itself has no route to nasa.gov.** |
| Ledger tools and derivation stage 1 (`pipeline/zgf/ledger.py`, `derive_core.py`) | Chain verification, hash check on every read, investigations, tables as text, resource registry, public ledger, manifest. 3 tests on a throw-away fixture, including a changed byte and an edited ledger line. Run on the real cache of 14 November: 1,219 ledger entries with an intact chain, 26 investigations (24 in scope, 2 excluded with reasons), 25 experimental tables parsed (2,092 rows; 2,009 in scope). |
| Derivation stage 2 (`pipeline/zgf/derive_evidence.py`) | Column profiles (what varied, what stayed constant), 40 curator findings by stated rules, 887 atmosphere points (746 with pressure), model check on 587 rows. 10 tests on synthetic tables. |
| Flame model checked against NASA | Stoichiometric equilibrium temperature against NASA's own `Tad` column in four tables (PSI-10, PSI-159): mean difference 2.1 K over 587 rows; `Zst` to 1e-4. Found on the way: PSI-159's `Tad` matches a one-atmosphere calculation, not the row's pressure. |
| Investigations page and record cards | 26 records with search, filters and facets (pillar by three written rules, what burns, what the table states); each card shows NASA's text with receipts, what varied and what stayed constant, the table as written with row receipts, curator notes, files, people, publications. |
| Atmosphere map | Real test rows in oxygen against pressure, crew atmospheres, the normoxic curve, historical points, a strip for rows without pressure, and counts of rows near each crew atmosphere. Choosing a mission (or arriving from the ranking page) draws the window that counts as near its atmosphere and says how many rows fall in it. |
| Evidence ledger page | Lists all 1,219 entries; re-computes the hash chain in the browser from the raw ledger (tested against the real ledger) and checks every data file against the manifest. |
| Literature layer and quotation check (`pipeline/zgf/literature.py`, `claims.py`) | Text of the stored NASA documents by page or section; every quotation the site shows is searched in the stored text at build time. 25 of 25 found. |
| Myths and evidence | NASA's three misconceptions (Researcher's Guide, p. 35), each against NASA's documents and PSI tables: where it held, where it may fail, what is open. Readings of our own are labelled. |
| Rank for a mission | Five missions; ten factors per record computed by stated rules (`pipeline/zgf/rank.py`); weights the reader can change; score breakdown with the reason for each factor; stability over 500 seeded weight changes; side-by-side comparison. 5 tests. A score orders reading; it is not a probability. |
| Ask the evidence, offline engine | 531 passages from records, table profiles, curator notes, the measured gaps, the guide, NASA pages and report abstracts (`pipeline/zgf/index.py`); BM25 in the browser; answers made only of sentences taken from the passages, each with its source; abstains on questions the evidence does not cover. Tested. |
| Answer checker for language models | Every model sentence must cite a passage that was given, its numbers must be in that passage, and it may give no verdict or probability; anything else is removed and shown as removed. Tested, including a poisoned passage. |
| Try to refute it | Six conclusions, three of them the site's own, each with the evidence for it and its scope, the conditions under which NASA's documents or tables say it fails, what was never tested and what would test it (`pipeline/zgf/falsify.py`; 30 of 30 quotations found). A typed conclusion gets a first pass by word match that names the untested regimes it touches and never judges it. Tested. Counter-arguments proposed by a second model are not built. |
| Gaps and plans | A coverage chart of every placed test row by fuel form and whole percent of oxygen, once for free fall and once, empty, for lunar and Martian gravity, with a table view and a receipt on each square; the 1,122 rows that cannot be placed are counted by reason, and the build stops if the counts do not add up to all 2,009 rows. Then six gaps, each counted from NASA's tables (no partial-gravity row among 2,009; no solid-material row with pressure; no solid-material row above 22.2% oxygen; 8 and 11 rows near the exploration atmospheres; outcome columns in 10 of 20 tables; 3 of 6 Saffire flights in PSI), each beside the planned or flown experiment in NASA's words (`pipeline/zgf/lessons.py`). |
| Incidents and Earth uses, resource coverage | Apollo 1, Apollo 13 and Mir, and three Spinoff articles, in checked sentences, each tied to a page of the site; a table of the challenge's ten resources with receipt and uses. **10 of 10 resources are in the ledger and used.** 79 of 79 quotations on the site are found word for word in the stored documents. |
| Public site | https://sauron666.github.io/zero-g-firewall/ is deployed from `main` by GitHub Actions. The served manifest was checked after deployment; the live pages were not viewed from the build environment (no route to github.io). |
| Opening page as a mission console | The question with the two flame windows, then three instruments: the evidence agent (ask, first sentences, tools that ran), what NASA has measured on the station and in lunar gravity (22 marks each), and the alarm lab. Counts link to their pages. The station's own procedure is stated only if a stored NASA document says it. |
| Quick search | Ctrl or Command with K, or a slash: pages, investigations, fire behaviours and response steps; a sentence is sent to the evidence agent. Keyboard only if wished. |
| ISKRA, the companion | A lantern with a flame in a glass core, drawn by code from scratch. The flame follows gravity (cube root) and the fans; the ring is drawn differently for each class of information and follows the page; states for searching, pointing at sources, no answer, sceptical on tampered readings, alarm, success. Its panel holds the "fans off" demonstration for the station and the Moon with the mandatory captions. Hidden on request (remembered); still pictures under reduced motion. 11 tests. |
| Guided tour | Ten stops in 85 seconds, each named by the challenge verb it serves, from a button, the companion or a link with tour=1. Flips the fan switch at the first stop. Works offline. |
| Offline copy | After one visit with a connection the site opens with none: a service worker keeps the shell, the scripts and fonts the page loaded, and every data file in the manifest. While a connection exists the network wins, so a new build is not hidden. Checked by a scripted second visit with the server stopped: the opening page, an agent answer and a record all load. |
| Tamper demonstration on the ledger | A copy of the ledger is changed in memory in three ways (one character of a file hash, a removed entry, a forged entry whose own hash was recomputed) and re-verified; the page names the entry where the chain breaks. 1 test. |
| AI briefs on investigations | Two sentences for each of the 24 records in scope, written by the AI assistant during the build from the record's stored text and this site's profiles, and checked at every build (`pipeline/zgf/briefs.py`): a brief with a number the record does not hold, a verdict, or an invented curator note is dropped and reported. 24 of 24 kept. Shown under each title in the list and at the top of each record, drawn as an illustration and labelled "our reading, not NASA's words". 4 tests. |
| Evidence agent | A question goes through a plan of typed tools, all offline: screening (instructions, probability requests, names the evidence never mentions), counting test rows near a stated atmosphere, the oxygen range of the tests or the rows past a stated level, ranking for a mission, matrix coverage, curator notes, record lookup, passage search, composing, checking. Counts and rankings are computed by code; every other sentence is taken word for word from a passage. The trace under each answer is the list of calls as they ran. 16 tests on the shipped artifacts. The planner is a set of rules; a connected model may only rephrase. |
| Evaluation scorecard | 36 questions with pass rules: 19 gold, 5 computed, 7 abstention, 5 adversarial. 35 pass. 7 were written after the engine was last changed and never tuned against (6 pass); the others were also used to improve the engine. Runs in the browser and in the test suite. |
| Poisoned-passage demonstration | A planted note (synthetic) that gives the engine orders is stopped by the provenance gate and the instruction screen; a scripted obedient reply (synthetic) is then put through the real checker, with and without the gates. The page shows that the checker alone would let one planted claim through. Can be sent to a connected model. 3 tests. |
| Fire behaviour matrix and response playbook | 22 behaviours in 7 phases, each with checked quotations, counted table rows or labelled model results, and a coverage state for the space station and for a lunar habitat (measured there, bounded, nothing measured, does not apply). Station: 17 measured; lunar gravity: 0 measured. Six response steps taken from NASA pages (never invented), each with an evidence badge per habitat; every lunar badge says where its evidence was taken. The build stops if a behaviour marked as measured has no measurement or checked quotation, or if a step has no checked quotation. 5 tests. Quotations from NASA's fire protection brief are declared and appear after the next sync. |
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
| Model in the browser (fifth way to write answers) | The browser's own model through the Prompt API, else WebLLM on WebGPU; the same checker judges every sentence. Detection of what the browser offers runs on the page. 6 tests with stand-ins shaped like the published interfaces. Not run against a real model in the build environment (no GPU, no model download). |
| Local, cloud and hybrid model modes of Ask the evidence | Connectors for Anthropic, OpenAI, Google Gemini and any OpenAI-compatible endpoint (which covers local servers such as Ollama, LM Studio and llama.cpp). Request and reply formats are unit-tested with a stand-in for the network; the hybrid path (local drafts, cloud checks, verifier judges) is tested the same way. **No live model was called from the build environment**: it has no keys and no route to those services. |

## Data is in, pages not built yet (nothing is shown in their place)

Sensor inventory, a nearest-evidence finder at row level, ISS live telemetry on the atmosphere map.

## Next in the build order

ISS live telemetry.

## Simulated or illustrative by design

The flame windows (illustration), the Fan Paradox (model, relative units, prescribed flow), and all alarm and cyber scenarios (synthetic). None controls anything real.

## Known limits of what exists

- The Fan Paradox prescribes buoyancy as a plume fixed above the source; it does not travel with the smoke. Smoke units and the alarm level are relative; the ensemble varies them.
- Flame temperatures are equilibrium bounds for gaseous fuels. They say nothing about solid materials.
- The statement that BASS-II flames always went out when the fan stopped (ICES-2019-101) is not in the ledger. The site says only what the stored BASS-II Summary Report says: one test, flow cut, flame out within 2 s.
- The equilibrium check covers gas flames only. Nothing on the site predicts what a solid material does.
