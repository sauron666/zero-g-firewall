# Zero-G Firewall

**Live site:** https://sauron666.github.io/zero-g-firewall/ (built from `main` by GitHub Actions; works offline once loaded, needs no key and no server)

**Kill the fans?** In NASA's BASS-II experiment a flame went out within two seconds once its airflow was cut. NASA's own guide still lists "A fire will self-extinguish if ventilation is shut off" as a misconception, and on the Moon gravity is a fan nobody can switch off.

Zero-G Firewall makes NASA's microgravity combustion data findable, ranked and checkable, shows where the measurements end, and asks the next question: can you trust the alarm that shuts off your air?

## What it does (build of 14 November 2026)

- **Mission control.** The opening page: six readings, two flame windows with one fan switch, and a panel for each result. Every number is read from the build's data files.
- **Explore.** 24 combustion investigations from NASA's PSI repository with their tables, a receipt on every row and curator notes; an atmosphere map of 887 test rows by oxygen and pressure; the nearest real tests to a design point, as a CSV; a coverage chart showing that solid-material rows stop at 22.2% oxygen, that no row states more than 40%, and that none was taken in lunar or Martian gravity, with marks for the tests NASA reports outside PSI or plans (Saffire IV to VI, the LUCI flight in simulated lunar gravity, the four FM2 tests on the Moon); six measured gaps beside the experiments NASA plans; every record by what its table states, where the reader picks what a model needs and the records that state all of it are counted (oxygen, air flow and how the flame ended together: none), and how 26 BASS-II tests ended in the words of the table's own flow columns.
- **Compare.** A ranking for five missions from ten stated factors, with a check of its stability and a brief for the chosen mission; NASA's three misconceptions with both sides; a fire behaviour matrix (22 behaviours, 17 measured in free fall, none on the Moon), the controls each record informs, and a response playbook taken from NASA documents.
- **Simulate.** A flame-temperature model checked against NASA's tabulated Tad (587 rows; mean gap 2.1 K with each table at the pressure convention its column fits, 12.8 K with the row's pressure throughout); the d² law checked against four columns of the FLEX table (152 of 195 tests within 10%, nothing fitted); a transport model of one cabin with the fans on and off; an alarm trust lab that opens with a real recording, the smoke detector of a cargo vehicle during the Saffire-III fire (raw data of PSI-100), and NASA's reported numbers for five larger fires, then nine synthetic situations with signed readings.
- **Search.** ISKRA, the companion, answers questions in plain words on every page: numbers are computed from NASA's tables and every sentence carries its source. No key, no network. A public scorecard reports 58 of 60 questions passed, 27 of the 29 that were never tuned against.
- **Verify.** 4,959 files fetched from NASA in a hash-chained ledger that the browser recomputes; a tamper test; a page that attacks the site's own conclusions with NASA's evidence. Every cabin atmosphere the models use opens the NASA sentence that states it, and the build stops if the numbers part ways. Each record has a citation that names the version and the SHA-256 of the file that was read.
- **Accessible, by measurement.** `node tools/a11y/audit.mjs web/dist` checks every page in both themes and at two widths with axe-core (WCAG 2.2, levels A and AA): no rule violated on 14 November. What a machine cannot tell is in [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md).

NASA Space Apps Challenge 2026, Sofia. Challenge: *Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*. Team: The Rule of Flame.

Independent project. Not endorsed by NASA.

## What works today

See [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). It lists what is working, what is a prototype, what is simulated and what is not built, exactly as it is.

## How it is built

```
pipeline/sync_nasa.py     fetches the PSI search, every investigation, its experimental table,
                          the challenge's official resources and NTRS records from NASA,
                          byte for byte, into a hash-chained ledger (standard library only)
pipeline/zgf/             physics, transport reference solver, model artifacts, derivation
pipeline/tests/           check values for every model
web/                      static site (Vite, React, TypeScript); works offline, no key, no server
web/public/data/v1/       every artifact the site shows, with a manifest of SHA-256 hashes
docs/                     decisions, status, official resources, AI use, accessibility audit
tools/                    the film recorder and the accessibility audit (both need Playwright)
```

Rules the code enforces:

- **Only real NASA data.** Every row comes from a file fetched from NASA during the event, with its address, SHA-256 and retrieval time. A missing value stays missing.
- **Eight classes of content, never mixed:** NASA data, NASA document, derived, model, synthetic, live, recorded, illustration. The class is drawn as a glyph and a border style, so it does not depend on colour.
- **No safety ratings, no probabilities, no partial-gravity predictions.** Models give bounds and say what they assume.
- **Static first.** Deterministic results are computed at build time and served as files.

## Run it

```bash
# 1. fetch from NASA (3 to 4 minutes; Python 3.9+, no packages needed)
python pipeline/sync_nasa.py --out nasa_raw

# 2. derive the site's data from the raw cache (stops if a file no longer matches its hash)
python pipeline/derive.py --raw nasa_raw

# 2b. build the model artifacts (needs: pip install cantera numpy)
python pipeline/build_models.py

# 3. the site
cd web && npm ci && npm run dev        # or: npm run build
```

Tests: `PYTHONPATH=pipeline python -m unittest discover -s pipeline/tests` and `cd web && npm test` (91 and 221 tests on 15 November). The derivation ends with an integrity check of its own output (1,997 checks).

Laboratory (15 November): `PYTHONPATH=pipeline python pipeline/train_flex.py` retrains the FLEX regressor and writes its model card; `python tools/release/sign_release.py` signs the release with a key kept outside the repository (`--verify-only` checks one).

## Data, credit and licence

- NASA Physical Sciences Informatics (PSI): https://psi.nasa.gov. Each investigation is cited by its DOI on the page that shows it.
- Thermochemistry: GRI-Mech 3.0 with Cantera.
- Typefaces: B612 and B612 Mono (Airbus, Intactile Design; OFL), STIX Two Text (STI Pub; OFL).
- Code: MIT, see [`LICENSE`](LICENSE). NASA data keeps the licence stated in its PSI record.

## Use of AI

AI tools (Claude, by Anthropic) assisted with software development during 14 and 15 November 2026; details in [`docs/AI_USE.md`](docs/AI_USE.md). Numbers come from deterministic code. The flame drawings are schematics made in code and are marked as illustrations.
