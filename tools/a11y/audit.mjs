#!/usr/bin/env node
/**
 * Accessibility audit of the built site with axe-core, in a real browser.
 *
 *   node tools/a11y/audit.mjs web/dist [out.json]
 *
 * Every page is opened in the dark and in the light theme, at 1440 px and at 390 px, and checked
 * against the WCAG 2.0, 2.1 and 2.2 rules of levels A and AA that axe-core can test by machine.
 * A machine finds only part of what a person with a screen reader would: the result is a floor.
 * Exit code 1 when a rule is violated, so the audit can gate a release.
 * Needs: playwright (with Chromium); axe-core is a development dependency of web/.
 */
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const AXE = fs.readFileSync(path.resolve(HERE, "../../web/node_modules/axe-core/axe.min.js"), "utf8");
const AXE_VERSION = JSON.parse(fs.readFileSync(path.resolve(HERE, "../../web/node_modules/axe-core/package.json"), "utf8")).version;

const DIST = path.resolve(process.argv[2] ?? "web/dist");
const OUT = process.argv[3] ? path.resolve(process.argv[3]) : null;
const ROUTES = ["", "lab", "lab?scene=habitat", "material", "model", "alarm--replay", "paradox", "evidence", "evidence--measured", "evidence--PSI-25", "envelope", "gaps", "lessons", "rank", "myths", "playbooks", "physics", "alarm", "ask", "falsify", "ledger", "data", "about"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const VIEWS = [["dark", 1440, 900], ["light", 1440, 900], ["dark", 390, 844], ["light", 390, 844]];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jsonl": "text/plain", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  });
});

server.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const runs = [];
  for (const [theme, w, h] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    await ctx.addInitScript((t) => { try { localStorage.setItem("zgf.theme", t); } catch { /* private window */ } }, theme);
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      await page.goto(base + (route ? "#" + route : ""));
      await page.waitForSelector("main");
      await page.waitForTimeout(1400);                       // the data of a page arrives after its shell
      await page.addScriptTag({ content: AXE });
      const res = await page.evaluate(async (tags) => {
        const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] });
        const brief = (v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, first: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(" "), html: n.html.slice(0, 160), why: (n.failureSummary || "").split("\n").slice(1, 3).join(" ").trim().slice(0, 220) })) });
        return { violations: r.violations.map(brief), incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })), passes: r.passes.length };
      }, TAGS);
      runs.push({ route: route || "home", theme, width: w, ...res });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  server.close();

  const byRule = new Map();
  for (const r of runs) for (const v of r.violations) {
    const e = byRule.get(v.id) ?? { id: v.id, impact: v.impact, help: v.help, nodes: 0, pages: new Set(), first: v.first };
    e.nodes += v.nodes; e.pages.add(`${r.route} (${r.theme}, ${r.width})`);
    byRule.set(v.id, e);
  }
  const summary = {
    axe: AXE_VERSION, rules: TAGS, pages: ROUTES.length, views: VIEWS.map(([t, w]) => `${t} ${w}`), runs: runs.length,
    runs_with_violations: runs.filter((r) => r.violations.length).length,
    violations: [...byRule.values()].map((e) => ({ ...e, pages: [...e.pages] })),
    needs_a_person: Object.fromEntries([...new Set(runs.flatMap((r) => r.incomplete.map((i) => i.id)))].map((id) => [id, runs.reduce((a, r) => a + (r.incomplete.find((i) => i.id === id)?.nodes ?? 0), 0)])),
  };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ summary, runs }, null, 1));
  console.log(`axe-core ${AXE_VERSION}: ${runs.length} runs (${ROUTES.length} pages, ${VIEWS.length} views), ${summary.runs_with_violations} with a violation`);
  for (const v of summary.violations) {
    console.log(`\n${v.impact?.toUpperCase() ?? "?"}  ${v.id}: ${v.help}  [${v.nodes} nodes in ${v.pages.length} runs]`);
    console.log("   pages: " + v.pages.slice(0, 8).join("; ") + (v.pages.length > 8 ? ` and ${v.pages.length - 8} more` : ""));
    for (const n of v.first) console.log(`   ${n.target}\n     ${n.html}\n     ${n.why}`);
  }
  console.log("\nleft for a person to judge:", JSON.stringify(summary.needs_a_person));
  process.exit(summary.violations.length ? 1 : 0);
});
