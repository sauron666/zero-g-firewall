# Design system

The interface must look like nobody else's entry and stay honest about what it shows. These rules are binding; change them only by logging a decision.

## Three principles

1. **Colour is evidence, chrome is ink.** Hue is reserved for two things: the gravity regime (blue = free fall, orange = 1 g, green = partial gravity; tokens `--g-micro`, `--g-earth`, `--g-partial`) and alarm status (`--ok`, `--warn`, `--serious`, `--critical`, always with an icon and a word). Buttons, links, panels and navigation are neutral ink. One more hue exists for a two-scenario comparison (`--series-b`; the first scenario is drawn in ink). Do not add hues.
2. **Two voices.** *STIX Two Text* (the typeface of scientific publishing) carries claims, findings and quotations: things that can be true or false. *B612* (designed for cockpit displays) carries the instrument: labels, controls, numbers. *B612 Mono* is for hashes, identifiers and code only. Classes: `.claim`, `.claim--hero`, `.claim--l`, `.claim--m`, `.lede`, `.prose`, `blockquote.quote` for the serif voice; everything else is the sans voice. Numbers, including large ones, are always sans.
3. **Evidence class is drawn, not coloured.** Every panel that shows content of one class sets `data-klass` (left border style) and carries a `<KlassBadge>` (glyph plus word). Clicking a badge or a number opens its **receipt** (`useReceipt()`): the one paper-coloured object in the interface. Synthetic content also gets the striped warning treatment (`.banner--synthetic`, `data-klass="synthetic"`).

## Tokens

All colours, type sizes and spacing live in `web/src/styles/tokens.css`. Light values on `:root`, dark values under the media query and under `[data-theme="dark"]`. The app defaults to dark and has a toggle; **both themes must work** (projectors wash out dark screens). The flame and smoke canvases stay dark in both themes (`--chamber`). Never write a literal colour in a component; add a token.

## Layout

- Shell: grouped rail on the left, a thin top bar with status chips, content up to 1360 px. Below 980 px the rail becomes a drawer.
- A page opens with `h1.page-title` (plain name, sans) and one `p.lede` (serif) that says what the page lets you do. No eyebrow labels, no all-caps, no decorative numbering. Number things only when they are a sequence.
- Panels are flat: one hairline border, radius 5 px, no shadows, no gradients as decoration. Do not chop a page into identical cards; use a panel when content is a separate object.
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

Honesty wording that recurs: "may", "not yet measured", "illustration", "upper bound", "relative units", "our reading". The phrase "Independent project, not endorsed by NASA" stays in the rail.

## Motion

Motion answers an action (the fan switch, the time slider, a drawer). One ambient motion exists: the flames. Everything respects `prefers-reduced-motion`.

## Accessibility

Visible keyboard focus, `aria-label` on every canvas and SVG, controls reachable by keyboard, contrast kept in both themes, class and status never by colour alone.

## The opening page, the quick search, the companion

- The opening page is a console: the question with the two flame windows, then three instruments (the evidence agent, what NASA has measured in two habitats, the alarm lab), then the counts, then the routes by challenge verb. Every instrument links to its full page.
- Quick search opens with Ctrl or Command with K, with a slash, or from the top bar. A word or two finds a place; a sentence is a question for the agent.
- Navigation items carry a line icon from `components/icons.tsx`, in ink. Icons never carry meaning alone: the label is always there.
- ISKRA, the companion (`web/src/mascot/`), lives at the foot of the rail and in the tour bar. It never floats over content. Its flame follows gravity and the fans (`flame.ts`); its ring is drawn per class (`Lantern.tsx`, `RING`), in ink; its lines never state data. Pages talk to it only through `mascot/bus.ts`.
- Coverage of the fire matrix is drawn as a square: full, half, empty with a dashed edge, or a dash. Its one hue is the gravity regime of the habitat.

## Components you already have

`KlassBadge`, `ReceiptProvider/useReceipt`, `Porthole`, `FlameCanvas` (schematic flame that follows gravity and flow), `FanSwitch`, `SmokeView`, `LineChart`, `useWidth`, `useData`, `.panel`, `.statline`, `.table`, `.kv`, `.seg`, `.chip`, `.banner`, `.empty`, `.choice`, `details.fold`. Reuse them before writing new ones.
