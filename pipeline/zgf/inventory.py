"""
What each record's experimental table states, quantity by quantity, and what NASA's repository lists for it as files.

A column is placed by its header alone, with the patterns below, in the order written; the first that matches wins.
Nothing is read into a header beyond its words: a column that no pattern names is listed as "not placed", as written.
Dates, identifiers and notes are set aside by the same header patterns the column profiles use (see place()).

The file side comes from PSI's own listing of each record (folder and file extension), not from files this site fetched.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

from .derive_evidence import ID_NAME, NOTE_NAME, WHEN_NAME
from .rank import FLOW

# (id, group, label, what the reader is told, pattern on the header as written)
QUANTITIES: list[tuple[str, str, str, str, re.Pattern]] = [
    ("oxygen", "conditions", "Oxygen", "oxygen in the atmosphere around the flame",
     re.compile(r"^XO2\b|\bO2 % by vol|^oxygen\b|percent o2|^O initial ambient composition|^atmosphere", re.I)),
    ("pressure", "conditions", "Pressure", "pressure of the atmosphere",
     re.compile(r"^p(init|final|mean)\b|\bapprox p\b|pressure", re.I)),
    ("other_gases", "conditions", "Other gases", "the rest of the atmosphere: nitrogen, helium, carbon dioxide",
     re.compile(r"^(N|CO|He) initial ambient composition|^nitrogen$|^helium$|ambient gas mixture", re.I)),
    ("flow", "conditions", "Air flow", "air moving past the fuel: speed, direction or a fan setting", FLOW),
    ("fuel", "conditions", "Fuel", "what burned: the fuel, the material or its share in a mixture",
     re.compile(r"^fuel$|^fuel type$|fuel bottle|fuel conc|^material$|sample material|^sample \(fuel type\)$|^sample type$|^Xfuel$|^Xf\b|^XC2H4", re.I)),
    ("supply", "conditions", "Supply rates", "how fast fuel or gas was fed to a burner",
     re.compile(r"\(mg/s\)|\(sccm\)|\bMFC$", re.I)),
    ("size", "conditions", "Size", "size of the sample, the droplet or the burner",
     re.compile(r"thickness|sample length|sample width|nozzle|burner size|droplet.*diameter", re.I)),
    ("ageing", "conditions", "Smoke ageing", "how long smoke was held or mixed before it was measured",
     re.compile(r"\baging\b|mixing time", re.I)),
    ("ignition", "happened", "Ignition", "how the sample was lit, and whether it lit",
     re.compile(r"ignition|flames ignited", re.I)),
    ("burn_time", "happened", "Burn time", "how long it burned",
     re.compile(r"burn time", re.I)),
    ("ending", "happened", "How it ended", "how the flame ended: by itself, by the test, or at what size",
     re.compile(r"self\s?-?\s?ext|^test end$|extinction diameter", re.I)),
    ("rates", "happened", "Burning, spread", "burning rate, burned length, spread, weight loss",
     re.compile(r"burning rate|burn length|spread length|spread rate|weight loss", re.I)),
    ("look", "happened", "Flame look", "what the flame looked like: colour, a cool flame",
     re.compile(r"cool flame|^color$", re.I)),
    ("gases_after", "readings", "Gases after", "carbon monoxide and carbon dioxide read before and after a burn",
     re.compile(r"\bCO2? ?(%|\(ppm\))|CO2 % by vol", re.I)),
    ("temperature", "readings", "Temperature", "a temperature that was read or set",
     re.compile(r"peak burner t|ambient temperature", re.I)),
    ("computed", "readings", "Computed", "values NASA computed for the row: flame temperature and mixture fraction",
     re.compile(r"^Tad\b|\bZst\b", re.I)),
    ("cameras", "readings", "Cameras", "cameras, frames shot and instrument settings named in the table",
     re.compile(r"^camera|frames shot|radiometer gain", re.I)),
]
# how each quantity is named inside a sentence
PHRASE = {"oxygen": "oxygen", "pressure": "pressure", "other_gases": "the other gases of the atmosphere", "flow": "air flow", "fuel": "what burned", "supply": "supply rates", "size": "the size of the sample", "ageing": "smoke ageing times", "ignition": "ignition", "burn_time": "burn time", "ending": "how the flame ended", "rates": "burning or spread", "look": "what the flame looked like", "gases_after": "the gases before and after a burn", "temperature": "a temperature", "computed": "values NASA computed", "cameras": "cameras and settings"}
GROUPS = [("conditions", "Conditions of the test"), ("happened", "What happened"), ("readings", "Readings and instruments")]

# PSI's listing of a record: kinds of file by extension. An archive's contents are not listed, so it is its own kind.
FILE_KINDS: list[tuple[str, str, tuple[str, ...]]] = [
    ("video", "Video", ("mp4", "ts", "avi", "mov", "mpg", "mpeg", "m4v", "wmv")),
    ("numbers", "Number and text", ("csv", "txt", "asc", "dat", "xls", "xlsx", "tsv", "log", "pxp", "xml")),
    ("images", "Pictures", ("jpg", "jpeg", "png", "tif", "tiff", "bmp", "gif", "nef")),
    ("archives", "Archives", ("zip", "tar", "gz", "7z", "rar")),
    ("documents", "Documents", ("pdf", "docx", "doc", "pptx", "ppt", "rtf")),
]
RAW, ANALYSED = "Raw Data", "Analyzed Data"


def place(name: str) -> str | None:
    """
    Where a header goes: a quantity id, "aside" for a date, an identifier or notes, or None when no rule names it.
    A date or time is set aside first ("GMT ignition" is a time of day, not an ignition reading); an identifier or a
    note only when no quantity claims the header ("Camera 1" names an instrument, "Percent O2 (Note 1)" states oxygen).
    """
    name = name.strip()
    if WHEN_NAME.search(name):
        return "aside"
    for qid, _, _, _, pat in QUANTITIES:
        if pat.search(name):
            return qid
    return "aside" if ID_NAME.search(name) or NOTE_NAME.search(name) else None


def _cell(cols: list[dict]) -> dict:
    """One record, one quantity: the columns that state it and how."""
    varied = [c for c in cols if c["distinct"] > 1]
    number = [c for c in cols if c["kind"] in ("number", "quantity")]      # "30 cm/s" is a number with its unit
    per_table: dict[str, int] = {}
    for c in cols:                                  # a record with two tables: the rows of each, counted once
        per_table[c["table"]] = max(per_table.get(c["table"], 0), c["filled"])
    return {"state": "varied" if varied else "single", "as_text": not number, "rows": sum(per_table.values()), "columns": cols}


def _files(listing: dict | None) -> dict:
    out = {"raw": {k: {"files": 0} for k, _, _ in FILE_KINDS}, "raw_files": 0, "raw_bytes": 0, "analysed_files": 0, "analysed_bytes": 0, "other_extensions": {}}
    by = (listing or {}).get("by_folder") or {}
    raw = by.get(RAW) or {}
    out["raw_files"], out["raw_bytes"] = raw.get("count", 0), raw.get("bytes", 0)
    known = {e: k for k, _, exts in FILE_KINDS for e in exts}
    for ext, n in (raw.get("extensions") or {}).items():
        k = known.get(ext.lower())
        if k:
            out["raw"][k]["files"] += n
        else:
            out["other_extensions"][ext] = out["other_extensions"].get(ext, 0) + n
    an = by.get(ANALYSED) or {}
    out["analysed_files"], out["analysed_bytes"] = an.get("count", 0), an.get("bytes", 0)
    return out


def build_doc(inv: dict, profiles: dict, tables: dict[str, dict]) -> dict:
    """tables: artifact path -> {sha256, ledger_seq, url, file} of the stored table."""
    by_acc: dict[str, list[tuple[str, dict]]] = {}
    for rel, p in sorted(profiles["items"].items()):
        by_acc.setdefault(p["accession"], []).append((rel, p))
    items, unplaced_all, n_cols, n_placed, n_aside = [], [], 0, 0, 0
    for i in sorted((x for x in inv["items"] if x.get("scope", {}).get("in_scope")), key=lambda x: int(re.sub(r"\D", "", x["accession"]) or 0)):
        acc = i["accession"]
        cells: dict[str, list[dict]] = {}
        unplaced, refs, rows = [], [], 0
        for rel, p in by_acc.get(acc, []):
            t = tables[rel]
            refs.append({"artifact": rel, "file_name": t["file"], "accession": acc, "kind": "psi_table", "ledger_seq": t["ledger_seq"], "sha256": t["sha256"], "url": t["url"], "rows": p["n_rows"]})
            rows += p["n_rows"]
            for c in p["columns"]:
                n_cols += 1
                q = place(c["name"])
                if q == "aside":
                    n_aside += 1
                    continue
                col = {"table": rel, "name": c["name"], "kind": c["kind"], "filled": c["filled"], "distinct": c["distinct"], "of": p["n_rows"]}
                if c["kind"] == "number" and "min" in c:
                    col["min"], col["max"] = c["min"], c["max"]
                elif c.get("top"):
                    col["example"] = str(c["top"][0][0])[:60]
                if q is None:
                    unplaced.append(col)
                    continue
                n_placed += 1
                cells.setdefault(q, []).append(col)
        unplaced_all += [{"accession": acc, **u} for u in unplaced]
        items.append({"accession": acc, "acronym": i.get("acronym") or "", "title": i["title"], "gravity": i["gravity"], "hardware": i.get("hardware") or "",
                      "tables": refs, "rows": rows, "cells": {q: _cell(cols) for q, cols in cells.items()}, "not_placed": len(unplaced),
                      "files": _files(i.get("files")), "in_ledger": (i.get("in_ledger") or {}).get("files", 0)})
    with_table = [it for it in items if it["tables"]]
    totals = {}
    for qid, _, _, _, _ in QUANTITIES:
        have = [it for it in items if qid in it["cells"]]
        totals[qid] = {"records": len(have), "varied": sum(1 for it in have if it["cells"][qid]["state"] == "varied"), "rows": sum(it["cells"][qid]["rows"] for it in have)}
    return {
        "klass": "derived",
        "rule": "A column is placed by its header alone, by the first pattern that matches it, in the order shown. A cell says the record's table has such a column: "
                "'varied' when it holds more than one value, 'single' when every filled cell holds the same value. Dates and times are set aside, and so are identifiers and notes that no pattern claims. "
                "A header no pattern names is listed as not placed.",
        "groups": [{"id": g, "label": label} for g, label in GROUPS],
        "quantities": [{"id": qid, "group": g, "label": label, "phrase": PHRASE[qid], "about": about, "pattern": pat.pattern} for qid, g, label, about, pat in QUANTITIES],
        "file_kinds": [{"id": k, "label": label, "extensions": list(exts)} for k, label, exts in FILE_KINDS],
        "files_rule": "Counts are PSI's own listing of each record's '%s' folder, by file extension. An archive's contents are not listed. The files themselves are not fetched; "
                      "the ledger column counts the files of the record this site did fetch." % RAW,
        "items": items,
        "totals": totals,
        "counts": {"records": len(items), "with_table": len(with_table), "tables": sum(len(it["tables"]) for it in items), "rows": sum(it["rows"] for it in items),
                   "columns": n_cols, "placed": n_placed, "set_aside": n_aside, "not_placed": len(unplaced_all),
                   "raw_files": sum(it["files"]["raw_files"] for it in items), "raw_bytes": sum(it["files"]["raw_bytes"] for it in items)},
        "not_placed": unplaced_all,
    }


def build(out_dir: str) -> dict:
    inv = json.load(open(os.path.join(out_dir, "investigations.json"), encoding="utf-8"))
    profiles = json.load(open(os.path.join(out_dir, "profiles.json"), encoding="utf-8"))
    tables = {}
    for rel in profiles["items"]:
        t = json.load(open(os.path.join(out_dir, rel), encoding="utf-8"))
        tables[rel] = {k: t[k] for k in ("sha256", "ledger_seq", "url", "file")}
    doc = build_doc(inv, profiles, tables)
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "inventory.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["inventory.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "derived"}
    manifest["nasa"]["columns_placed"] = doc["counts"]["placed"]
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"written": True, "bytes": len(b), **{k: doc["counts"][k] for k in ("records", "with_table", "columns", "placed", "set_aside", "not_placed")}}
