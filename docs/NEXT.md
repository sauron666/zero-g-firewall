# What to build next, in order

## Hand-off (14 November, evening): start here

The site is live from `main` at https://sauron666.github.io/zero-g-firewall/. All 28 must-have features of `docs/COVERAGE.md` are done. Tests: 62 Python, 114 TypeScript, all passing; the integrity check runs 1,758 checks at each derivation.

**Which raw cache.** Since 14 November 17:20 the site is built from the larger cache: 4,959 files, 330.9 MB, folder `nasa_raw2` on the team's machine, written by `sync_nasa_async.py` 2.0.0. The repository tracks that cache's ledger at `nasa_raw/ledger/ledger.jsonl` and its report at `nasa_raw/sync_report.json`. On the team's machine derive with `python pipeline/derive.py --raw nasa_raw2`, or rename the folders so that `nasa_raw2` becomes `nasa_raw`. The older, smaller folder no longer matches the tracked ledger.

**Direction set by the team on 14 November, 16:25. Keep to it.** Show the engineering, demonstrate the science, let the results speak. The look is a flight deck (`docs/DESIGN.md`, `web/src/styles/deck.css`): mission control as the opening page, readings at the head of a page, ISKRA as a conversation on every page. The interface does not talk about how it was built: one sentence on the Method page, details in `docs/AI_USE.md`. Lead with results; state a real limit once, beside the result; fold explanations of the machinery into "How it works". Reference pages for engineers stay last in the navigation.

Do next, in this order:

0. **Add `sync_nasa_async.py` to `pipeline/` and commit it.** The ledger and the sync report name it (version 2.0.0, script SHA-256 `1bdb439dd71390b6715abc849e8001835504d86c3957aa1ac343bf6c9bb898d8`), and a reader who follows a receipt should find the tool that fetched the file. Then change rule 1 of `CLAUDE.md` and the README to name both scripts.
1. **On the machine that holds the cache (it has NASA access):** run `python pipeline/sync_nasa.py --out nasa_raw2` once (version 1.2.0 adds NASA's fire protection brief and one NTRS record; it appends to the same ledger), then `python pipeline/derive.py --raw nasa_raw2`. Look at `matrix.waiting_for_sync` in the output: it must be empty. Open the stored text of `doc:std3001_fire_protection_brief` and compare it with the three quotations declared for `BRIEF` in `pipeline/zgf/matrix.py`; they were typed from a web summary and may not match word for word. Correct them until `quotes_verified` equals `quotes`. The opening page then states the station's own procedure with a receipt (the logic is already in `web/src/pages/Home.tsx`). Commit the new ledger, sync report and data files together.
2. Done on 14 November, evening, and live: the controls view on the Fire matrix page (B13), the nearest tests to a design point with a CSV on the Atmosphere map (B23), and the brief for a mission on the ranking page (B15).
3. Still open, by value: a sensor and measurement inventory across the records (B11: which table states oxygen, pressure, flow, temperature, gases, particle size; the column profiles in `profiles.json` hold what is needed); a signed release (K03); detector evidence cards for SAME, SAME-R and DAFT (E01). ISS live telemetry (M01) only if it can be tested against the real feed.
4. Polish worth doing if time remains: readings at the head of the remaining pages (`Readings` and `Tile` in `web/src/dash/widgets.tsx`), and a pass over long paragraphs on the Alarm, Ledger and Data pages: lead with the result, fold the rest.

Deliverables that must follow the site: the 30-second video (`node tools/video/record.mjs web/dist out_dir`, about four minutes for all ten scenes; `--only=3,6` renders single scenes again; captions read their numbers from the build), the pitch slides and the jury questions (links are with the team). Re-record after any change a viewer would see. Sunday: freeze around 11:00, video due 14:00, submit before 22:00.

Checks before every push: `python -m unittest discover -s pipeline/tests`, `cd web && npx tsc --noEmit -p . && npx vitest run && npx vite build`, then look at the changed page at 1440 px and 390 px in both themes.

**Read `docs/COVERAGE.md` first.** It lists all 130 planned features with their true state and the order of work agreed with the team on 14 November at 14:25. The pitch: a 30-second video on Sunday at 14:00; the best five teams then present for 3 minutes and answer the jury for 5. The recorder for the video is `tools/video/record.mjs`.

Clock: the event ends Sunday 15 November 2026 at 23:59 Sofia time. Freeze features on Sunday around 11:00, submit at least two hours before the deadline. Ask the human when the local pitch is.

Acceptance rows (Q01 to Q35) are in `docs/pack/04_TESTS_SUBMISSION_PLAYBOOK.md`; feature IDs (A01, B04...) in `docs/pack/01_MASTER_SPEC.md`; facts and check values in `docs/pack/05`, `06` and `10`.

## What the larger cache opens up (14 November, evening)

Done with it: the Saffire-III recording on the Alarm page and the opening page (`pipeline/zgf/recorded.py`); NASA's reported numbers for Saffire IV to VI, LUCI and FM2 (`pipeline/zgf/reported.py`), drawn on the Alarm page, the coverage chart and the atmosphere map; what the ledger holds of each record, on its page.

Not used yet, in order of value:

- **SAME and SAME-R analysed data** (`PSI-101_Analyzed Data_SAME, SAME-R_Results.xlsx` and the per-run workbooks in PSI-101 and PSI-102): detector responses and particle sizes by material. This is the material for detector evidence cards (E01). The derivation uses the standard library only, so reading `.xlsx` needs a small reader or a new dependency in CI.
- **BASS-II test matrices** (`PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx`): per test, the sequence of flow settings and the gas readings before and after, for example carbon monoxide at the start and the end. Some notes say a flow was lowered "to ext". Do not turn free-text notes into an outcome column without a rule that a reader can check.
- **PSI-117 analysed CSV files** (burning histories, extinction diameters, average burning rates): a second check for the droplet panel. Keep experiment and simulation rows apart.
- **Raw time series of CFI, CFI-G, s-Flame and Flame Design** (about 4,300 small text and CSV files): one trace per test point. A viewer on the record page would need a rule for which file belongs to which row of the experimental table.
- **PSI-179, the Aerosol Sampling Experiment** (cabin dust on the station): outside the combustion search by NASA's own research area. It bears on false alarms; use its text only with that scope stated.

## The twelve stops (protect these above everything else)

1. Overview with real counts and the "fetched from NASA" time. *(done)*
2. Myth card 2: "a fire will self-extinguish if ventilation is shut off": where it held, where NASA's sources say it may not, what is open. *(done: Myths and evidence)*
3. The same question in the evidence Q&A, every sentence cited to a row or a page. *(done: Ask ISKRA, and the conversation on every page)*
4. Atmosphere map: real test points, the lunar-habitat region, the empty partial-gravity cell, the Apollo 1 historical point, the ISS point live when the feed is up. *(done, except the live point)*
5. Ranking for a lunar habitat with the breakdown and the stability figure. *(done)*
6. What varied in one investigation, and the sensor inventory. *(what varied: done on every record card)*
7. Parity plot of the flame model against NASA's own `Tad` column, with N and error. *(done: 587 rows, 2.1 K mean)*
8. "A fan you cannot switch off". *(done: Flame physics page)*
9. Alarm trust lab: a spoofed reading flagged, the detector-lineage chart, the cost of acting.
10. A provenance receipt opened from a chart, and the signed release verified in the browser. *(receipts and the chain check: done; signature: not yet)*
11. Official Resources Coverage: ten of ten. *(done: Incidents and Earth uses, section coverage)*
12. Limits and AI disclosure. *(done: Method and limits page)*

Already built and to keep working: the opening scene with the fan switch, **Two realities (the Fan Paradox)**, Flame physics.

## Where the build stood (14 November, early afternoon; kept for the data notes below)

Done and deployed from `main`: sync and ledger, derivation stages 1 and 2, the literature layer with the quotation check, and these pages on real data: Investigations with record cards, Atmosphere map, Myths and evidence, Evidence ledger (chain re-computed in the browser), Data and models (curator report, model check), Flame physics with the parity plot. `docs/IMPLEMENTATION_STATUS.md` has the exact list.

The raw cache is not in the repository. To re-derive, put the team's core archive (`zgf_raw_core_*.zip`, unpacked) in `nasa_raw/` or run `python pipeline/sync_nasa.py`, then `python pipeline/derive.py --raw nasa_raw`. The derivation needs `pypdf` and, for the model check, `cantera`.

### What the real data taught us (read before touching the tables)

- Counts: 26 search hits, 24 combustion records (19 flight, 5 ground), 25 experimental tables in 22 records, 2,009 in-scope rows. PSI-60, 62, 115 and 117 have no experimental table. PSI-108 and PSI-181 are search noise and are shown as set aside.
- The CFI-G inverse-flame file has 861 empty lines after 154 data rows. FLEX is Windows-1252, uses an en dash for "no value", and its headers lost their subscripts (O, N, CO for O2, N2, CO2); they are **not** cut at 40 characters, as a pre-event note claimed.
- Spreadsheet fill series corrupted two text columns (PSI-21 "Fuel Bottle": CH4 to CH14; PSI-23 "Atmosphere": N2 to N6). Use only the first value of each run.
- NASA's `Tad` in PSI-159 is a one-atmosphere value; in PSI-10 it follows the row's pressure. `validation.json` holds both.
- BASS-II and Saffire tables record oxygen but not pressure. They are never placed at an assumed pressure.
- PSI's thumbnail address returns the same image for all 26 records, so thumbnails are not used.
- The statement that BASS-II flames always quenched when the fan stopped is from ICES-2019-101, which is not in the ledger. Add its NTRS record to `sync_nasa.py` and fetch it before using that wording. Four NTRS full texts failed to download (see `nasa_raw/sync_report.json`); their abstracts are in the ledger.
- `.xls` attachments (DAFT summary, SPICE flame length) need `xlrd`; `.xlsx` need `openpyxl`. Neither is parsed yet.

## Gate 2: what is left of the challenge core

1. ~~Ranking for a mission~~ done (`pipeline/zgf/rank.py`, `web/src/lib/rank.ts`, page Rank). Still open there: a nearest-evidence finder at row level.
2. ~~Gaps and plans~~ done (`pipeline/zgf/lessons.py`, page Gaps).
3. ~~Official Resources Coverage and Incidents and Earth uses~~ done (page Lessons, section "coverage"): 10 of 10. PSI-179 (Aerosol Sampling Experiment) answers the search "smoke" but not "combustion"; it is listed as outside the search and was not fetched (`python pipeline/sync_nasa.py --extra PSI-179` would add it if it turns out to matter for the alarm lab).
4. ~~Evidence Q&A~~ done (`pipeline/zgf/index.py`, `web/src/lib/search.ts`, `lib/ai.ts`, page Ask): offline engine, checker, connectors for local and cloud models, hybrid. Still open: try the connectors against live services (a local Ollama and one cloud key), an evaluation scorecard (gold, adversarial, abstention sets) shown on the page, and an in-browser model if time allows.
5. Tidy CSV exports with a data dictionary; sensor and hardware inventory from metadata and the guide's appendix.

## Gate 3: differentiators

12. **Alarm trust lab** (`web/src/trust/`, page Alarm). Synthetic telemetry from a seeded generator; frames signed in the browser (Ed25519 through WebCrypto, with a fallback); checks for signature, sequence, freshness and physical plausibility (arrival times against the transport solver); triage that keeps several hypotheses open (fire, pyrolysis, dust, sensor fault, tampering) with reasons for and against, never a probability. Scenarios: real fire, dust, overheated wire, stuck sensor, spoofed reading, replayed frames, time shift. Rule under test: **an integrity anomaly never suppresses a fire alarm**. Scorecard over seeded runs. Detector lineage and the particle-size chart (SAME-R rows against each detector generation's stated range). Cost-of-action panel. SPARTA identifiers for the tampering scenarios are in `docs/pack/06` section 4 (Q17, Q18, Q33).
13. **AI layer** (`web/src/ai/`, page Ask). Four modes, chosen in a settings drawer, always shown in the top bar:
    - *Offline engine* (default, no model): the deterministic answerer of step 11.
    - *Local model*: an OpenAI-compatible endpoint on the user's machine (default `http://localhost:11434/v1`, model name editable) and, where WebGPU exists, an in-browser model through `@mlc-ai/web-llm` loaded on demand with the model list taken from the library at run time. The story: a habitat may have no link to Earth.
    - *Cloud models*: Anthropic, OpenAI, Google and any OpenAI-compatible endpoint, with keys typed by the user and kept only in that browser, or through the optional proxy in `edge/`. Model identifiers are editable settings, not constants.
    - *Hybrid*: the local model drafts, a cloud model checks, and the deterministic verifier judges.
    Every mode gets the same contract: answer only from the retrieved chunks, cite chunk ids, say "insufficient evidence" otherwise. After generation the verifier drops any sentence whose citation does not resolve or whose numbers are not in the cited chunk. Retrieved text is data, never instruction. Publish an evaluation scorecard: gold, adversarial (prompt injection, poisoned document) and abstention sets (Q12, Q22).
14. ~~Falsification engine~~ done in its deterministic form (`pipeline/zgf/falsify.py`, `web/src/lib/falsify.ts`, page Falsify). Open: counter-arguments proposed by a second model, each kept only if the checker can attach evidence; more conclusions as pages are added (each new page should add the conclusion it draws).
15. **Matrix and playbooks**; **ISS live telemetry** (Lightstreamer, units verified, feed health, labelled recording as fallback) on the atmosphere map; partial-gravity bounding additions; gap-to-plan visual.

## Gate 4: breadth

16. **Companion ISKRA** (`docs/pack/09_MASCOT_BRIEF.md`): original, procedural, driven by the same flame model as the opening scene; points at cited sources; ring pattern shows the data class. The watermarked pre-event concept preview must not be used or copied.
17. **Judge tour** (`#tour`): the twelve stops in 60 to 90 seconds, each captioned with the challenge verb it serves, working offline.
18. Model bridge (Cantera and FDS decks labelled untested unless run), tidy exports with a data dictionary, signed release verified in the browser, Earth view polish.

## Gates 5 and 6

Freeze, run every test, record the demo from real screens, tag a release, fill the project page from `docs/pack/08_PITCH_DEMO_SUBMISSION.md` section 9, submit, confirm.

## If time is short, cut in this order

XR, FDS run, MCP server, narration, companion extras, 3-D habitat, flame vision, tension finder, next-best experiment, Bulgarian toggle. Never cut: PSI sync and provenance, cards, ranking, compare, what-varied, atmosphere map, gaps, cited Q&A, one validated physics result, three alarm scenarios, resource coverage, Myth card 2, AI disclosure, submission.
