"""
AI briefs: two sentences per investigation, written by the AI assistant that helped build this project,
and checked here at every build. A brief is our reading of a record, never NASA's words, and the site
labels it so. The check is narrow and mechanical on purpose:

  - the record must exist and be in scope;
  - every number in the brief must be a number the record itself holds (its texts, its table sizes,
    its column names), so the model cannot introduce a figure;
  - no verdict, probability or safety rating;
  - a sentence that leans on the curator report must name a record that has a curator note.

A brief that fails is left out and reported; nothing is rewritten by code.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

SRC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "briefs", "briefs.json")
VERDICT = re.compile(r"\b(is|are|was|were|be|completely|perfectly|totally) safe\b|\bsafe to\b|probabilit|\brisk score\b|\bsafety rating\b|\bguarantee|\b\d+(\.\d+)?\s?% (chance|risk)", re.I)
NUM = re.compile(r"\d+(?:\.\d+)?")


def numbers(text: str) -> set[str]:
    return {n.rstrip("0").rstrip(".") if "." in n else n for n in NUM.findall(text.replace(",", ""))}


def record_numbers(inv: dict, profiles: dict) -> set[str]:
    texts = [inv.get(k) or "" for k in ("title", "acronym", "objective", "approach", "hypothesis", "impacts", "hardware", "platform", "accession")]
    have = numbers(" ".join(texts))
    total = 0
    for t in inv.get("tables", []):
        rows = t.get("rows") or 0
        total += rows
        have |= {str(rows), str(t.get("cols") or t.get("n_cols") or "")}
        p = profiles.get(t.get("artifact") or "")
        if p:
            have |= numbers(" ".join(c["name"] for c in p["columns"]))
    have |= {str(total), str(len(inv.get("tables", [])))}
    return have - {""}


def check(acc: str, brief: dict, inv: dict | None, profiles: dict, curated: set[str]) -> list[str]:
    if inv is None:
        return ["no such record"]
    if not inv["scope"]["in_scope"]:
        return ["the record is set aside as not combustion science"]
    problems = []
    text = "%s %s" % (brief.get("what", ""), brief.get("why", ""))
    if not brief.get("what") or not brief.get("why"):
        problems.append("a brief has two parts: what it is, and why it matters")
    if len(brief.get("what", "")) > 240 or len(brief.get("why", "")) > 280:
        problems.append("too long")
    if VERDICT.search(text):
        problems.append("gives a verdict, a probability or a safety rating")
    extra = numbers(text) - record_numbers(inv, profiles)
    if extra:
        problems.append("holds a number the record does not hold: %s" % ", ".join(sorted(extra)))
    if "curator report" in text and acc not in curated:
        problems.append("leans on a curator note that does not exist for this record")
    return problems


def build(out_dir: str) -> dict:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    src = json.load(open(SRC, encoding="utf-8"))
    inv = {i["accession"]: i for i in load("investigations.json")["items"]}
    prof = load("profiles.json")["items"]
    profiles = prof if isinstance(prof, dict) else {p.get("artifact"): p for p in prof}
    curated = set()
    for f in load("curator_report.json")["items"]:
        curated.add(f["accession"])
        curated.update(f.get("also") or [])
    kept, dropped = {}, []
    for acc, b in src["items"].items():
        problems = check(acc, b, inv.get(acc), profiles, curated)
        if problems:
            dropped.append({"accession": acc, "problems": problems})
        else:
            kept[acc] = {"what": b["what"], "why": b["why"]}
    missing = sorted(a for a, i in inv.items() if i["scope"]["in_scope"] and a not in kept)
    doc = {"klass": "illustrative", "written_by": src["written_by"], "when": src["when"], "how": src["how"],
           "note": "A brief is this project's reading of a record, written with an AI model and checked by code. It is not NASA's text. The record's own words are below each brief.",
           "items": kept, "dropped": dropped, "without_brief": missing}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "briefs.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["briefs.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "illustrative"}
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"written": len(src["items"]), "kept": len(kept), "dropped": dropped, "without_brief": missing}
