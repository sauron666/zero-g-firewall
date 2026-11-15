#!/usr/bin/env node
/**
 * Records the 30-second demo video from the real site, frame by frame.
 *
 *   node tools/video/record.mjs web/dist out_dir            full render (900 frames in ten scenes, 1920x1080, 30 fps)
 *   node tools/video/story.mjs web/dist out_dir --preview  one still per scene, to check the framing first
 *
 * The pointer, the captions and every control are moved by frame number, so every run films the same actions.
 * The clock in the top bar is set to the film's own time (ten o'clock plus the frame's place in the film), so it
 * reads the same on a slow machine and a fast one, and a scene filmed again with --only keeps its place.
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
// --only=3,6 renders those scenes again and keeps the files of the others: one changed scene does not cost a full render
const ONLY = (() => { const a = process.argv.find((x) => x.startsWith("--only=")); return a ? new Set(a.slice(7).split(",").map(Number)) : null; })();
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

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] });   // the 3-D lab is drawn in software here
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, colorScheme: "dark" });
const page = await ctx.newPage();
const T0 = Date.parse("2026-11-15T10:00:00Z");
await page.clock.install({ time: T0 });
await page.clock.setFixedTime(T0);          // timers keep running; only what the page reads as the time of day is ours
await page.goto(base + "/");
await page.waitForSelector(".fanswitch");
await page.waitForTimeout(900);

await page.addStyleTag({ content: `
  .fab { bottom: 150px !important; animation: none !important; } .fab__text { animation: none !important; }
  .zgf-nofab .fab { visibility: hidden !important; }
  #zgf-cap { position: fixed; left: 236px; right: 0; bottom: 0; z-index: 60; padding: 54px 40px 22px; pointer-events: none; text-align: center;
    background: linear-gradient(to top, rgba(3,6,12,.97) 58%, rgba(3,6,12,0)); font-family: "STIX Two Text", Georgia, serif; font-size: 31px; line-height: 1.25; color: #fff; }
  #zgf-cap span { display: inline-block; max-width: 980px; }
  #zgf-note { position: fixed; left: 250px; bottom: 5px; z-index: 9001; font: 10px "B612", sans-serif; color: rgba(255,255,255,.5); pointer-events: none; }
  #zgf-cur { position: fixed; z-index: 9500; left: 0; top: 0; width: 26px; height: 26px; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
  #zgf-ring { position: fixed; z-index: 9400; width: 46px; height: 46px; margin: -23px 0 0 -23px; border: 3px solid #fff; border-radius: 50%; pointer-events: none; opacity: 0; }
  #zgf-end { position: fixed; inset: 0; z-index: 9800; display: grid; place-content: center; justify-items: center; gap: 18px; text-align: center; background: #060a12; opacity: 0; pointer-events: none; }
  #zgf-end .n { font: 700 66px "B612", sans-serif; color: #fff; letter-spacing: .01em; }
  #zgf-end .q { font: 400 36px "STIX Two Text", Georgia, serif; color: #dfe6f3; }
  #zgf-end .u { font: 400 25px "B612", sans-serif; letter-spacing: .02em; color: #fff; margin-top: 14px; padding: 10px 18px; border: 1px solid #5a6784; border-radius: 6px; }
  #zgf-end .t { font: 400 17px "B612", sans-serif; color: #9aa6bf; }
  #zgf-open { position: fixed; inset: 0; z-index: 9700; display: grid; place-content: center; justify-items: center; gap: 26px; padding: 0 120px; text-align: center; background: #04070d; pointer-events: none; }
  #zgf-open div { opacity: 0; font: 400 40px/1.25 "STIX Two Text", Georgia, serif; color: #fff; max-width: 1000px; }
  #zgf-open .d { font: 400 19px "B612", sans-serif; letter-spacing: .08em; color: #8fb8ff; }
  #zgf-open .s { font: 400 15px/1.5 "B612", sans-serif; color: #9aa6bf; max-width: 760px; }
  #zgf-open .k { font: 700 46px/1.2 "STIX Two Text", Georgia, serif; color: #fff; margin-top: 10px; }
  html { scroll-behavior: auto !important; }
` });
await page.evaluate((site) => {
  const el = (tag, id, html) => { const e = document.createElement(tag); e.id = id; if (html) e.innerHTML = html; document.body.appendChild(e); return e; };
  const cap = el("div", "zgf-cap", "<span></span>");
  el("div", "zgf-note", "Screen recording of the live site, captured by a script. Captions added.");
  const cur = el("div", "zgf-cur", '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5v17l4.6-4.2 3 6.6 2.9-1.3-3-6.5h6.2z" fill="#fff" stroke="#0a0f1a" stroke-width="1.4" stroke-linejoin="round"/></svg>');
  const ring = el("div", "zgf-ring");
  const end = el("div", "zgf-end", `<svg viewBox="0 0 64 64" width="120" height="120"><circle cx="32" cy="32" r="30" fill="#04070d" stroke="#5a6784" stroke-width="2"/><circle cx="32" cy="34" r="14" fill="#3987e5" opacity=".55"/><circle cx="32" cy="35" r="9" fill="#3987e5"/><circle cx="32" cy="36.5" r="4.6" fill="#d6e6ff"/></svg>
    <div class="n">Zero-G Firewall</div><div class="q">Before you cut the air, check the evidence. And check the alarm.</div><div class="u">${site}</div><div class="t">The Rule of Flame &nbsp;·&nbsp; NASA Space Apps Challenge 2026, Sofia &nbsp;·&nbsp; built on NASA PSI data</div>
    <div class="t">Screen recording of the working site. Independent project, not endorsed by NASA.</div>`);
  const open = el("div", "zgf-open", `<div class="d">APRIL 2026 &nbsp; ARTEMIS II &nbsp; ABOUT 80,000 MILES FROM HOME</div><div>A smoke detector goes off.</div><div>The spacecraft begins shutting down its own ventilation.</div>
    <div class="k">Was cutting the air the right move?<br>And can you trust the alarm?</div><div class="s">The alarm and the automatic shutdown as told by commander Reid Wiseman at the crew press conference, 16 April 2026. The cause has not been made public.</div>`);
  window.__zgf = {
    open(us, fade) { Array.from(open.children).forEach((c, k) => { c.style.opacity = String(us[k] ?? 0); }); open.style.opacity = String(fade); if (fade <= 0) open.style.display = "none"; },
    cap(text) { cap.firstChild.textContent = text; },
    fab(show) { document.documentElement.classList.toggle("zgf-nofab", !show); },
    capRight(px) { cap.style.right = px + "px"; },
    cur(x, y) { cur.style.transform = `translate(${x - 3}px, ${y - 2}px)`; },
    ring(x, y, u) { ring.style.left = x + "px"; ring.style.top = y + "px"; ring.style.opacity = String(u >= 1 ? 0 : 0.9 * (1 - u)); ring.style.transform = `scale(${0.3 + 0.95 * u})`; },   // every moving part is set per frame: no timers, no CSS clocks
    end(u) { end.style.opacity = String(u); cur.style.opacity = u > 0 ? "0" : "1"; },
    scrub(v, sel = ".soc .transport input.scrub") { const i = document.querySelector(sel); if (!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, String(v)); i.dispatchEvent(new Event("input", { bubbles: true })); },
  };
}, SITE);

const MANIFEST = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "manifest.json"), "utf8"));
const MATRIX = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "matrix.json"), "utf8"));
const CELLS = MATRIX.cells.length, MEASURED = MATRIX.coverage.iss.evidence;
if (MATRIX.coverage.lunar.evidence !== 0) throw new Error("the caption says nothing is measured in lunar gravity; the matrix now says otherwise");
const QUOTES = MANIFEST.nasa.quotes_verified, FILES = MANIFEST.nasa.files_in_ledger.toLocaleString("en-US");   // caption numbers come from the build, not from memory
const GAPS = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "gaps.json"), "utf8")).coverage;
const DROPS = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "droplets.json"), "utf8"));
const pct = (x) => String(Number((100 * x).toFixed(1)));
const SOLID_TOP = pct(GAPS.kinds.find((k) => k.id === "solid").max);
if (GAPS.regimes.find((r) => r.id === "partial").rows !== 0) throw new Error("the caption says no row was taken in lunar gravity; the data now says otherwise");
const TAD = MANIFEST.nasa.validation_mean_abs_K.toFixed(1), TAD_N = MANIFEST.nasa.validation_rows;
const REC = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "recorded.json"), "utf8"));
const PLANNED = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "reported.json"), "utf8")).fm2.tests.length;

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
  if (ONLY && !PREVIEW && !ONLY.has(sceneNo)) {
    const kept = path.join(OUT, `scene_${id}.mp4`);
    if (!fs.existsSync(kept)) throw new Error(`--only needs the earlier render of ${id} in ${OUT}`);
    files.push(kept); total += n; console.log(`${id}: kept`);
    return;
  }
  const acts = (await setup()) ?? [];
  await pointer(mx, my);
  let ff = null, tmp = null, out = null;
  if (!PREVIEW) {
    out = path.join(OUT, `scene_${id}.mp4`); tmp = path.join(OUT, `scene_${id}.tmp.mp4`);
    ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-", "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(FPS), tmp], { stdio: ["pipe", "inherit", "inherit"] });
  }
  for (let i = 0; i < n; i++) {
    await page.clock.setFixedTime(T0 + Math.round((total + i) * MS));
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

/* ---------------------------------------------------------------- the story film, 30 seconds: a real alarm in deep space, the two questions it raises, and what answers them */
const up = (i, a, b) => ease((i - a) / (b - a));
const ROWS = JSON.parse(fs.readFileSync(path.join(DIST, "data", "v1", "envelope.json"), "utf8")).gravity_counts.micro.toLocaleString("en-US");
// 1. the incident (5.0 s): what the crew told, and nothing about a cause, which is not public
await scene("incident", 150, async () => { await page.evaluate(() => { window.__zgf.fab(false); window.__zgf.end(0); window.__zgf.open([0, 0, 0, 0, 0], 1); }); await cap(""); return []; },
  async (i) => { await page.evaluate(([us, f]) => window.__zgf.open(us, f), [[up(i, 2, 10), up(i, 14, 24), up(i, 34, 46), up(i, 70, 84), up(i, 46, 58)], 1 - up(i, 138, 149)]); }, [64, 130]);

// 2. the question (3.4 s)
await scene("question", 102, async () => {
  await page.evaluate(() => { window.__zgf.open([0, 0, 0, 0, 0], 0); window.__zgf.fab(false); });
  await cap("In one NASA test, a flame went out two seconds after its airflow was cut.");
  const b = await boxOf(".fanswitch");
  await scrollToY((await scrollY()) + b.y + b.height - 596);
  const [x, y] = await centre(".fanswitch__track");
  await pointer(900, 200);
  return [glide(x, y, 10, 32)];
}, async (i) => {
  if (i === 36) await click();
  if (i === 52) await cap("On the Moon, gravity is a fan nobody can switch off.");
}, [30, 96]);

// 3. NASA's evidence, both sides (2.6 s)
await scene("evidence", 78, async () => {
  await go("myths--fans", ".myth");
  await putAt(".myth[open]", 64);
  await cap("NASA's own guide lists that rule among its misconceptions.");
  await pointer(1010, 300);
  const y0 = await scrollY();
  return [glideScroll(y0 + 380, 16, 70)];
}, null, [60]);

// 4. where NASA has tested, in 3-D (3.6 s): every row on one floor, the floors of the Moon and Mars empty
await scene("space", 108, async () => {
  await go("envelope?at=space", "#space canvas");
  await page.waitForTimeout(1500);
  await putAt("#space", 62);
  await cap(`Every NASA test row by oxygen and pressure: ${ROWS}, all in free fall.`);
  await pointer(1150, 560);
  return [];
}, async (i) => { if (i === 58) await cap("The floors of the Moon and Mars are empty."); }, [40, 100]);

// 5. the Fire Lab (5.0 s): a concept cabin, the site's transport model drawn in 3-D, then the three sensors
await scene("firelab", 150, async () => {
  await go("lab?scene=habitat", "input[aria-label=\"Time\"]");
  await page.locator(".seg[aria-label=\"Render quality\"] button", { hasText: "High" }).click().catch(() => {});
  await page.waitForTimeout(2500);
  await putAt(".seg[aria-label=\"Scene\"]", 70);
  await page.evaluate(() => window.__zgf.scrub(0, "input[aria-label=\"Time\"]"));
  await cap("Fire Lab in 3-D: a fire starts, and the fans stop at 60 seconds.");
  await pointer(1180, 420);
  const b = await boxOf(page.getByText("Smoke at the three sensors").first());
  return [glideScroll((await scrollY()) + b.y - 74, 86, 110)];
}, async (i) => {
  await page.evaluate((v) => window.__zgf.scrub(v, "input[aria-label=\"Time\"]"), Math.round(lerp(0, 210, i / 146)));
  if (i === 86) await cap("Which detector still sees the smoke? A model, labelled as one.");
}, [60, 144]);

// 6. the model that refuses (2.6 s)
await scene("model", 78, async () => {
  await go("model", ".demo-row");
  await cap("Asked for PMMA on the Moon, the model trained on NASA's data abstains.");
  const [x, y] = await centre(page.locator("button", { hasText: "PMMA on the Moon" }));
  await pointer(x - 240, y + 130);
  return [glide(x, y, 6, 20)];
}, async (i) => { if (i === 24) await click(); }, [70]);

// 7. the second problem: the signal (4.4 s)
await scene("alarm", 132, async () => {
  await go("alarm--replay", ".verdictcard");
  await putAt(".verdictcard", 96);
  await cap("A synthetic attack: old \"all clear\" readings replayed over a real fire.");
  await page.evaluate(() => window.__zgf.scrub(0, ".transport input.scrub"));
  await pointer(1090, 500);
  return [];
}, async (i) => {
  const t = Math.round(lerp(0, 240, ease(i / 92)) / 2) * 2;
  if (i <= 94) await page.evaluate((v) => window.__zgf.scrub(v, ".transport input.scrub"), t);
  if (i === 70) await cap("The replayed frames are rejected. The fire alarm stands.");
}, [40, 124]);

// 8. why to believe any of it (2.2 s)
await scene("ledger", 66, async () => {
  await page.evaluate(() => window.__zgf.capRight(0));
  await go("ledger", ".statline");
  await page.waitForSelector(".btn--primary:not([disabled])");
  await putAt(page.locator("section.panel[data-klass=\"synthetic\"]"), 150);
  await cap(`${FILES} NASA files, hash-chained. Change one character, and the chain breaks.`);
  const [x, y] = await centre(page.locator("button", { hasText: "Change one character of a file hash" }));
  await pointer(x + 300, y + 90);
  return [glide(x, y, 6, 24)];
}, async (i) => {
  if (i === 28) { await click(); await page.waitForSelector("section.panel[data-klass=\"synthetic\"] .verdict-line", { timeout: 20000 }); }
}, [60]);

// 9. the end card (1.2 s)
await scene("end", 36, async () => [], async (i) => { await page.evaluate((u) => window.__zgf.end(u), ease(i / 8)); }, [30]);

await browser.close();
server.close();
console.log(`frames: ${total} = ${(total / FPS).toFixed(2)} s`);

if (!PREVIEW) {
  const run = (args) => new Promise((res, rej) => { const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" }); p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c)))); });
  const list = path.join(OUT, "scenes.txt");
  fs.writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  const joined = path.join(OUT, "joined.tmp.mp4"), final = path.join(OUT, "zero-g-firewall_story.mp4"), ftmp = path.join(OUT, "final.tmp.mp4");
  await run(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
  await run(["-i", joined, "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-shortest", "-movflags", "+faststart", ftmp]);
  fs.renameSync(ftmp, final); fs.rmSync(joined);
  console.log("written", final);
}

