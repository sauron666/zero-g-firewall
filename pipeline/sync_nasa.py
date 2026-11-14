#!/usr/bin/env python3
"""
Zero-G Firewall - NASA sync.

Fetches, from NASA's own servers, everything the project is built on:

  1. the PSI "combustion" search (the first entry of the challenge's Resources tab),
  2. the metadata record of every investigation it returns,
  3. each investigation's experimental table and small summary files,
  4. the other official resources of the challenge (web pages, the Researcher's
     Guide PDF, the NASA Glenn fact sheets),
  5. NTRS records (and full text where NASA offers it) for the anchor reports.

Every response is stored byte for byte and recorded in a hash-chained ledger
(URL, SHA-256, size, HTTP date, UTC retrieval time). Nothing is edited, cleaned
or invented here; missing files stay missing and are listed in the report.

Standard library only. Python 3.9+.

    python sync_nasa.py                 # core sync into ./nasa_raw (a few minutes, tens of MB)
    python sync_nasa.py --out DIR       # another folder
    python sync_nasa.py --refresh       # fetch again even if cached
    python sync_nasa.py --extra PSI-117,PSI-115   # also every small tabular file of these records
    python sync_nasa.py --pdfs          # also NTRS report PDFs (large)
    python sync_nasa.py --pack-only     # no network: rebuild the report and the archive

Safe to interrupt with Ctrl+C and to run again: finished files are kept and reused.

1.1.0: version 1.0.0 fetched every small tabular file of every record, which is thousands of
files for the ACME and FLEX records. The core sync now takes the experimental table of each
record plus at most a few named summary files, under hard budgets.

Created during NASA Space Apps Challenge 2026 (14-15 November 2026).
AI-assisted code (Claude); reviewed by the team.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

SCRIPT_VERSION = "1.1.0"
UA = ("Mozilla/5.0 (compatible; ZeroG-Firewall-Sync/%s; NASA Space Apps Challenge 2026 team "
      "project; +https://github.com/sauron666)" % SCRIPT_VERSION)

PSI = "https://psi.nasa.gov"
PSI_SEARCH = PSI + "/geode-py/ws/repo/search?term={term}&source=psi&type=investigation&from=0&size=100"
PSI_META = PSI + "/geode-py/ws/repo/investigations/{acc}"
PSI_DOWNLOAD = PSI + "/geode-py/ws/studies/{acc}/download?file={file}{ver}&redirect={redir}"
PSI_THUMB = PSI + "/geode-py/ws/investigations/{acc}/image"

# The challenge's Resources tab as pasted by the team on 2026-11-13 (R1 is the PSI search above).
OFFICIAL = [
    ("R2", "glenn_combustion_science", "html",
     "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/"),
    ("R3", "sciencecast_video_oembed", "json",
     "https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DW1oXykoz9zg&format=json"),
    ("R4", "researchers_guide_landing", "html",
     "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/"),
    ("R4", "researchers_guide", "pdf",
     "https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf"),
    ("R5", "apollo_1", "html", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1"),
    ("R6", "apollo_13", "html", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13"),
    ("R7", "mir_fire_1997", "html", "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/"),
    ("R8", "spinoff_firemans_air_tanks", "html", "https://spinoff.nasa.gov/node/9582"),
    ("R9", "spinoff_fire_detector", "html", "https://spinoff.nasa.gov/node/9407"),
    ("R10", "spinoff_fire_attire", "html", "https://spinoff.nasa.gov/node/9918"),
]
# NASA pages that are not on the Resources tab but are cited as extras.
EXTRAS = [
    ("X1", "apollo_204_review_board_summary", "html",
     "https://www.nasa.gov/missions/apollo/apollo-1/apollo-204-review-board-summary/"),
    ("X2", "psi_database_guide", "pdf",
     "https://science.nasa.gov/wp-content/uploads/2024/11/psi-database-guide.pdf"),
    ("X3", "psi_investigations_by_research_area", "html",
     "https://www.nasa.gov/physical-sciences-informatics-psi/psi-investigations-by-research-area/"),
]
# Anchor reports on the NASA Technical Reports Server.
NTRS_IDS = ["20210011385", "20130010991", "20260001966", "20260000646", "20250010653",
            "20240002981", "20030011406", "20150023456", "20200000557"]
# Extra PSI searches: has PSI added records for these since the dossier was written?
EXTRA_TERMS = ["Saffire", "LUCI", "FM2", "SoFIE", "flammability", "fire safety", "smoke"]

SMALL_EXT = (".csv", ".xlsx", ".xls", ".txt", ".dat", ".json", ".tsv")
DOC_EXT = (".pdf", ".doc", ".docx")
# permissive rule, used only for records named with --extra
WANT = re.compile(r"(summary|result|table|smoke.?point|flame.?length|fact.?sheet|readme|"
                  r"data.?dictionary|test.?matrix|combined|final.?report|30day|1year)", re.I)
# core rule: summary files that are known to hold the per-test or aerosol results
CORE_STRONG = re.compile(r"(combined.?samer.?results|retrieved.?data.?summary|data.?summary|smoke.?point|flame.?length)", re.I)
CORE_OK = re.compile(r"(fact.?sheet|test.?matrix|data.?dictionary|read.?me|summary.?table|results.?summary)", re.I)
CORE_MAX_FILES = 4               # supporting files per record in the core sync
CORE_MAX_BYTES = 12_000_000      # and their total size per record

CAP_TABLE = 20_000_000        # experimental tables: always fetch, up to 20 MB
CAP_SMALL = 6_000_000         # other tabular files
CAP_DOC = 12_000_000          # documents inside PSI records
CAP_PAGE = 4_000_000          # web pages
CAP_PDF = 40_000_000          # official PDFs
PER_INVESTIGATION_BUDGET = 45_000_000   # for --extra records
CORE_ZIP_FILE_LIMIT = 9_000_000         # larger files stay out of the core archive
CORE_ZIP_BUDGET = 48_000_000            # the archive that is attached to the build chat
ESSENTIAL = ("psi_search", "psi_meta", "official", "extra", "ntrs_record")


def utcnow() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def safe_name(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9._() +,&=\[\]-]", "_", s).strip()
    return s[:180] or "file"


def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    try:  # helps python.org builds on macOS that ship without system certificates
        import certifi  # type: ignore
        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    return ctx


class Fetcher:
    def __init__(self, out: str, refresh: bool, delay: float):
        self.out = out
        self.refresh = refresh
        self.delay = delay
        self.ctx = make_ssl_context()
        self.opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=self.ctx))
        self.ledger_path = os.path.join(out, "ledger", "ledger.jsonl")
        os.makedirs(os.path.dirname(self.ledger_path), exist_ok=True)
        self.entries: list[dict] = []
        self.by_key: dict[str, dict] = {}
        self.failures: list[dict] = []
        self.skipped: list[dict] = []
        self.new_bytes = 0            # fetched in this run
        self.run_budget = 150_000_000
        if os.path.exists(self.ledger_path):
            with open(self.ledger_path, encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        e = json.loads(line)
                        self.entries.append(e)
                        self.by_key[e["key"]] = e
        self.last_request = 0.0

    # -- network ---------------------------------------------------------
    def _get(self, url: str, cap: int, accept: str = "*/*"):
        wait = self.delay - (time.time() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": accept,
                                                   "Accept-Language": "en"})
        last_err = None
        for attempt in range(4):
            try:
                self.last_request = time.time()
                with self.opener.open(req, timeout=90) as resp:
                    clen = resp.headers.get("Content-Length")
                    if clen and clen.isdigit() and int(clen) > cap:
                        return {"error": "too_large", "size": int(clen)}
                    chunks, total = [], 0
                    while True:
                        chunk = resp.read(1 << 16)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > cap:
                            return {"error": "too_large", "size": total}
                        chunks.append(chunk)
                    return {"status": resp.status, "final_url": resp.geturl(), "body": b"".join(chunks),
                            "headers": {k.lower(): v for k, v in resp.headers.items()}}
            except urllib.error.HTTPError as e:
                last_err = "HTTP %s" % e.code
                if e.code in (400, 401, 403, 404, 410):
                    return {"error": last_err}
            except ssl.SSLCertVerificationError as e:
                return {"error": "TLS certificate check failed (%s). On macOS run 'Install "
                                 "Certificates.command' from the Python folder, or: pip install certifi" % e}
            except Exception as e:  # timeouts, resets
                last_err = "%s: %s" % (type(e).__name__, e)
            time.sleep(2.0 * (attempt + 1))
        return {"error": last_err or "unknown"}

    # -- ledger ----------------------------------------------------------
    def _append(self, entry: dict):
        prev = self.entries[-1]["entry_hash"] if self.entries else "0" * 64
        entry["seq"] = len(self.entries)
        entry["prev_hash"] = prev
        body = json.dumps(entry, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        entry["entry_hash"] = sha256((prev + body).encode("utf-8"))
        self.entries.append(entry)
        self.by_key[entry["key"]] = entry
        with open(self.ledger_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, sort_keys=True, ensure_ascii=False) + "\n")

    def fetch(self, key: str, urls, relpath: str, kind: str, cap: int, meta: dict | None = None,
              accept: str = "*/*", quiet: bool = False):
        """Fetch the first URL that works; store bytes; add a ledger entry. Returns bytes or None."""
        path = os.path.join(self.out, relpath)
        old = self.by_key.get(key)
        if old and not self.refresh and os.path.exists(path):
            with open(path, "rb") as fh:
                b = fh.read()
            if sha256(b) == old["sha256"]:
                return b
        if isinstance(urls, str):
            urls = [urls]
        essential = kind in ESSENTIAL or (meta or {}).get("role") == "experimental_table"
        if not essential and self.new_bytes > self.run_budget:
            self.skipped.append({"key": key, "reason": "run budget reached (raise it with --max-mb)"})
            return None
        errors = []
        for url in urls:
            r = self._get(url, cap, accept)
            if "error" in r:
                errors.append({"url": url, "error": r["error"], **({"size": r["size"]} if "size" in r else {})})
                continue
            body = r["body"]
            # redirect=false style answers: a small JSON holding a signed link
            if kind == "psi_file" and len(body) < 4000 and body[:1] in (b"{", b'"'):
                try:
                    j = json.loads(body.decode("utf-8"))
                    link = j if isinstance(j, str) else next(
                        (v for v in j.values() if isinstance(v, str) and v.startswith("http")), None)
                    if link:
                        r2 = self._get(link, cap, accept)
                        if "error" not in r2:
                            r, body = r2, r2["body"]
                            r["final_url"] = "(signed link issued by %s)" % url
                except Exception:
                    pass
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as fh:
                fh.write(body)
            self.new_bytes += len(body)
            h = r["headers"]
            final = r.get("final_url", url)
            if "X-Amz-" in final or "Signature=" in final:   # do not store temporary credentials
                final = final.split("?")[0] + "?(signed query removed)"
            self._append({
                "key": key, "kind": kind, "url": url, "final_url": final,
                "status": r.get("status"), "sha256": sha256(body), "size": len(body),
                "content_type": h.get("content-type", ""), "http_date": h.get("date", ""),
                "last_modified": h.get("last-modified", ""), "etag": h.get("etag", ""),
                "retrieved_at_utc": utcnow(), "local_path": relpath.replace("\\", "/"),
                **(meta or {}),
            })
            if not quiet:
                print("  ok   %-9s %9d B  %s" % (kind, len(body), relpath))
            return body
        self.failures.append({"key": key, "kind": kind, "relpath": relpath, "attempts": errors, **(meta or {})})
        if not quiet:
            print("  FAIL %-9s %s  (%s)" % (kind, relpath, "; ".join(str(e.get("error")) for e in errors)[:160]))
        return None


# -- PSI -------------------------------------------------------------------
def accession_of(src: dict) -> str | None:
    for k in ("Accession", "accession"):
        v = src.get(k)
        if isinstance(v, str) and re.fullmatch(r"PSI-\d+", v.strip()):
            return v.strip()
    m = re.search(r"PSI-\d+", json.dumps(src.get("Thumbnail", "")))
    return m.group(0) if m else None


def file_urls(acc: str, rec: dict, study_version) -> list[str]:
    name = urllib.parse.quote(str(rec.get("file_name", "")), safe="")
    cands = []
    versions = []
    for v in (rec.get("version"), study_version):
        if isinstance(v, (int, float)) and int(v) not in versions:
            versions.append(int(v))
    for v in versions:
        cands.append(PSI_DOWNLOAD.format(acc=acc, file=name, ver="&version=%d" % v, redir="true"))
    cands.append(PSI_DOWNLOAD.format(acc=acc, file=name, ver="", redir="true"))
    for v in versions[:1]:
        cands.append(PSI_DOWNLOAD.format(acc=acc, file=name, ver="&version=%d" % v, redir="false"))
    ru = rec.get("remote_url")
    if isinstance(ru, str) and ru.startswith("/"):
        cands.append(PSI + urllib.parse.quote(ru, safe="/()"))
    return cands


def wanted(rec: dict) -> tuple[bool, int, str]:
    name = str(rec.get("file_name", ""))
    low = name.lower()
    try:
        size = int(float(rec.get("file_size") or 0))
    except Exception:
        size = 0
    if rec.get("restricted") is True or rec.get("visible") is False:
        return False, 0, "restricted or hidden"
    if low.endswith(SMALL_EXT):
        if size <= 1_500_000 or (WANT.search(name) and size <= CAP_SMALL):
            return True, CAP_SMALL, ""
        return False, 0, "tabular file over the size limit (%d B)" % size
    if low.endswith(DOC_EXT) and WANT.search(name) and size <= CAP_DOC:
        return True, CAP_DOC, ""
    return False, 0, "not a table or summary document"


def core_support(meta: dict) -> list[dict]:
    """The few supporting files of a record that the core sync takes: named summaries, smallest first."""
    cands = []
    for rec in (meta.get("added") or []):
        name = str(rec.get("file_name", ""))
        low = name.lower()
        if not name or rec.get("restricted") is True or rec.get("visible") is False:
            continue
        try:
            size = int(float(rec.get("file_size") or 0))
        except Exception:
            size = 0
        strong = bool(CORE_STRONG.search(name))
        if low.endswith(SMALL_EXT) and (strong or CORE_OK.search(name)) and size <= CAP_SMALL:
            cands.append((0 if strong else 1, size, rec))
        elif low.endswith(".pdf") and re.search(r"fact.?sheet", name, re.I) and size <= 5_000_000:
            cands.append((2, size, rec))
    cands.sort(key=lambda c: (c[0], c[1]))
    out, total = [], 0
    for _, size, rec in cands:
        if len(out) >= CORE_MAX_FILES or total + size > CORE_MAX_BYTES:
            continue
        out.append(rec)
        total += size
    return out


def sync_psi(f: Fetcher, extra: set[str] | None = None):
    print("\n[1/4] PSI search")
    body = f.fetch("psi:search:combustion", PSI_SEARCH.format(term="combustion"),
                   "psi/search_combustion.json", "psi_search", 20_000_000,
                   {"term": "combustion", "official_resource": "R1"}, "application/json")
    if not body:
        sys.exit("The PSI search could not be fetched. Check the network and run again.")
    hits = json.loads(body.decode("utf-8"))["hits"]["hits"]
    accs = []
    for h in hits:
        a = accession_of(h.get("_source", {}))
        if a and a not in accs:
            accs.append(a)
    print("  %d hits -> %s" % (len(hits), ", ".join(accs)))
    for term in EXTRA_TERMS:
        f.fetch("psi:search:" + term, PSI_SEARCH.format(term=urllib.parse.quote(term)),
                "psi/search_%s.json" % safe_name(term.replace(" ", "_")), "psi_search", 20_000_000,
                {"term": term}, "application/json", quiet=True)

    print("\n[2/4] PSI investigations: metadata, experimental tables, summary files")
    for acc in sorted(accs, key=lambda s: int(s.split("-")[1])):
        mb = f.fetch("psi:meta:" + acc, PSI_META.format(acc=acc), "psi/investigations/%s.json" % acc,
                     "psi_meta", 40_000_000, {"accession": acc}, "application/json")
        if not mb:
            continue
        meta = json.loads(mb.decode("utf-8"))
        sv = meta.get("version")
        budget = PER_INVESTIGATION_BUDGET
        seen = set()
        for rec in (meta.get("experimentalTable") or []):
            name = str(rec.get("file_name", ""))
            if not name or name in seen:
                continue
            seen.add(name)
            b = f.fetch("psi:file:%s:%s" % (acc, name), file_urls(acc, rec, sv),
                        "psi/files/%s/%s" % (acc, safe_name(name)), "psi_file", CAP_TABLE,
                        {"accession": acc, "file_name": name, "psi_file_version": rec.get("version"),
                         "psi_study_version": sv, "role": "experimental_table",
                         "declared_size": rec.get("file_size"), "doi": meta.get("doi", "")})
            budget -= len(b or b"")
        permissive = bool(extra) and acc in extra
        for rec in ((meta.get("added") or []) if permissive else core_support(meta)):
            name = str(rec.get("file_name", ""))
            if not name or name in seen:
                continue
            if permissive:
                ok, cap, why = wanted(rec)
                if not ok:
                    continue
            else:
                cap = CAP_SMALL
            seen.add(name)
            try:
                size = int(float(rec.get("file_size") or 0))
            except Exception:
                size = 0
            if size > budget:
                f.skipped.append({"accession": acc, "file_name": name, "reason": "per-investigation budget"})
                continue
            b = f.fetch("psi:file:%s:%s" % (acc, name), file_urls(acc, rec, sv),
                        "psi/files/%s/%s" % (acc, safe_name(name)), "psi_file", cap,
                        {"accession": acc, "file_name": name, "psi_file_version": rec.get("version"),
                         "psi_study_version": sv, "role": "supporting_file", "selection": "extra" if permissive else "core",
                         "declared_size": rec.get("file_size"), "doi": meta.get("doi", "")})
            budget -= len(b or b"")
        f.fetch("psi:thumb:" + acc, PSI_THUMB.format(acc=acc), "psi/thumbnails/%s.img" % acc,
                "psi_thumb", 3_000_000, {"accession": acc}, quiet=True)


# -- official resources and literature ---------------------------------------
def sync_official(f: Fetcher):
    print("\n[3/4] Official resources of the challenge, and NASA pages cited as extras")
    for rid, name, ext, url in OFFICIAL + EXTRAS:
        cap = CAP_PDF if ext == "pdf" else CAP_PAGE
        f.fetch("doc:" + name, url, "official/%s.%s" % (name, ext), "official" if rid.startswith("R") else "extra",
                cap, {"resource_id": rid, "doc_id": name})
    # Fact sheets and child pages linked from the NASA Glenn page (take names from the live page).
    p = os.path.join(f.out, "official", "glenn_combustion_science.html")
    if os.path.exists(p):
        html = open(p, "rb").read().decode("utf-8", "replace")
        links = sorted(set(re.findall(r'href="(https?://[^"#]+)"', html)))
        pdfs = [u for u in links if u.lower().endswith(".pdf") and "nasa.gov" in u]
        for u in pdfs[:30]:
            nm = safe_name(u.rsplit("/", 1)[-1])
            f.fetch("doc:glenn_pdf:" + nm, u, "official/glenn_linked/%s" % nm, "official_child", CAP_PDF,
                    {"resource_id": "R2", "doc_id": "glenn_pdf_" + nm.lower().replace(".pdf", ""), "linked_from": "glenn_combustion_science"})
        kids = [u for u in links if "nasa.gov" in u and not u.lower().endswith((".pdf", ".jpg", ".png"))
                and re.search(r"(fm2|flammab|sofie|solid-fuel|flare|saffire|/bass|acme|/flex|same|daft|slice|spice|"
                              r"combustion-integrated-rack|microgravity-science-glovebox|fire-safety)", u, re.I)]
        for u in kids[:25]:
            nm = safe_name(u.rstrip("/").rsplit("/", 1)[-1]) or "page"
            f.fetch("doc:glenn_child:" + nm, u, "official/glenn_linked/%s.html" % nm, "official_child", CAP_PAGE,
                    {"resource_id": "R2", "doc_id": "glenn_child_" + nm.lower(), "linked_from": "glenn_combustion_science"})


def sync_ntrs(f: Fetcher, with_pdfs: bool):
    print("\n[4/4] NTRS records for the anchor reports")
    for nid in NTRS_IDS:
        b = f.fetch("ntrs:record:" + nid, "https://ntrs.nasa.gov/api/citations/" + nid,
                    "ntrs/%s.json" % nid, "ntrs_record", 5_000_000, {"ntrs_id": nid}, "application/json")
        if not b:
            continue
        text = b.decode("utf-8", "replace")
        paths = sorted(set(re.findall(r'"(/api/citations/%s/downloads/[^"]+)"' % nid, text)))
        for pth in paths:
            low = pth.lower()
            nm = safe_name(urllib.parse.unquote(pth.rsplit("/", 1)[-1]))
            if low.endswith(".txt"):
                f.fetch("ntrs:text:%s:%s" % (nid, nm), "https://ntrs.nasa.gov" + urllib.parse.quote(pth),
                        "ntrs/fulltext/%s_%s" % (nid, nm), "ntrs_fulltext", 8_000_000, {"ntrs_id": nid})
            elif low.endswith(".pdf") and with_pdfs:
                f.fetch("ntrs:pdf:%s:%s" % (nid, nm), "https://ntrs.nasa.gov" + urllib.parse.quote(pth),
                        "ntrs/pdf/%s_%s" % (nid, nm), "ntrs_pdf", 60_000_000, {"ntrs_id": nid})


# -- packaging ---------------------------------------------------------------
def verify_chain(entries: list[dict]) -> bool:
    prev = "0" * 64
    for e in entries:
        body = {k: v for k, v in e.items() if k != "entry_hash"}
        if body.get("prev_hash") != prev:
            return False
        s = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        if sha256((prev + s).encode("utf-8")) != e["entry_hash"]:
            return False
        prev = e["entry_hash"]
    return True


def is_core(e: dict) -> bool:
    """What goes into the archive attached to the build chat."""
    k = e.get("kind", "")
    if k in ("psi_search", "psi_meta", "psi_thumb", "official", "official_child", "extra", "ntrs_record", "ntrs_fulltext"):
        return True
    if k == "psi_file":
        if e.get("role") == "experimental_table" or e.get("selection") == "core":
            return True
        name = str(e.get("file_name", ""))
        return bool(CORE_STRONG.search(name)) and e.get("size", 0) <= CAP_SMALL
    return False


def package(f: Fetcher, started: str, zip_all: bool = False):
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with open(os.path.abspath(__file__), "rb") as fh:
        script_hash = sha256(fh.read())
    kinds: dict[str, int] = {}
    for e in f.entries:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    report = {
        "tool": "sync_nasa.py", "version": SCRIPT_VERSION, "script_sha256": script_hash,
        "python": sys.version.split()[0], "platform": sys.platform,
        "started_utc": started, "finished_utc": utcnow(),
        "ledger_entries": len(f.entries), "ledger_chain_ok": verify_chain(f.entries),
        "ledger_head": f.entries[-1]["entry_hash"] if f.entries else None,
        "by_kind": kinds, "total_bytes": sum(e["size"] for e in f.entries),
        "failures": f.failures, "skipped": f.skipped,
    }
    with open(os.path.join(f.out, "sync_report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    core = os.path.join(f.out, "zgf_raw_core_%s.zip" % stamp)
    big = os.path.join(f.out, "zgf_raw_rest_%s.zip" % stamp)
    n_core = n_big = n_left = 0
    used = 0
    order = {"psi_search": 0, "psi_meta": 1, "psi_file": 2, "official": 3, "extra": 4, "ntrs_record": 5,
             "ntrs_fulltext": 6, "official_child": 7, "psi_thumb": 8}
    latest = {e["key"]: e for e in f.entries}                    # a refreshed file appears once
    ranked = sorted(latest.values(), key=lambda e: (order.get(e["kind"], 9), e["size"]))
    with zipfile.ZipFile(core, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zc, \
            zipfile.ZipFile(big, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zb:
        zc.write(f.ledger_path, "ledger/ledger.jsonl")
        zc.write(os.path.join(f.out, "sync_report.json"), "sync_report.json")
        for e in ranked:
            p = os.path.join(f.out, e["local_path"])
            if not os.path.exists(p):
                continue
            essential = e["kind"] in ESSENTIAL or e.get("role") == "experimental_table"
            optional_ok = e["size"] <= CORE_ZIP_FILE_LIMIT and used + e["size"] <= CORE_ZIP_BUDGET
            if is_core(e) and (essential or optional_ok):
                zc.write(p, e["local_path"]); n_core += 1
                if not essential:
                    used += e["size"]
            elif zip_all:
                zb.write(p, e["local_path"]); n_big += 1
            else:
                n_left += 1
    if n_big == 0:
        os.remove(big)
    print("\nDone.")
    print("  ledger entries : %d  (chain ok: %s)" % (len(f.entries), report["ledger_chain_ok"]))
    print("  by kind        : %s" % ", ".join("%s=%d" % kv for kv in sorted(kinds.items())))
    print("  bytes stored   : %d" % report["total_bytes"])
    print("  failures       : %d   skipped: %d   (details in sync_report.json)" % (len(f.failures), len(f.skipped)))
    print("  core archive   : %s  (%.1f MB, %d files)" % (core, os.path.getsize(core) / 1e6, n_core))
    if n_big:
        print("  rest archive   : %s  (%.1f MB, %d files)" % (big, os.path.getsize(big) / 1e6, n_big))
    if n_left:
        print("  not archived   : %d other files stay in the folder, each with its ledger entry" % n_left)
    print("\nThe folder is the project's raw cache: the pipeline reads it directly. The core archive is a")
    print("portable copy of the essentials (ledger, search, metadata, experimental tables, official resources).")


def main():
    ap = argparse.ArgumentParser(description="Fetch NASA data for Zero-G Firewall with a hash-chained ledger.")
    ap.add_argument("--out", default="nasa_raw")
    ap.add_argument("--refresh", action="store_true", help="fetch again even if a cached copy exists")
    ap.add_argument("--pdfs", action="store_true", help="also download NTRS report PDFs")
    ap.add_argument("--delay", type=float, default=0.35, help="seconds between requests")
    ap.add_argument("--only", choices=["psi", "official", "ntrs"], help="run one stage")
    ap.add_argument("--extra", default="", help="comma-separated accessions whose small tabular files are all fetched, e.g. PSI-117,PSI-115")
    ap.add_argument("--max-mb", type=float, default=150.0, help="budget for non-essential downloads in this run")
    ap.add_argument("--pack-only", action="store_true", help="no network: rebuild the report and the archive from the folder")
    ap.add_argument("--zip-all", action="store_true", help="also archive everything outside the core set")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    started = utcnow()
    print("Zero-G Firewall NASA sync %s, started %s, output: %s" % (SCRIPT_VERSION, started, os.path.abspath(a.out)))
    f = Fetcher(a.out, a.refresh, a.delay)
    f.run_budget = int(a.max_mb * 1e6)
    if f.entries:
        print("  resuming: %d files already in the ledger (%.1f MB)" % (len(f.entries), sum(e["size"] for e in f.entries) / 1e6))
    extra = {x.strip().upper() for x in a.extra.split(",") if x.strip()}
    try:
        if not a.pack_only:
            if a.only in (None, "psi"):
                sync_psi(f, extra)
            if a.only in (None, "official"):
                sync_official(f)
            if a.only in (None, "ntrs"):
                sync_ntrs(f, a.pdfs)
    except KeyboardInterrupt:
        print("\nInterrupted. Everything finished so far is kept; packaging it now. Run again to continue.")
    package(f, started, a.zip_all)


if __name__ == "__main__":
    main()
