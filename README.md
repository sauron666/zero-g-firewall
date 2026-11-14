# Zero-G Firewall

**Live site:** https://sauron666.github.io/zero-g-firewall/ (built from `main` by GitHub Actions; works offline once loaded, needs no key and no server)

**Kill the fans?** Stop the air and a fire in free fall should starve: when NASA cut the airflow under a flame in the BASS-II experiment, it went out within two seconds. NASA's own guide still lists "A fire will self-extinguish if ventilation is shut off" as a misconception, and on the Moon gravity keeps the air moving.

Zero-G Firewall makes NASA's microgravity combustion evidence findable, ranked and checkable, and asks the next question: can you trust the alarm that shuts off your air?

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
docs/                     decisions, status, official resources, AI use
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

Tests: `python -m unittest discover -s pipeline/tests` and `cd web && npm test`.

## Data, credit and licence

- NASA Physical Sciences Informatics (PSI): https://psi.nasa.gov. Each investigation is cited by its DOI on the page that shows it.
- Thermochemistry: GRI-Mech 3.0 with Cantera.
- Typefaces: B612 and B612 Mono (Airbus, Intactile Design; OFL), STIX Two Text (STI Pub; OFL).
- Code: MIT, see [`LICENSE`](LICENSE). NASA data keeps the licence stated in its PSI record.

## Use of AI

AI tools (Claude, by Anthropic) assisted with software development during 14 and 15 November 2026; details in [`docs/AI_USE.md`](docs/AI_USE.md). Numbers come from deterministic code. The flame drawings are schematics made in code and are marked as illustrations.
