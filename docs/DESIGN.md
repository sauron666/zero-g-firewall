# Design system

The interface is a flight deck: a dark instrument panel in deep space blue, lit by the blue of a flame in free fall. It must look like nobody else's entry and stay honest about what it shows. These rules are binding; change them only by logging a decision.

**Show the engineering. Demonstrate the science. Let the results speak.** A page leads with a result, a chart or a control. Explanation of how the site works is one short sentence, or sits in a folded "How it works". Reference pages for engineers (method, ledger, data, refutation) come last in the navigation.

## Three principles

1. **Colour is evidence; the flame's blue is the one light.** Hue means: the gravity regime (blue = free fall, orange = 1 g, green = partial gravity; tokens `--g-micro`, `--g-earth`, `--g-partial`) and alarm status (`--ok`, `--warn`, `--serious`, `--critical`, always with an icon and a word). The same blue lights the active control, the primary button, the current page and the edge of a panel (`--accent`, `--glow`): it is the product's identity, the colour of a soot-free flame. No other decorative hue. One more hue exists for a two-scenario comparison (`--series-b`).
2. **Two voices.** *STIX Two Text* (the typeface of scientific publishing) carries claims, findings and quotations: things that can be true or false. *B612* (designed for cockpit displays) carries the instrument: labels, controls, numbers. *B612 Mono* is for hashes, identifiers and code only. Classes: `.claim`, `.claim--hero`, `.claim--l`, `.claim--m`, `.lede`, `.prose`, `blockquote.quote` for the serif voice; everything else is the sans voice. Numbers, including large ones, are always sans.
3. **Evidence class is drawn, not coloured.** Every panel that shows content of one class sets `data-klass` (left border style) and carries a `<KlassBadge>` (glyph plus word). Clicking a badge or a number opens its **receipt** (`useReceipt()`): the one paper-coloured object in the interface. Synthetic content also gets the striped warning treatment (`.banner--synthetic`, `data-klass="synthetic"`).

## Tokens

All colours, type sizes and spacing live in `web/src/styles/tokens.css`. Light values on `:root`, dark values under the media query and under `[data-theme="dark"]`. The app defaults to dark and has a toggle; **both themes must work** (projectors wash out dark screens). The flame and smoke canvases stay dark in both themes (`--chamber`). Never write a literal colour in a component; add a token.

## Layout

- Shell: rail on the left grouped by what a visitor does (Mission, Explore, Compare, Simulate, Search, Verify), a thin top bar with status chips and a UTC clock, content up to 1360 px. Below 980 px the rail becomes a drawer. Behind everything: a faint grid and two soft glows (`.shell::before` in `styles/deck.css`).
- A page opens with `h1.page-title` (plain name, sans) and one `p.lede` (serif) that says what the page lets you do. Small labels in B612 Mono, sentence case, never all-caps. Number things only when they are a sequence.
- Panels: one hairline border, a faint wash at the top, radius 5 to 7 px. Dashboard panels (`.dpanel`) carry two corner brackets and a head with a status light. Big numbers glow softly in the dark theme. Use a panel when content is a separate object.
- One filter row above everything it scopes (`.controls`, `.seg`), never inside a chart panel.
- Side gutter at least 16 px at every width; nothing scrolls sideways except tables in `.table-wrap`.

## Charts (SVG with d3-scale; see `web/src/viz/LineChart.tsx`, `pages/Physics.tsx`)

- Pick the form first; sometimes the answer is a number or a table, not a chart. Never two y-axes.
- Marks: lines 2 px; markers at least 8 px with a 2 px ring in the surface colour; bars at most 24 px thick with a 4 px rounded data end; gridlines and axes are solid 1 px hairlines (`--hairline`, `--axis`), never dashed.
- Text never wears a series colour: labels and values use `--ink`, `--ink-2`, `--ink-3`. Identity comes from the mark beside the text.
- Two or more series need a legend; label directly only the few marks that matter. Every chart has a hover or focus tooltip (`.tip`, value first) and a table view (`<details class="fold">`).
- Hit targets at least 24 px. Scatter plots may use at most the three gravity hues, plus shape; never one hue per investigation.
- A literature value on a chart (a published number, a facility range) is drawn differently from data points (a line, a band or a hollow diamond) and has its own receipt.
- Do not add colours. The three gravity hues were validated for colour-vision deficiency on both surfaces as a set; a fourth would break that.

## Copy

Plain verbs, sentence case, no filler. Name things by what a person recognises ("Rank for a mission", not "Scoring engine"). A control says what it does ("Stop the fans"). Empty states say what will appear and what to run. Errors say what went wrong and how to fix it. No em-dash asides, no "not X but Y" constructions, no emoji, no arrows appended to links.

Lead with what was found. A real scientific limit is stated once, beside the result it limits, in a few words ("unmeasured", "bounded by a model", "illustration", "our reading"); it is not repeated as a refrain. Do not describe the machinery ("the agent", "the checker", "the engine") where a verb for the visitor will do: Search, Compare, Verify, Explore. The phrase "Independent project, not endorsed by NASA" stays in the rail.

AI assistance is disclosed in one sentence on the Method page with a link to `docs/AI_USE.md`. Text on the site that a model wrote (the record summaries) carries a short label. Nothing else on the site talks about how it was built.

## Motion

Motion answers an action (the fan switch, the time slider, a drawer, a question to ISKRA). Ambient motion is limited to the flames, ISKRA's lantern, the clock and the ledger chain on mission control; numbers on mission control run up once. Everything respects `prefers-reduced-motion`.

## Accessibility

Visible keyboard focus, `aria-label` on every canvas and SVG, controls reachable by keyboard, contrast kept in both themes, class and status never by colour alone.

## Mission control, the quick search, ISKRA

- The opening page is mission control (`pages/Home.tsx`, `dash/widgets.tsx`, `styles/deck.css`): a strip of six readings, the question with the two flame windows and the fan switch, then instrument panels that each show one result and link to its page (where NASA has tested, behaviours measured, the alarm, the model checks, what to read first, the ledger), then the eight stops and a row of links for engineers. Every number on it is read from the build's data files.
- The flames (`components/FlameCanvas.tsx`) are drawn as a thin luminous sheet around a fuel sphere: blue on the windward side, a warm glow of soot inside that grows with gravity and flow; a dying flame shrinks to a blue cap. They are schematics and labelled so.
- Quick search opens with Ctrl or Command with K, with a slash, or from the top bar. A word or two finds a place; a sentence is a question for ISKRA.
- ISKRA, the companion (`web/src/mascot/`), is on every page as a launcher in the lower right corner (`mascot/Chat.tsx`). It opens a conversation: questions in plain words, answered by the same engine as the Ask page, with a source beside each sentence. It knows which page the visitor is on, suggests questions for it, and can open a page when asked. The lantern glows while it searches and when it answers. The launcher folds to the lantern after a few seconds and can be hidden from the conversation. Its flame follows gravity and the fans (`flame.ts`); its ring is drawn per class (`Lantern.tsx`, `RING`); its own lines never state data. Pages talk to it only through `mascot/bus.ts` (`ASK` opens the conversation).
- Coverage of the fire matrix is drawn as a square: full, half, empty with a dashed edge, or a dash. Its one hue is the gravity regime of the habitat.

## Components you already have

`Tile`, `Ring`, `MiniCover`, `MiniParity`, `TopFive`, `Chain`, `AlarmSpark` (mission control), `OxygenCover`, `DropletPanel`, `IskraChat`, `KlassBadge`, `ReceiptProvider/useReceipt`, `Porthole`, `FlameCanvas` (schematic flame that follows gravity and flow), `FanSwitch`, `SmokeView`, `LineChart`, `useWidth`, `useData`, `.panel`, `.statline`, `.table`, `.kv`, `.seg`, `.chip`, `.banner`, `.empty`, `.choice`, `details.fold`. Reuse them before writing new ones.

## The laboratory and the new opening (15 November)

- The opening page starts with a composition, not a strip of readings: message and one question at about 38% of the width, a chamber with two flames and one gravity control at about 62%, one primary action ("Enter the lab"), one quieter one ("Explore NASA evidence") and methods as a plain link. Below it, three results and the four lab modes; the mission-control strip follows. The earlier rule that readings come first no longer applies to the opening page.
- Four lab modes share one layout (`styles/lab.css`): controls left, a large viewport in the centre, evidence on the right; below 1560 px the drawer drops below, below 860 px the viewport comes first. Lab classes are scoped (`.lab*`, `.lc*`, `.hero2*`, `.viewport*`); `.ctl` belongs to the playbook page.
- 3-D scenes stay dark in both themes like the other chambers; every HUD carries a class badge. The scalar field is drawn in a single neutral luminance with its own name, never in alarm colours. No automatic camera rotation.
