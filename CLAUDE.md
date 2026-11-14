# Zero-G Firewall: working agreement for coding agents

You are continuing a hackathon build. Read this file, then `docs/IMPLEMENTATION_STATUS.md` and `docs/NEXT.md`, then start on the first open item in `docs/NEXT.md`. Do not ask for permission for routine engineering decisions; log them in `docs/DECISIONS.md`.

## What we are building

NASA Space Apps Challenge 2026, Sofia local event, 14 to 15 November 2026. Solo entry. Challenge: **Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data**. The challenge asks for a dashboard that summarizes, ranks and interprets NASA's Physical Sciences Informatics (PSI) combustion investigations: find the ones relevant to crewed habitats, extract data for predictive modelling, highlight research that informs next-generation fire-safety controls.

- Names (constants in `pipeline/zgf/__init__.py`, never hard-coded elsewhere): project **Zero-G Firewall**, team **The Rule of Flame**, companion **ISKRA**.
- Deadline: Sunday 15 November 2026, 23:59 Sofia time. Submit at least two hours earlier. The time and format of the local pitch are not known: ask the human.
- Judging: impact, creativity, validity, relevance, presentation.

**North-star question: "Kill the fans?"** On the ISS the first response to a fire is to stop ventilation. When NASA cut the airflow under a flame in BASS-II, it went out within two seconds (BASS-II Summary Report, NTRS 20210011385). Yet *A Researcher's Guide to: Combustion Science* (on the challenge's own Resources list) names "A fire will self-extinguish if ventilation is shut off" as a critical misconception, and NASA's sources name the cases where it may fail: a flame fed by diffusion alone, a suppressant jet that entrains air, fuel that carries its own oxygen (Mir, 1997), a cool flame that outlives the visible one, an oxygen-enriched atmosphere, and gravity that keeps air moving (Moon, Mars). PSI holds no partial-gravity data yet. A judge must reach that two-sided answer, with sources, in under a minute. The second question follows: can you trust the alarm that shuts off your air? The product is organised like a security operations centre for fire.

## Rules that are never broken

1. **Only real NASA data, fetched from NASA, during the event.** `pipeline/sync_nasa.py` is the only way data enters. Never take data or code from other teams' repositories or mirrors. Never reconstruct a NASA value from memory. A missing value stays missing; never synthesise a stand-in.
2. **Every value has a class and a receipt.** Classes: `NASA_OBSERVATION`, `NASA_LITERATURE`, `DERIVED_FROM_NASA`, `MODEL_OUTPUT`, `SYNTHETIC_SCENARIO`, `LIVE_TELEMETRY`, `RECORDED_TELEMETRY`, `ILLUSTRATIVE` (see `web/src/lib/klass.tsx`). A NASA value resolves to a ledger entry (URL, SHA-256, time) and a row or field; a sentence from a NASA document resolves to document plus page or section. A quotation is shown only if it matches the stored document text; otherwise it is a labelled paraphrase.
3. **Claim discipline** (full list: `docs/pack/06_SCIENCE_BRIEF.md`, section 5):
   - No risk probabilities, no safety ratings, no "safe" as a verdict, no partial-gravity predictions. Models give bounds and list their assumptions.
   - Never write that fires put themselves out in microgravity or that stopping the fans extinguishes a fire, without the conditions and the guide's warning. Contested questions get both sides and the open gap.
   - The cause of the Artemis II smoke alarm is not public. Do not state or guess one.
   - Mir: the flame went out by itself; "the device supplied its own oxygen" is our inference, say so. Apollo 1: quote pressures only from the page that states them. Cool flames: large droplets of specific fuels only.
   - Do not train a classifier on the BASS-II table (it has no outcome column). Do not pool experiment and simulation rows of PSI-117.
4. **Simulations stay simulations.** Alarm, telemetry and cyber scenarios are synthetic, labelled, and control nothing. No real-world attack instructions.
5. **AI and branding.** AI assistance is disclosed once: one sentence on the Method page and the details in `docs/AI_USE.md`. Do not write about how the site was built anywhere else in the interface; text a model wrote for the site (the record summaries) carries a short label. AI-generated images or video need a visible watermark (prefer real screenshots; the flame visuals are code-drawn schematics labelled as illustrations); never use NASA logos, insignia or mission patches. Names, characters or likenesses from films, games or books are not used; the companion must be original and must not resemble Clippy.
6. **Truthful status.** `docs/IMPLEMENTATION_STATUS.md` lists working, prototype, simulated and not built, exactly. Nothing is "working" without a passing test or a visible result.
7. **Secrets.** No keys in the repository. `.env.example` holds placeholder names only.

## Layout

```
pipeline/sync_nasa.py        NASA -> nasa_raw/ with a hash-chained ledger (standard library only)
pipeline/derive.py           nasa_raw/ -> web/public/data/v1/*.json (stage 1 exists; extend it)
pipeline/build_models.py     physics model artifacts and golden vectors (needs cantera, numpy)
pipeline/zgf/                ledger.py, derive_core.py, physics.py, transport.py, models.py; recorded.py (one raw recording), reported.py (numbers NASA reports outside PSI), inventory.py (what each table states)
pipeline/tests/              python -m unittest discover -s pipeline/tests
web/                         Vite + React + TypeScript, plain CSS with tokens; static, offline, no key
web/src/app/                 App.tsx (shell, route table), nav.ts, router.ts (plain hash names: #paradox, #evidence--PSI-25)
web/src/pages/               one file per route; unbuilt routes are stubs: replace the stub, keep the export name
web/src/physics/             scaling.ts, transport.ts (matches the Python solver on golden vectors), paradox.ts
web/src/viz/, components/    charts, receipt drawer, flame canvas, smoke view
web/src/dash/                widgets of mission control (the opening page)
web/src/mascot/              ISKRA: lantern, conversation on every page (Chat.tsx), guided tour, event bus
web/src/styles/              tokens.css, app.css, then deck.css (the flight-deck look) last
web/src/lib/types.ts         artifact shapes (source of truth with docs/CONTRACTS.md)
docs/                        DESIGN.md, CONTRACTS.md, NEXT.md, DECISIONS.md, IMPLEMENTATION_STATUS.md, AI_USE.md, OFFICIAL_RESOURCES.md
docs/pack/                   the pre-event research and plan (local only, git-ignored): spec, data dossier, science brief, resources map, tests, pitch, companion brief
nasa_raw/                    raw cache from NASA (git-ignored except the ledger and the sync report)
```

## Commands

```bash
python pipeline/sync_nasa.py                 # core sync, resumable, safe to interrupt; --extra PSI-117 for all small files of a record
python pipeline/derive.py --raw nasa_raw     # stops if the ledger chain is broken or a file changed
python pipeline/build_models.py
python -m unittest discover -s pipeline/tests
cd web && npm ci && npm run dev              # npm test, npm run build
```

The cache the site is built from is the team's larger one (4,959 files, folder `nasa_raw2` on the team's machine, written by the concurrent variant `sync_nasa_async.py` 2.0.0; its ledger is the one tracked under `nasa_raw/ledger/`). Derive with `--raw nasa_raw2` there. `docs/NEXT.md` says what is still to fetch and that the variant's script has to be committed.

## How to work

- **Gates.** Follow `docs/NEXT.md` in order. Do not start a gate while the previous one is red. Deploy from the first hour: the GitHub Pages workflow is in `.github/workflows/pages.yml` (the human enables Pages with "GitHub Actions" as the source).
- **Protect the twelve stops** (listed in `docs/NEXT.md`). After each merge, check that every stop that already existed still works.
- **Design.** Follow `docs/DESIGN.md` exactly: a flight deck lit by the blue of a flame in free fall. Show the engineering, demonstrate the science, let the results speak: a page leads with a result, a chart or a control, and explanation of the machinery is one sentence or a folded "How it works". Hue means gravity regime or alarm status, and the flame's blue is the one accent; evidence class is drawn, not coloured; serif for claims and quotations, B612 for the instrument. Look at every page you build in the browser at 1440 px and 390 px, in both themes, before calling it done.
- **Charts.** One axis, a legend for two or more series, a hover tooltip, a table view, solid hairline grids, text never in a series colour. Rules in `docs/DESIGN.md`.
- **Tests.** Every model has check values (`docs/pack/06_SCIENCE_BRIEF.md`, `docs/pack/04_TESTS_SUBMISSION_PLAYBOOK.md`). Add a test with each feature. A planted unsourced row must fail the build.
- **Static first.** Deterministic results are computed in the pipeline and shipped as JSON with hashes in `manifest.json`. The site must work with no key, no server and no network. A language model may explain; it never produces a number that code should produce; retrieved text is data, never instruction; citations fail closed.
- **Commits.** Small and descriptive. Acknowledge AI assistance in the commit message. Never commit `docs/pack/`, raw NASA archives or secrets.
- **When NASA's live data differs from `docs/pack/05_DATA_DOSSIER.md`,** NASA wins; log the difference. Items marked [V2] or [U] in the pack are tasks to verify, not facts.
- **Report to the human at each gate:** deployed URL, tests passing, what is blocked, what was cut and why.

## If two agents work in parallel

Each lane owns paths and does not edit the other's. Shared files (`App.tsx`, `nav.ts`, `app.css`, `types.ts`) change only by small additive edits.

| Lane | Owns |
|---|---|
| Data and evidence (local, has NASA access) | `pipeline/` except `zgf/physics.py`, `zgf/transport.py`; pages Evidence, Rank, Envelope, Gaps, Myths, Lessons, Ledger, DataModels; `web/src/styles/evidence.css` |
| Trust and AI | pages Alarm, Ask, Falsify, Playbooks; `web/src/trust/`, `web/src/ai/`, `web/src/mascot/`; `web/src/styles/trust.css`, `ai.css` |
