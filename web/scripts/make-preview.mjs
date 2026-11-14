// Builds a body-only entry page next to a stable-name build, for viewers that wrap the page in their own skeleton.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const dir = process.argv[2] || "dist-preview";
const html = readFileSync(join(dir, "index.html"), "utf8");
const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="\.\/([^"]+)"/g)].map((m) => m[1]);
const js = [...html.matchAll(/<script[^>]+type="module"[^>]*src="\.\/([^"]+)"/g)].map((m) => m[1]);
if (!css.length || !js.length) throw new Error("could not find the built entry files");
const page = [
  "<title>Zero-G Firewall</title>",
  '<meta name="claude:viewport-fit-sides" content="cover">',
  ...css.map((h) => `<link rel="stylesheet" href="${h}">`),
  '<div id="root"></div>',
  ...js.map((s) => `<script type="module" src="${s}"></script>`),
  "",
].join("\n");
writeFileSync(join(dir, "preview.html"), page);
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(relative(dir, p)); } };
walk(dir);
const keep = files.filter((f) => !["index.html", "preview.html", "files.json"].includes(f) && !f.endsWith(".woff"));
writeFileSync(join(dir, "files.json"), JSON.stringify(keep));
console.log(`preview.html written; ${keep.length} supporting files`);
