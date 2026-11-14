# Accessibility

## Automated audit

`node tools/a11y/audit.mjs web/dist` opens every page of the built site in a real browser (Chromium through Playwright), in the dark and in the light theme, at 1440 px and at 390 px, and checks it with axe-core against the WCAG 2.0, 2.1 and 2.2 rules of levels A and AA that a machine can test. It exits with code 1 when a rule is violated.

| When | axe-core | Pages | Runs | Runs with a violation | Rules violated |
|---|---|---|---|---|---|
| 14 November 2026, first run | 4.10.3 | 18 | 72 | 59 | 5: colour contrast (787 elements), target size (378), an ARIA name on an element with no role (20), a scrolling box with no keyboard access (18), a control inside an image (4) |
| 14 November 2026, after the changes below | 4.10.3 | 18 | 72 | 0 | none |

## What was changed

- **Contrast.** The small grey text of the light theme was #68738c on #f3f5f9, 4.35 to 1. It is now #5c6780: 5.2 to 1 on the page and 4.9 to 1 on the palest sunken ground. The primary button of the dark theme was white on #2f7be0, 4.17 to 1. It is now white on #2970d0, 4.9 to 1, and it darkens on hover instead of fading.
- **Target size.** A square of the coverage chart is a button only when the distance from one square to the next is at least 24 px. On a narrower screen the squares are not controls; the table view lists the same counts, with links to the records behind each. The marks under each control on the matrix page are a picture of the tiles above them and are no longer links. Record links in that list are 24 px tall.
- **Names and roles.** A chart whose marks can be focused is a group, not an image, and each focusable mark has a role and a name. Named containers have a role.
- **Keyboard.** Any box that scrolls by itself (a wide table on a phone, a long list in a fixed frame) gets a tab stop, the role of a region and a name from the nearest heading, and loses them when it stops scrolling (`web/src/lib/reach.ts`).

## What a machine cannot tell

The audit leaves about 9,200 elements for a person to judge: text over a gradient or a canvas, where axe-core cannot compute the contrast. No user of a screen reader has reviewed the site. Charts have a table view and a label that states the finding; the flame windows and the smoke view are canvases with a sentence beside them that says what they show. Motion stops when the reader's system asks for reduced motion.
