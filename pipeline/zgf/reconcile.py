"""
Two cross-checks of the catalogue:
  * NASA's "PSI investigations by research area" page against the records the combustion search returned;
  * whether any PSI record changed between two fetches (version drift).
"""
from __future__ import annotations

import difflib
import hashlib
import json
import os
import re

from . import ledger as L
from .literature import Library

PAGE = "doc:psi_investigations_by_research_area"
AREAS = ["Biophysics", "Combustion Science", "Complex Fluids/Soft Matter", "Fluid Physics", "Fundamental Physics", "Materials Science"]
flat = lambda s: re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def listed(text: str) -> list[dict]:
    """Entries of the Combustion Science section: a name line followed by its status lines."""
    lines = [re.sub(r"\s+", " ", ln.replace("​", "").replace(" ", " ")).strip() for ln in text.split("\n") if ln.strip()]
    heads = [i for i, ln in enumerate(lines) if ln == "Combustion Science"]
    if len(heads) < 2:
        return []
    start = heads[1]
    other = [flat(a) for a in AREAS if a != "Combustion Science"]
    end = next((i for i in range(start + 1, len(lines)) if flat(lines[i]) in other), len(lines))
    out = []
    for i in range(start + 1, end - 1):
        if lines[i + 1].startswith("Completion Status:"):
            name, _, title = lines[i].partition(" – ")
            roses = lines[i + 2].split(":", 1)[1].strip() if i + 2 < end and lines[i + 2].startswith("ROSES Eligible:") else ""
            out.append({"name": name.strip(), "title": (title or name).strip(), "status": lines[i + 1].split(":", 1)[1].strip(), "roses_eligible": roses})
    return out


def match(entry: dict, inv: list[dict]) -> str | None:
    best, score = None, 0.0
    for i in inv:
        acr = [flat(a) for a in re.split(r"\s*/\s*", i.get("acronym") or "") if a]
        if flat(entry["name"]) in acr or flat(entry["name"]) == flat(i.get("acronym")):
            return i["accession"]
        s = max(difflib.SequenceMatcher(None, flat(entry["title"]), flat(i["title"])).ratio(), difflib.SequenceMatcher(None, flat(entry["name"]), flat(i["title"])).ratio())
        if s > score:
            best, score = i["accession"], s
    return best if score >= 0.8 else None


def build(raw_dir: str, out_dir: str) -> dict:
    entries = L.load(raw_dir)
    by_key = L.latest(entries)
    inv = json.load(open(os.path.join(out_dir, "investigations.json"), encoding="utf-8"))["items"]
    doc = {"klass": "literature", "listed": [], "note": "NASA's page lists investigations by name, without record numbers; names are matched to records by acronym or by title."}
    if PAGE in by_key:
        lib = Library(raw_dir, by_key)
        rows = listed((lib.units(PAGE) or [{"text": ""}])[0]["text"])
        for r in rows:
            r["accession"] = match(r, inv)
        got = {r["accession"] for r in rows if r["accession"]}
        doc.update({"source": "NASA: PSI Investigations by Research Area", "ref": lib.ref(PAGE), "listed": rows, "listed_n": len(rows), "matched_n": sum(1 for r in rows if r["accession"]),
                    "listed_not_in_search": [r["name"] for r in rows if not r["accession"]],
                    "search_not_listed": [i["accession"] for i in inv if i.get("scope", {}).get("in_scope") and i["accession"] not in got]})
    fetches: dict[str, list[dict]] = {}
    for e in entries:
        if e.get("kind") == "psi_meta":
            fetches.setdefault(e["key"], []).append(e)
    drift = [{"accession": v[-1].get("accession"), "first_fetch": v[0]["retrieved_at_utc"], "last_fetch": v[-1]["retrieved_at_utc"]} for v in fetches.values() if len({e["sha256"] for e in v}) > 1]
    doc["drift"] = {"records_fetched_more_than_once": sum(1 for v in fetches.values() if len(v) > 1), "changed": drift,
                    "statement": ("%d record%s changed between fetches." % (len(drift), "" if len(drift) == 1 else "s")) if drift else
                                 ("No record changed between fetches." if any(len(v) > 1 for v in fetches.values()) else "Each record was fetched once, so there is nothing to compare yet. A second sync will show any change.")}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "research_area.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["research_area.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "literature"}
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"listed": doc.get("listed_n"), "matched": doc.get("matched_n"), "listed_not_in_search": doc.get("listed_not_in_search"), "search_not_listed": doc.get("search_not_listed"), "drift": doc["drift"]["statement"]}
