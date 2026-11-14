# What to build next, in order

Clock: the event ends Sunday 15 November 2026 at 23:59 Sofia time. Freeze features on Sunday around 11:00, submit at least two hours before the deadline. Ask the human when the local pitch is.

Acceptance rows (Q01 to Q35) are in `docs/pack/04_TESTS_SUBMISSION_PLAYBOOK.md`; feature IDs (A01, B04...) in `docs/pack/01_MASTER_SPEC.md`; facts and check values in `docs/pack/05`, `06` and `10`.

## The twelve stops (protect these above everything else)

1. Overview with real counts and the "fetched from NASA" time. *(page exists; fills from `manifest.nasa`)*
2. Myth card 2: "a fire will self-extinguish if ventilation is shut off": where it held, where NASA's sources say it may not, what is open.
3. The same question in the evidence Q&A, every sentence cited to a row or a page.
4. Atmosphere map: real test points, the lunar-habitat region, the empty partial-gravity cell, the Apollo 1 historical point, the ISS point live when the feed is up.
5. Ranking for a lunar habitat with the breakdown and the stability figure.
6. What varied in one investigation, and the sensor inventory.
7. Parity plot of the flame model against NASA's own `Tad` column, with N and error.
8. "A fan you cannot switch off". *(done: Flame physics page)*
9. Alarm trust lab: a spoofed reading flagged, the detector-lineage chart, the cost of acting.
10. A provenance receipt opened from a chart, and the signed release verified in the browser.
11. Official Resources Coverage: ten of ten.
12. Limits and AI disclosure. *(done: Method and limits page)*

Already built and to keep working: the opening scene with the fan switch, **Two realities (the Fan Paradox)**, Flame physics.

## Gate 1: real NASA data on the site (do this first)

1. `python pipeline/sync_nasa.py` in the project folder (resumes the existing `nasa_raw/`). Read `nasa_raw/sync_report.json`; investigate failures; note anything PSI now returns for Saffire IV to VI, LUCI, FM2 or SoFIE (`psi/search_*.json`).
2. `python pipeline/derive.py --raw nasa_raw`. Fix whatever the real files break in `pipeline/zgf/derive_core.py` (it was written against the documented structure and tested only on a fixture). Compare counts with `docs/pack/05_DATA_DOSSIER.md` section 1 (26 hits; tables of about 2,860 rows) and log every difference.
3. Pages: **Investigations** (explorer with search and facets: gravity, hardware family, pillar, in or out of scope; a card per investigation at `#evidence--PSI-25` with purpose, hardware, people, publications, the file inventory, the table preview with row receipts, the scope decision) and **Evidence ledger** (entries, chain status, filter by kind, verify a hash). Show PSI-108 and PSI-181 as "search noise, excluded, here is why" rather than hiding them.
4. Commit, push, enable GitHub Pages, check the public URL in a private window.

Done when Q01 to Q05 and Q07 hold.

## Gate 2: the challenge, complete

5. **Canonical tables** (`tables_canonical/`): typed columns, units, conversions; the pitfalls in `docs/pack/05` section 1.4 become tests and **curator findings** (`curator_report.json`, page "Data and models").
6. **What varied / what stayed constant** per investigation, computed from the tables (Q06); **sensor and hardware inventory** from metadata plus the Researcher's Guide appendix (as literature).
7. **Atmosphere map** (`envelope.json`): every row with oxygen and pressure; habitat presets and the normoxic curve from `model/atmospheres.json`; historical points and facility ranges as literature layers drawn differently; gaps visible (Q10, Q11).
8. **Ranking** with mission lenses (ISS, lunar habitat, Mars habitat, pressurised rover, suit), transparent factors, sliders, breakdown, matched and unmatched, and **rank stability** under seeded weight perturbations (Q08, Q32). **Compare** two or three investigations (Q09). **Nearest-evidence finder** at row level: match, near, different, not recorded; never a probability (Q31).
9. **Literature layer**: extract text per page (pypdf for the guide and fact sheets) and per section (web pages) into `literature/passages.json`. Then build the content of `docs/pack/10_OFFICIAL_RESOURCES_MAP.md` section 4: **Myth vs Evidence** (three cards; card 2 first), **Official Resources Coverage**, **incident timeline**, **Earth applications**, **gap-to-plan map**. Every quotation in that file is a claim to verify against the stored text, with printed page and PDF page; what does not match becomes a labelled paraphrase (Q29, Q30, Q34, Q35).
10. **Flame model validated against NASA**: run `physics.adiabatic_T` and `stoich_mixture_fraction` on the rows of the PSI-10 and PSI-159 tables that carry `Tad` and `Zst`; publish per-row differences, N, mean, median and maximum; draw the parity plot on the Flame physics page. A pre-event feasibility check on mirrored data saw about 4 K mean difference on 127 ethylene rows; a much larger number means the reference temperature or the stream definitions are wrong (Q14). Droplets: burn time against d0²/K on FLEX rows, reported with N and error.
11. **Evidence Q&A, deterministic first** (`index.json`, BM25 in the browser, extractive answers with citations, abstention, curated two-sided answers for the three misconceptions) (Q12, Q13).

## Gate 3: differentiators

12. **Alarm trust lab** (`web/src/trust/`, page Alarm). Synthetic telemetry from a seeded generator; frames signed in the browser (Ed25519 through WebCrypto, with a fallback); checks for signature, sequence, freshness and physical plausibility (arrival times against the transport solver); triage that keeps several hypotheses open (fire, pyrolysis, dust, sensor fault, tampering) with reasons for and against, never a probability. Scenarios: real fire, dust, overheated wire, stuck sensor, spoofed reading, replayed frames, time shift. Rule under test: **an integrity anomaly never suppresses a fire alarm**. Scorecard over seeded runs. Detector lineage and the particle-size chart (SAME-R rows against each detector generation's stated range). Cost-of-action panel. SPARTA identifiers for the tampering scenarios are in `docs/pack/06` section 4 (Q17, Q18, Q33).
13. **AI layer** (`web/src/ai/`, page Ask). Four modes, chosen in a settings drawer, always shown in the top bar:
    - *Offline engine* (default, no model): the deterministic answerer of step 11.
    - *Local model*: an OpenAI-compatible endpoint on the user's machine (default `http://localhost:11434/v1`, model name editable) and, where WebGPU exists, an in-browser model through `@mlc-ai/web-llm` loaded on demand with the model list taken from the library at run time. The story: a habitat may have no link to Earth.
    - *Cloud models*: Anthropic, OpenAI, Google and any OpenAI-compatible endpoint, with keys typed by the user and kept only in that browser, or through the optional proxy in `edge/`. Model identifiers are editable settings, not constants.
    - *Hybrid*: the local model drafts, a cloud model checks, and the deterministic verifier judges.
    Every mode gets the same contract: answer only from the retrieved chunks, cite chunk ids, say "insufficient evidence" otherwise. After generation the verifier drops any sentence whose citation does not resolve or whose numbers are not in the cited chunk. Retrieved text is data, never instruction. Publish an evaluation scorecard: gold, adversarial (prompt injection, poisoned document) and abstention sets (Q12, Q22).
14. **Falsification engine** (page Falsify): for any conclusion (from a myth card, an answer or typed in), search for the conditions under which it fails. Deterministic core: each claim has a scope (gravity, oxygen, pressure, flow, fuel type, oxidizer path); the engine lists (a) evidence that limits or contradicts it, with sources, (b) scope dimensions the evidence never tested (from `gaps.json`), (c) the planned experiment that could falsify it (from `planned_experiments.json`). Verdicts are "holds within the tested scope", "limited by", "contradicted by", "untested". With a model available, a second model proposes counter-arguments; each is kept only if the verifier can attach evidence, otherwise it is listed as an untested idea.
15. **Matrix and playbooks**; **ISS live telemetry** (Lightstreamer, units verified, feed health, labelled recording as fallback) on the atmosphere map; partial-gravity bounding additions; gap-to-plan visual.

## Gate 4: breadth

16. **Companion ISKRA** (`docs/pack/09_MASCOT_BRIEF.md`): original, procedural, driven by the same flame model as the opening scene; points at cited sources; ring pattern shows the data class. The watermarked pre-event concept preview must not be used or copied.
17. **Judge tour** (`#tour`): the twelve stops in 60 to 90 seconds, each captioned with the challenge verb it serves, working offline.
18. Model bridge (Cantera and FDS decks labelled untested unless run), tidy exports with a data dictionary, signed release verified in the browser, Earth view polish.

## Gates 5 and 6

Freeze, run every test, record the demo from real screens, tag a release, fill the project page from `docs/pack/08_PITCH_DEMO_SUBMISSION.md` section 9, submit, confirm.

## If time is short, cut in this order

XR, FDS run, MCP server, narration, companion extras, 3-D habitat, flame vision, tension finder, next-best experiment, Bulgarian toggle. Never cut: PSI sync and provenance, cards, ranking, compare, what-varied, atmosphere map, gaps, cited Q&A, one validated physics result, three alarm scenarios, resource coverage, Myth card 2, AI disclosure, submission.
