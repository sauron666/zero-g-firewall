/*
 * Offline copy of Zero-G Firewall. After one visit with a connection the whole site, with its data, opens with none:
 * the shell, the scripts and fonts the page loaded, and every data file named in the manifest.
 * While a connection exists the network wins for pages and data, so a new build is never hidden by an old copy.
 */
const CACHE = "zgf-v1";
const DATA = "./data/v1/";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(["./", "./index.html", DATA + "manifest.json"]);
    try {
      const manifest = await (await fetch(DATA + "manifest.json", { cache: "no-cache" })).json();
      const names = [...Object.keys(manifest.artifacts || {}), "ledger.jsonl"];
      await Promise.all(names.map((n) => cache.add(DATA + n).catch(() => null)));       // one missing file must not stop the rest
    } catch (e) { /* no manifest yet: the shell alone is cached */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page tells the worker which scripts, styles and fonts it loaded before the worker was in control.
self.addEventListener("message", (event) => {
  const urls = (event.data && event.data.cache) || [];
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((u) => cache.add(u).catch(() => null)))));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;                 // models, keys and other sites are never cached
  const hashed = url.pathname.includes("/assets/");
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (hashed) {                                                                           // a hashed file never changes
      const hit = await cache.match(req);
      if (hit) return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === "navigate" ? await cache.match("./index.html") : null);
      if (hit) return hit;
      throw e;
    }
  })());
});
