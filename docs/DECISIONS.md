# Decisions

| When (Sofia) | Decision | Why |
|---|---|---|
| 14 Nov 11:22 | Build window treated as open on the team's instruction. | The event is under way. |
| 14 Nov 11:25 | NASA data is fetched by a script the team runs, not from the cloud build environment. | That environment cannot reach nasa.gov. The data must come from NASA, during the event, with a ledger. |
| 14 Nov 11:30 | Names: BRAND "Zero-G Firewall", TEAM "The Rule of Flame", MASCOT "ISKRA". Held in `pipeline/zgf/__init__.py` and the manifest. | Team's choice of project name; the other two as recommended before the event. |
| 14 Nov 11:35 | Plain CSS with design tokens instead of Tailwind. | A bespoke system with few classes; fewer build dependencies; light and dark themes from one token file. |
| 14 Nov 11:35 | Colour is reserved for physics (gravity regime) and alarm status. Evidence class is drawn as glyph and border style. | Survives colour-vision deficiency, projectors and print. The three data colours pass the palette validator on both surfaces. |
| 14 Nov 11:35 | Two typefaces with two jobs: STIX Two for claims and quotations, B612 for the instrument. | A reader can see at a glance what is evidence and what is interface. Both OFL, bundled, offline. |
| 14 Nov 11:50 | Ventilation in the Fan Paradox is a uniform flow from a supply end to a return end; the duct detector reads the return air. | A recirculation cell hid the mechanism (the source sat near the vortex centre). The simpler flow is easier to check and to explain. |
| 14 Nov 11:52 | "What does the flame do when the fans stop" is a set of branches, each tied to a NASA source, not a model output. | PSI has no partial-gravity data; the model must not decide what evidence cannot. |
| 14 Nov 11:56 | Routes are plain hash names (`#paradox`, `#evidence--PSI-25`). | They work on every static host and inside embedded viewers. |
| 14 Nov 11:58 | The Fan Paradox and the falsification engine are built as core features. | They are the north-star question made visible. |
| 14 Nov 12:47 | Sync 1.1 fetches a core set (experimental tables plus a few named summary files per record) instead of every small file. | Version 1.0 pulled over a thousand small raw files. Everything fetched stays in the ledger; the core set is what the site uses. |
| 14 Nov 13:02 | Derivation runs on the team's core archive of the 14 November sync. Row counts follow the rule "rows after the header with at least one non-empty cell". | NASA's CFI-G inverse-flame file carries 861 empty lines after its 154 data rows; a mirror seen before the event counted them. NASA's file wins; the rule is stated wherever a count is shown. |
| 14 Nov 13:05 | The pre-event note that FLEX headers are cut at 40 characters does not hold for NASA's file (headers are complete; the subscripts of O2, N2 and CO2 are missing). | Checked against the file fetched from NASA. |
| 14 Nov 13:08 | Code is pushed to `main` of the team's repository; the raw cache stays out of it, the ledger and the sync report go in. | The team asked for it. The site carries the hash of every NASA file it uses. |
| 14 Nov 13:20 | The flame model is checked against NASA's `Tad` at two pressures, the row's and one atmosphere, and both results are published. | PSI-159's column only matches at one atmosphere; PSI-10's matches at the row's pressure. Assuming either convention for both would hide a 70 K difference. |
| 14 Nov 13:25 | The raw ledger ships with the site and the browser re-computes the chain from it. | "Verified" should be something a judge can do, not something the site says about itself. |
| 14 Nov 13:40 | The opening claim about BASS-II is narrowed to one documented test. | The stronger wording came from a paper that is not in the ledger. A quotation or a claim is shown only if the stored document supports it. |

Originality check for the companion: pending (the companion is not built yet).
