# Implementation status

Updated: 14 November 2026, 13:07 Sofia time. Kept truthful: nothing is listed as working without a passing test or a visible result.

## Working

| Part | Evidence |
|---|---|
| NASA sync script (`pipeline/sync_nasa.py`, 1.1) | Logic tested against a local mock of the endpoints: version fallback, signed links, caching, ledger chain, core selection, budgets, interrupt, pack-only. Run against NASA by the team on a laptop: version 1.0 worked but fetched far too many small files (over 300 MB); 1.1 limits the core set. **The cloud build environment itself has no route to nasa.gov.** |
| Ledger tools and derivation stage 1 (`pipeline/zgf/ledger.py`, `derive_core.py`) | Chain verification, hash check on every read, investigations, tables as text, resource registry, public ledger, manifest. 3 tests on a throw-away fixture, including a changed byte and an edited ledger line. Run on the real cache of 14 November: 1,219 ledger entries with an intact chain, 26 investigations (24 in scope, 2 excluded with reasons), 25 experimental tables parsed (2,092 rows; 2,009 in scope). |
| Closed-form physics and equilibrium thermochemistry | 16 Python tests reproduce the check values (LUCI spin, buoyant flow ranges, Coriolis fractions, normoxic curve, cabin bounds, methane flame temperatures). |
| Tracer-transport solver, browser and Python | The TypeScript solver matches the Python reference on three golden cases to 1e-9; mass balance, positivity, walls and open ends are tested. 20 TypeScript tests. |
| Model artifacts (`web/public/data/v1/model/*.json`) | Built by `pipeline/build_models.py`; listed with SHA-256 in `manifest.json`. |
| Site shell, light and dark themes, phone layout | Screens reviewed at 1440 px and 390 px; no horizontal overflow; no console errors. |
| "Kill the fans?" opening with the fan switch | Flames follow gravity and forced flow; the station flame carries the "not a rule" wording. Illustration. |
| Two realities (the Fan Paradox) | Two simulations from the same start, one time slider, detector readings, a comparison table, and an ensemble over flame responses, mixing, alarm level and buoyant speed. Model, illustrative. |
| Flame physics page | Atmospheres chart with table view, "a fan you cannot switch off", spinning-platform calculator, cabin bounds. |
| Method and limits page | Classes, limits, AI use. |

## Data is in, pages not built yet (nothing is shown in their place)

Investigations and cards, what varied, ranking with stability, compare, atmosphere map with real test points, gaps and plans, Myth vs Evidence with verified quotations, Official Resources Coverage, incident timeline, Earth applications, ledger page, validation of the flame model against NASA's own columns, tidy exports, curator report.

## Next in the build order

Alarm trust lab (synthetic, signed telemetry; triage of smoke, dust, sensor fault, tampering), evidence Q&A (offline engine; local and cloud models; cross-checking), the falsification engine, the companion, ISS live telemetry, matrix and playbooks, judge tour.

## Simulated or illustrative by design

The flame windows (illustration), the Fan Paradox (model, relative units, prescribed flow), and all alarm and cyber scenarios (synthetic). None controls anything real.

## Known limits of what exists

- The Fan Paradox prescribes buoyancy as a plume fixed above the source; it does not travel with the smoke. Smoke units and the alarm level are relative; the ensemble varies them.
- Flame temperatures are equilibrium bounds for gaseous fuels. They say nothing about solid materials.
- Literature statements on the opening page name their source and page; their ledger receipts arrive with the NASA sync.
