#!/usr/bin/env node
/**
 * Records the 30-second demo video from the real site, frame by frame.
 *
 *   node tools/video/record.mjs web/dist out_dir            full render (900 frames in nine scenes, 1920x1080, 30 fps)
 *   node tools/video/record.mjs web/dist out_dir --preview  one still per scene, to check the framing first
 *
 * The page's clock is driven by this script (Playwright's clock), so every run films the same frames.
 * Nothing in the picture is generated: it is the site, with captions and a pointer drawn on top.
 * Needs: playwright (with Chromium) and ffmpeg.
 */
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const { chromium } = createRequire(import.meta.url)("playwright");      // resolves a global install as well as a local one

const DIST = path.resolve(process.argv[2] ?? "web/dist");
const OUT = path.resolve(process.argv[3] ?? "video_out");
const PREVIEW = process.argv.includes("--preview");
const FPS = 30, W = 1280, H = 720, DSF = 1.5, MS = 1000 / FPS;
const SITE = "sauron666.github.io/zero-g-firewall";
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".jsonl": "text/plain", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split("?")[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] ?? "application/octet-stream" });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, colorScheme: "dark" });
const page = await ctx.newPage();
await page.clock.install({ time: new Date("2026-11-15T10:00:00Z") });
await page.goto(base + "/");
await page.waitForSelector(".fanswitch");
await page.waitForTimeout(900);

await page.addStyleTag({ content: `
  #zgf-cap { position: fixed; left: 236px; right: 0; bottom: 0; z-index: 9000; padding: 54px 40px 22px; pointer-events: none; text-align: center;
    background: linear-gradient(to top, rgba(3,6,12,.97) 58%, rgba(3,6,12,0)); font-family: "STIX Two Text", Georgia, serif; font-size: 31px; line-height: 1.25; color: #fff; }
  #zgf-cap span { display: inline-block; max-width: 980px; }
  #zgf-note { position: fixed; right: 12px; bottom: 5px; z-index: 9001; font: 10px "B612", sans-serif; color: rgba(255,255,255,.5); pointer-events: none; }
  #zgf-cur { position: fixed; z-index: 9500; left: 0; top: 0; width: 26px; height: 26px; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
  #zgf-ring { position: fixed; z-index: 9400; width: 46px; height: 46px; margin: -23px 0 0 -23px; border: 3px solid #fff; border-radius: 50%; pointer-events: none; opacity: 0; }
  #zgf-end { position: fixed; inset: 0; z-index: 9800; display: grid; place-content: center; justify-items: center; gap: 18px; text-align: center; background: #060a12; opacity: 0; pointer-events: none; }
  #zgf-end .n { font: 700 66px "B612", sans-serif; color: #fff; letter-spacing: .01em; }
  #zgf-end .q { font: 400 36px "STIX Two Text", Georgia, serif; color: #dfe6f3; }
  #zgf-end .u { font: 400 25px "B612 Mono", monospace; color: #fff; margin-top: 14px; padding: 10px 18px; border: 1px solid #5a6784; border-radius: 6px; }
  #zgf-end .t { font: 400 17px "B612", sans-serif; color: #9aa6bf; }
  html { scroll-behavior: auto !important; }
` });
await page.evaluate((site) => {
  const el = (tag, id, html) => { const e = document.createElement(tag); e.id = id; if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
  const cap = el("div", "zgf-cap", "<span></span>");
  el("div", "zgf-note", "Screen recording of the live site, captured by a script. Captions added.");
  const cur = el("div", "zgf-cur", '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5v17l4.6-4.2 3 6.6 2.9-1.3-3-6.5h6.2z" fill="#fff" stroke="#0a0f1a" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  const ring = el("div", "zgf-ring");
  const end = el("div", "zgf-end", `<svg viewBox="0 0 64 64" width="120" height="120"><circle cx="32" cy="32" r="30" fill="#04070d" stroke="#5a6784" stroke-width="2"/><circle cx="32" cy="34" r="14" fill="#3987e5" opacity=".55"/><circle cx="32" cy="35" r="9" fill="#3987e5"/><circle cx="32" cy="36.5" r="4.6" fill="#d6e6ff"/></svg>
    <div class="n">Zero-G Firewall</div><div class="q">Kill the fans? Check the evidence first.</div><div class="u">${site}</div><div class="t">The Rule of Flame &nbsp;·&nbsp; NASA Space Apps Challenge 2026, Sofia &nbsp;·&nbsp; built on NASA PSI data</div>
    <div class="t">Screen recording of the working site. Code written with AI assistance. Not endorsed by NASA.</div>`);
  window.__zgf = {
    cap(text) { cap.firstChild.textContent = text; },
    cur(x, y) { cur.style.transform = `translate(${x - 3}px, ${y - 2}px)`; },
    ring(x, y, u) { ring.style.left = x + "px"; ring.style.top = y + "px"; ring.style.opacity = String(u >= 1 ? 0 : 0.9 * (1 - u)); ring.style.transform = `scale(${0.3 + 0.95 * u})`; },   // every moving part is set per frame: no timers, no CSS clocks
    end(u) { end.style.opacity = String(u); cur.style.opacity = u > 0 ? "0" : "1"; },
    scrub(v) { const i = document.querySelector(".transport input.scrub"); if (!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, String(v)); i.dispatchEvent(new Event("input", { bubbles: true })); },
  };
}, SITE);

const MANIFEST = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "manifest.json"), "utf8"));
const MATRIX = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "matrix.json"), "utf8"));
const CELLS = MATRIX.cells.length, MEASURED = MATRIX.coverage.iss.evidence;
if (MATRIX.coverage.lunar.evidence !== 0) throw new Error("the caption says nothing is measured in lunar gravity; the matrix now says otherwise");
const QUOTES = MANIFEST.nasa.quotes_verified, FILES = MANIFEST.nasa.files_in_ledger.toLocaleString("en-US");   // caption numbers come from the build, not from memory

/* ---------------------------------------------------------------- helpers */
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const lerp = (a, b, u) => a + (b - a) * u;
let mx = 980, my = 520;                                  // pointer position, CSS pixels
const cap = (t) => page.evaluate((x) => window.__zgf.cap(x), t);
const go = async (hash, waitFor) => { await page.keyboard.press("Escape"); await page.evaluate((h) => { window.location.hash = h; window.scrollTo(0, 0); }, hash); await page.waitForSelector(waitFor); await page.waitForTimeout(500); };
const boxOf = async (loc) => { const b = await (typeof loc === "string" ? page.locator(loc).first() : loc).boundingBox(); if (!b) throw new Error("not on screen: " + loc); return b; };
const centre = async (loc) => { const b = await boxOf(loc); return [b.x + b.width / 2, b.y + b.height / 2]; };
const scrollToY = (y) => page.evaluate((v) => window.scrollTo(0, v), Math.max(0, Math.round(y)));
const scrollY = () => page.evaluate(() => window.scrollY);
const putAt = async (loc, y) => { const b = await boxOf(loc); await scrollToY((await scrollY()) + b.y - y); };
async function pointer(x, y) { mx = x; my = y; await page.mouse.move(x, y); await page.evaluate(([a, b]) => window.__zgf.cur(a, b), [x, y]); }
let ringAge = -1, ringAt = [0, 0];
async function click() { ringAge = 0; ringAt = [mx, my]; await page.mouse.click(mx, my); }
/** a per-frame mover: glides the pointer from where it is to (x, y) between frames a and b */
function glide(x, y, a, b) { let from = null; return async (i) => { if (i < a || i > b) return; if (!from) from = [mx, my]; const u = ease((i - a) / Math.max(1, b - a)); await pointer(lerp(from[0], x, u), lerp(from[1], y, u)); }; }
function glideScroll(to, a, b) { let from = null; return async (i) => { if (i < a || i > b) return; if (from == null) from = await scrollY(); await scrollToY(lerp(from, to, ease((i - a) / Math.max(1, b - a)))); }; }

let sink = null, sceneNo = 0, total = 0;
const files = [];
async function scene(name, n, setup, per, stills = []) {
  sceneNo++;
  const id = `${String(sceneNo).padStart(2, "0")}_${name}`;
  const acts = (await setup()) ?? [];
  await pointer(mx, my);
  let ff = null, tmp = null, out = null;
  if (!PREVIEW) {
    out = path.join(OUT, `scene_${id}.mp4`); tmp = path.join(OUT, `scene_${id}.tmp.mp4`);
    ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), tmp], { stdio: ["pipe", "inherit", "inherit"] });
  }
  for (let i = 0; i < n; i++) {
    for (const a of acts) await a(i);
    if (per) await per(i);
    if (ringAge >= 0) { await page.evaluate(([x, y, u]) => window.__zgf.ring(x, y, u), [ringAt[0], ringAt[1], ringAge / 11]); ringAge = ringAge >= 11 ? -1 : ringAge + 1; }
    await page.clock.runFor(MS);
    if (PREVIEW) { if (stills.includes(i)) fs.writeFileSync(path.join(OUT, `still_${id}_${String(i).padStart(3, "0")}.jpg`), await page.screenshot({ type: "jpeg", quality: 92 })); }
    else { const buf = await page.screenshot({ type: "jpeg", quality: 92 }); if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r)); }
  }
  total += n;
  if (ff) { ff.stdin.end(); const code = await new Promise((r) => ff.on("close", r)); if (code !== 0) throw new Error(`ffmpeg failed on ${id}`); fs.renameSync(tmp, out); files.push(out); }
  console.log(`${id}: ${n} frames`);
}

/* ---------------------------------------------------------------- the film: 900 frames, nine scenes */
// 1. the question (4.0 s)
await scene("question", 120, async () => {
  await cap("Stop the air, and a flame in free fall starves.");
  const b = await boxOf(".fanswitch");
  if (b.y + b.height > 586) await scrollToY(b.y + b.height - 580);        // keep the switch clear of the caption, and the title whole
  const [x, y] = await centre(".fanswitch__track");
  return [glide(x, y, 16, 42)];
}, async (i) => {
  if (i === 46) await click();
  if (i === 60) await cap("On the Moon, gravity is a fan nobody can switch off.");
}, [36, 112]);

// 2. the misconception (3.2 s)
await scene("myth", 96, async () => {
  await go("myths--fans", ".myth");
  await putAt(".myth[open]", 64);
  await cap("NASA's own guide calls that rule a misconception.");
  await pointer(1010, 300);
  const y0 = await scrollY();
  return [glideScroll(y0 + 420, 34, 88)];
}, async (i) => { if (i === 48) await cap(`${QUOTES} quotations on this site, each checked against the stored NASA document.`); }, [20, 90]);

// 3. the map and a receipt (3.2 s)
await scene("map", 96, async () => {
  await go("envelope", ".mapwrap svg");
  await putAt(".mapwrap", 96);
  await cap("Every real test in NASA's tables, by oxygen and pressure.");
  await pointer(900, 200);
  const b = await boxOf(page.locator(".mapwrap svg text", { hasText: "30% at 10.2 psia" }));
  return [glide(b.x + b.width + 13, b.y + b.height / 2 - 3, 18, 44)];
}, async (i) => {
  if (i === 50) await click();
  if (i === 56) await cap("Every point opens a receipt: file, row, SHA-256.");
}, [44, 90]);

// 4. the matrix: station, then Moon (3.6 s)
await scene("matrix", 108, async () => {
  await go("playbooks", ".mx__grid");
  await putAt(".controls", 70);
  await cap(`${CELLS} fire behaviours, mapped like an attack. Measured in free fall: ${MEASURED}.`);
  const [x, y] = await centre(page.locator(".seg--habitat button").nth(1));
  await pointer(x + 260, y + 120);
  return [glide(x, y, 26, 50)];
}, async (i) => {
  if (i === 54) await click();
  if (i === 60) await cap("Measured in lunar gravity: none.");
}, [44, 100]);

// 5. the model against NASA (2.8 s)
await scene("model", 84, async () => {
  await go("physics", "text=The flame model against NASA's own numbers");
  await putAt(page.locator("p.claim", { hasText: "the model lands within" }), 84);
  await cap("Our flame model lands within about 2 K of NASA's own numbers, over 587 tests.");
  await pointer(980, 420);
  const y0 = await scrollY();
  return [glideScroll(y0 + 150, 30, 74)];
}, null, [20, 76]);

// 6. the alarm that must not be fooled (3.6 s)
await scene("alarm", 108, async () => {
  await go("alarm--replay", ".verdictcard");
  await putAt(".verdictcard", 96);
  await cap("A real fire, hidden behind replayed \"all clear\" readings.");
  await page.evaluate(() => window.__zgf.scrub(0));
  const [x, y] = await centre(".transport input.scrub");
  await pointer(x - 200, y);
  return [];
}, async (i) => {
  const t = Math.round(lerp(0, 240, ease(i / 70)) / 2) * 2;
  if (i <= 72) await page.evaluate((v) => window.__zgf.scrub(v), t);
  if (i === 58) await cap("The sequence and clock checks catch it. The alarm stands.");
}, [30, 100]);

// 7. the agent (4.6 s)
const QUESTION = "Has anything been burned in lunar gravity?";
let glideAsk = null;
await scene("ask", 138, async () => {
  await go("ask", ".chipbtn:not([disabled])");
  await putAt(".askbar", 120);
  await cap("Ask in plain words.");
  const [x, y] = await centre("#askq");
  await pointer(x - 120, y + 4);
  await page.mouse.click(x - 120, y + 4);
  return [];
}, async (i) => {
  if (i >= 4 && i < 4 + QUESTION.length) await page.keyboard.type(QUESTION[i - 4]);
  if (i === 50) { await page.keyboard.press("Enter"); await page.waitForSelector(".askgrid"); await cap("An agent counts with code, quotes its sources and shows every step. No key. Works offline."); }
  if (i === 54) { const y = (await scrollY()) + (await boxOf(".askgrid")).y - 60; glideAsk = glideScroll(y, 54, 80); }
  if (i === 96) { const y = (await scrollY()) + (await boxOf(".trace")).y - 150; glideAsk = glideScroll(y, 96, 126); }
  if (glideAsk) await glideAsk(i);
}, [46, 90, 132]);

// 8. verify, and try to tamper (3.0 s)
await scene("verify", 90, async () => {
  await go("ledger", ".statline");
  await page.waitForSelector(".btn--primary:not([disabled])");
  await putAt(page.locator("section.panel[data-klass=\"synthetic\"]"), 150);
  await cap(`${FILES} NASA files, hash-chained and verified in your browser.`);
  const [x, y] = await centre(page.locator("button", { hasText: "Change one character of a file hash" }));
  await pointer(x + 300, y + 90);
  return [glide(x, y, 8, 30)];
}, async (i) => {
  if (i === 34) { await click(); await page.waitForSelector("section.panel[data-klass=\"synthetic\"] .verdict-line", { timeout: 20000 }); await cap("Change one character, and the chain breaks."); }
}, [28, 84]);

// 9. the end card (2.0 s)
await scene("end", 60, async () => [], async (i) => { await page.evaluate((u) => window.__zgf.end(u), ease(i / 9)); }, [50]);

await browser.close();
server.close();
console.log(`frames: ${total} = ${(total / FPS).toFixed(2)} s`);

if (!PREVIEW) {
  const run = (args) => new Promise((res, rej) => { const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" }); p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))); });
  const list = path.join(OUT, "scenes.txt");
  fs.writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  const joined = path.join(OUT, "joined.tmp.mp4"), final = path.join(OUT, "zero-g-firewall_30s.mp4"), ftmp = path.join(OUT, "final.tmp.mp4");
  await run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  await run(["-i", joined, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", ftmp]);
  fs.renameSync(ftmp, final); fs.rmSync(joined);
  console.log("written", final);
}
