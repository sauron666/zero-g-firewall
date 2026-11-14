# What to build next, in order

Clock: the event ends Sunday 15 November 2026 at 23:59 Sofia time. Freeze features on Sunday around 11:00, submit at least two hours before the deadline. Ask the human when the local pitch is.

Acceptance rows (Q01 to Q35) are in `docs/pack/04_TESTS_SUBMISSION_PLAYBOOK.md`; feature IDs (A01, B04...) in `docs/pack/01_MASTER_SPEC.md`; facts and check values in `docs/pack/05`, `06` and `10`.

## The twelve stops (protect these above everything else)

1. Overview with real counts and the "fetched from NASA" time. *(done)*
2. Myth card 2: "a fire will self-extinguish if ventilation is shut off": where it held, where NASA's sources say it may not, what is open. *(done: Myths and evidence)*
3. The same question in the evidence Q&A, every sentence cited to a row or a page. *(done: Ask the evidence)*
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

## Where the build stands (14 November, early afternoon)

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
