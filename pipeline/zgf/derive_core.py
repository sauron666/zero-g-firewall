"""
Derivation, first stage: from the raw cache and its ledger to the artifacts the site reads.

Rules enforced here:
  * every value comes from a file in the ledger whose bytes still match its recorded hash;
  * nothing is interpreted that the file does not say: table cells stay text, missing stays missing;
  * each derived field names the rule that produced it.

Next stages (units, canonical columns, what-varied, ranking features, envelope points,
literature passages) build on these artifacts; see docs/NEXT.md and docs/CONTRACTS.md.
"""
from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import os
import re

from . import ledger as L
from . import BRAND, TEAM, MASCOT, SCHEMA

OFFICIAL = [
    ("R1", "PSI repository, combustion search", "https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation", "data", ["psi:search:combustion"]),
    ("R2", "NASA Glenn, Combustion Science", "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/", "page", ["doc:glenn_combustion_science"]),
    ("R3", "NASA ScienceCasts: The Power of Studying Combustion on the ISS", "https://www.youtube.com/watch?v=W1oXykoz9zg", "video", ["doc:sciencecast_video_oembed"]),
    ("R4", "A Researcher's Guide to: Combustion Science", "https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/", "book", ["doc:researchers_guide", "doc:researchers_guide_landing"]),
    ("R5", "Apollo 1 case study", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-1", "page", ["doc:apollo_1"]),
    ("R6", "Apollo 13 case study", "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13", "page", ["doc:apollo_13"]),
    ("R7", "Fire aboard space station Mir", "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/", "page", ["doc:mir_fire_1997"]),
    ("R8", "Spinoff: Fireman's Air Tanks", "https://spinoff.nasa.gov/node/9582", "page", ["doc:spinoff_firemans_air_tanks"]),
    ("R9", "Spinoff: Fire Detector", "https://spinoff.nasa.gov/node/9407", "page", ["doc:spinoff_fire_detector"]),
    ("R10", "Spinoff: New Technology for the Fire Attire", "https://spinoff.nasa.gov/node/9918", "page", ["doc:spinoff_fire_attire"]),
]


def _iso(mdy: str | None) -> str | None:
    """PSI dates are MM-DD-YYYY."""
    m = re.fullmatch(r"(\d{2})-(\d{2})-(\d{4})", (mdy or "").strip())
    return "%s-%s-%s" % (m.group(3), m.group(1), m.group(2)) if m else None


def _roles(c: dict) -> str:
    r = c.get("roles")
    items = r if isinstance(r, list) else [r] if r else []
    out = [x.get("annotationValue", "") if isinstance(x, dict) else str(x) for x in items]
    return ", ".join(x for x in out if x)


def hardware_family(meta: dict) -> tuple[str, str]:
    """A coarse grouping for 'similarities and differences'. Returns (family, rule that matched)."""
    hw = (meta.get("experimentHardware") or "") + " " + (meta.get("investigationAcronym") or "")
    low = hw.lower()
    if (meta.get("projectType") or "").lower().startswith("ground"):
        return "GROUND", "projectType is a ground investigation"
    for fam, pat in (("CIR_ACME", r"\bacme\b"), ("CIR_MDCA", r"mdca|multi-user droplet"),
                     ("AEROSOL", r"p-trak|\bsame\b|same-r|\bdaft\b|aerosol"),
                     ("CYGNUS", r"cygnus|saffire"), ("MSG", r"glovebox|\bmsg\b")):
        if re.search(pat, low):
            return fam, "hardware or acronym matches /%s/" % pat
    return "OTHER", "no rule matched"


def file_inventory(meta: dict) -> dict:
    """What PSI holds for this record, from its metadata (nothing is downloaded for this)."""
    by: dict[str, dict] = {}
    n = total = 0
    for rec in (meta.get("added") or []):
        name = str(rec.get("file_name", ""))
        try:
            size = int(float(rec.get("file_size") or 0))
        except Exception:
            size = 0
        ext = (os.path.splitext(name)[1].lower().lstrip(".") or "none")
        folder = ""
        m = re.match(r"/Home/psi-data/[^/]+/([^/]+)/", str(rec.get("remote_path") or ""))
        if m:
            folder = m.group(1)
        key = folder or ext
        b = by.setdefault(key, {"count": 0, "bytes": 0, "extensions": {}})
        b["count"] += 1
        b["bytes"] += size
        b["extensions"][ext] = b["extensions"].get(ext, 0) + 1
        n += 1
        total += size
    return {"count": n, "bytes_listed": total, "by_folder": by,
            "total_file_size_stated": meta.get("totalFileSize")}


def investigation(meta: dict, hit: dict, entry: dict) -> dict:
    acc = meta.get("accession") or hit.get("Accession")
    fam, fam_rule = hardware_family(meta)
    area = meta.get("researchArea") or hit.get("Research Area") or ""
    in_scope = area.strip().lower() == "combustion science"
    ptype = meta.get("projectType") or hit.get("Project Type") or ""
    field = lambda name: L.ref(entry, kind="psi_meta", field=name)
    return {
        "accession": acc,
        "acronym": meta.get("investigationAcronym") or hit.get("Acronym") or "",
        "title": meta.get("title") or hit.get("Title") or "",
        "doi": meta.get("doi") or None,
        "license": meta.get("licenseIdentifier") or None,
        "project_type": ptype,
        "gravity": "ground" if ptype.lower().startswith("ground") else "micro" if ptype else "unknown",
        "research_area": area,
        "sub_research_area": meta.get("subResearchArea") or hit.get("SubResearch Area") or "",
        "hardware": meta.get("experimentHardware") or "",
        "hardware_link": meta.get("experimentHardwareLink") or "",
        "hardware_family": fam,
        "platform": meta.get("flightProgram") or hit.get("Flight Platform") or "",
        "center": meta.get("managingNasaCenter") or "",
        "start": _iso(meta.get("investigationStartDate")), "end": _iso(meta.get("investigationEndDate")),
        "psi_version": meta.get("version"), "version_reason": meta.get("versionReason") or None,
        "modified": meta.get("modifiedDate") or None, "released": meta.get("releaseDate") or None,
        "objective": meta.get("objective") or "", "approach": meta.get("approach") or "",
        "hypothesis": meta.get("hypothesis") or "", "impacts": meta.get("researchImpacts") or "",
        "people": [{"name": " ".join(x for x in (c.get("firstName"), c.get("midInitials"), c.get("lastName")) if x),
                    "role": _roles(c), "affiliation": c.get("affiliation") or ""} for c in (meta.get("contacts") or [])],
        "publications": [{"title": p.get("title") or "", "authors": p.get("authorList") or "", "doi": p.get("doi") or None}
                         for p in (meta.get("publications") or [])],
        "related": [x for x in re.findall(r"PSI-\d+", str(meta.get("related_glds") or ""))],
        "files": file_inventory(meta),
        "tables": [],                                   # filled by tables()
        "scope": {"in_scope": in_scope,
                  "reason": "research area in PSI is '%s'" % area if area else "PSI gives no research area"},
        "derivations": {"hardware_family": fam_rule, "gravity": "from projectType", "scope": "in scope when researchArea is Combustion Science"},
        "refs": {k: field(v) for k, v in (("title", "title"), ("objective", "objective"), ("approach", "approach"),
                                          ("hypothesis", "hypothesis"), ("impacts", "researchImpacts"), ("hardware", "experimentHardware"),
                                          ("doi", "doi"), ("license", "licenseIdentifier"), ("psi_version", "version"),
                                          ("publications", "publications"), ("files", "added"))},
        "psi_url": "https://psi.nasa.gov/physci/repo/data/investigations/%s" % acc,
    }


def decode_table(b: bytes) -> tuple[str, str]:
    """Text and the encoding that produced it. PSI tables are UTF-8 or Windows-1252."""
    try:
        return b.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return b.decode("cp1252"), "windows-1252"


def table(entry: dict, b: bytes) -> dict:
    """A table as NASA wrote it: header texts and cell texts, nothing coerced, each row addressable."""
    text, enc = decode_table(b)
    rows = list(csv.reader(io.StringIO(text)))
    header = [h.strip() for h in rows[0]] if rows else []
    data = [[c.strip() for c in r] for r in rows[1:] if any(c.strip() for c in r)]
    width = max([len(header)] + [len(r) for r in data]) if rows else 0
    findings = []
    if enc != "utf-8":
        findings.append({"kind": "encoding", "detail": "file is not UTF-8; decoded as Windows-1252"})
    if any(len(r) != len(header) for r in data):
        findings.append({"kind": "ragged_rows", "detail": "%d data rows differ in length from the header" % sum(len(r) != len(header) for r in data)})
    if len(set(header)) != len(header):
        findings.append({"kind": "duplicate_headers", "detail": "some column headers repeat"})
    if any(len(h) == 40 for h in header):
        findings.append({"kind": "truncated_headers", "detail": "%d headers are exactly 40 characters long, which suggests truncation" % sum(len(h) == 40 for h in header)})
    return {
        "accession": entry.get("accession"), "file": entry.get("file_name"), "sha256": entry["sha256"],
        "ledger_seq": entry["seq"], "url": entry["url"], "psi_file_version": entry.get("psi_file_version"),
        "encoding": enc, "count_rule": "rows after the header that have at least one non-empty cell",
        "n_rows": len(data), "n_cols": width, "columns": header, "rows": data, "findings": findings,
    }


def slug(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")[:80]


def run(raw_dir: str, out_dir: str) -> dict:
    entries = L.load(raw_dir)
    L.verify_chain(entries)
    by_key = L.latest(entries)
    os.makedirs(os.path.join(out_dir, "tables"), exist_ok=True)
    written: dict[str, dict] = {}

    def put(rel: str, obj, klass: str):
        b = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        path = os.path.join(out_dir, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(b)
        written[rel] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": klass}

    # the search (official resource R1)
    s_entry = by_key.get("psi:search:combustion")
    if not s_entry:
        raise L.LedgerError("the PSI combustion search is not in the ledger")
    search = json.loads(L.read(raw_dir, s_entry).decode("utf-8"))
    hits = [h.get("_source", {}) for h in search["hits"]["hits"]]

    investigations, tables_index, n_rows = [], [], 0
    for hit in hits:
        acc = hit.get("Accession") or (re.search(r"PSI-\d+", json.dumps(hit.get("Thumbnail", ""))) or [None])[0]
        m_entry = by_key.get("psi:meta:%s" % acc)
        if not m_entry:
            investigations.append({"accession": acc, "title": hit.get("Title", ""), "missing": "metadata record not in the ledger",
                                   "scope": {"in_scope": False, "reason": "metadata record was not fetched"}})
            continue
        meta = json.loads(L.read(raw_dir, m_entry).decode("utf-8"))
        inv = investigation(meta, hit, m_entry)
        for e in entries:
            if e.get("kind") == "psi_file" and e.get("accession") == acc and e.get("role") == "experimental_table" and by_key[e["key"]] is e:
                name = str(e.get("file_name", ""))
                if not name.lower().endswith(".csv"):
                    inv["tables"].append({"file": name, "sha256": e["sha256"], "ledger_seq": e["seq"], "note": "not a CSV; not parsed in this stage"})
                    continue
                t = table(e, L.read(raw_dir, e))
                rel = "tables/%s__%s.json" % (acc, slug(os.path.splitext(name)[0]))
                put(rel, t, "observed")
                ti = {"accession": acc, "file": name, "artifact": rel, "rows": t["n_rows"], "cols": t["n_cols"], "sha256": e["sha256"],
                      "ledger_seq": e["seq"], "encoding": t["encoding"], "findings": len(t["findings"])}
                inv["tables"].append(ti)
                tables_index.append(ti)
                if inv["scope"]["in_scope"]:
                    n_rows += t["n_rows"]
        investigations.append(inv)

    investigations.sort(key=lambda i: int(str(i["accession"]).split("-")[1]) if i.get("accession") else 0)
    put("investigations.json", {"klass": "observed", "source": "NASA PSI metadata records, as fetched", "search_ledger_seq": s_entry["seq"],
                                "search_total": search["hits"].get("total"), "items": investigations}, "observed")
    put("tables/index.json", {"klass": "observed", "items": tables_index}, "observed")

    resources = []
    for rid, title, url, typ, keys in OFFICIAL:
        receipts = [L.ref(by_key[k]) for k in keys if k in by_key]
        resources.append({"id": rid, "title": title, "url": url, "type": typ, "receipts": receipts,
                          "in_ledger": bool(receipts), "used_in": [], "takeaways": []})
    resources[0]["used_in"] = [{"page": "/evidence", "what": "every investigation card and table"}]
    put("official_resources.json", {"klass": "literature", "note": "used_in and takeaways are filled as features that use each resource are built; "
                                    "the coverage counter counts a resource only when it has a receipt and at least one use", "items": resources}, "literature")
    put("ledger.json", {"klass": "observed", "chain_ok": True, "head": entries[-1]["entry_hash"], "entries": L.public_view(entries)}, "observed")

    in_scope = [i for i in investigations if i.get("scope", {}).get("in_scope")]
    nasa = {
        "synced_at_utc": max(e["retrieved_at_utc"] for e in entries),
        "search_hits": len(hits), "investigations_in_scope": len(in_scope), "investigations_excluded": len(hits) - len(in_scope),
        "tables": len([t for t in tables_index if any(i["accession"] == t["accession"] for i in in_scope)]), "table_rows": n_rows,
        "files_in_ledger": len(by_key), "bytes_in_ledger": sum(e["size"] for e in by_key.values()),
        "official_resources_used": sum(1 for r in resources if r["in_ledger"] and r["used_in"]), "official_resources_total": len(resources),
        "ledger_head": entries[-1]["entry_hash"], "ledger_chain_ok": True,
    }
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8")) if os.path.exists(mpath) else {"artifacts": {}}
    manifest.update({"schema": SCHEMA, "brand": BRAND, "team": TEAM, "mascot": MASCOT,
                     "built_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "nasa": nasa})
    manifest.setdefault("artifacts", {}).update(written)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"nasa": nasa, "artifacts": sorted(written)}
