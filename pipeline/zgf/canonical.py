"""
Tidy exports. NASA's experimental tables, one row per test, with:
  * a reviewable column map: original header -> canonical name, unit, kind, note (column_map.json);
  * normalised oxygen (mole fraction) and pressure (kPa) where the table states them;
  * a long file with one line per filled cell, numbers parsed, units attached;
  * a data dictionary; and provenance on every row (record, file, row, SHA-256, ledger entry).

Nothing is corrected. A cell that is not a number has no number; a dash or a spreadsheet error is empty.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re

from .derive_evidence import QTY, is_missing, norm, to_num

NOT_UNITS = {"init", "final", "note 1", "1000 250 50 10"}
OVERRIDES = {   # (record, header with single spaces) -> (canonical name, unit, note)
    ("PSI-69", "O initial ambient composition; mole fraction"): ("o2_mole_fraction", "mole fraction", "the header lost its subscript; read as O2 because the four fractions add up to 1"),
    ("PSI-69", "N initial ambient composition; mole fraction"): ("n2_mole_fraction", "mole fraction", "the header lost its subscript; read as N2"),
    ("PSI-69", "CO initial ambient composition; mole fraction"): ("co2_mole_fraction", "mole fraction", "the header lost its subscript; carbon dioxide used as a diluent, not carbon monoxide"),
    ("PSI-69", "He initial ambient composition; mole fraction"): ("he_mole_fraction", "mole fraction", ""),
    ("PSI-69", "Burning rate; mm"): ("burning_rate_constant", "mm (as stated)", "a droplet burning-rate constant is an area per time (mm²/s); the header gives mm"),
    ("PSI-99", "?-g Burn Length"): ("microgravity_burn_length", None, "the header lost its micro sign"),
    ("PSI-99", "?-g Spread Length"): ("microgravity_spread", None, "the header lost its micro sign; the cells give a rate"),
    ("PSI-99", "Samle Thickness"): ("sample_thickness", None, "header as written: 'Samle Thickness'"),
}


def canonical(header: str) -> tuple[str, str | None]:
    """A snake_case name and the unit the header states, if it states one."""
    h, unit = norm(header), None
    m = re.search(r"\(([^)]*)\)\s*$", h)
    if m and re.search(r"[A-Za-z%°]", m.group(1)) and len(m.group(1)) <= 14 and m.group(1).strip().lower() not in NOT_UNITS:
        unit, h = m.group(1).strip(), h[:m.start()].strip()
    m = re.search(r";\s*([^;]+)$", h)
    if not unit and m and len(m.group(1)) <= 16:
        unit, h = m.group(1).strip(), h[:m.start()].strip()
    name = re.sub(r"[^a-z0-9]+", "_", h.lower().replace("%", " percent ").replace("#", " number ")).strip("_")
    return name or "column", unit


def column_map(tables: dict[str, dict], profiles: dict[str, dict]) -> dict[str, list[dict]]:
    out = {}
    for rel, t in sorted(tables.items()):
        cols, seen = [], {}
        prof = {c["name"]: c for c in profiles.get(rel, {}).get("columns", [])}
        for header in t["columns"]:
            h = norm(header)
            name, unit = canonical(h)
            note = ""
            if (t["accession"], h) in OVERRIDES:
                name, unit, note = OVERRIDES[(t["accession"], h)]
            seen[name] = seen.get(name, 0) + 1
            if seen[name] > 1:
                name = "%s_%d" % (name, seen[name])
            p = prof.get(h, {})
            cols.append({"header": h, "name": name, "unit": unit, "kind": p.get("kind", "text"), "role": p.get("role", ""), "filled": p.get("filled", 0),
                         "distinct": p.get("distinct", 0), "min": p.get("min"), "max": p.get("max"), "note": note})
        out[rel] = cols
    return out


def cell_number(cell: str) -> tuple[float | None, str | None]:
    """The number in a cell and the unit written next to it, if the cell is a number or a number with a unit."""
    if is_missing(cell):
        return None, None
    v = to_num(cell)
    if v is not None:
        return v, None
    m = QTY.match(cell.strip())
    return (float(m.group(1)), m.group(2)) if m else (None, None)


def build(out_dir: str) -> dict:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    inv = {i["accession"]: i for i in load("investigations.json")["items"] if i.get("scope", {}).get("in_scope")}
    index = [t for t in load("tables/index.json")["items"] if t["accession"] in inv]
    tables = {t["artifact"]: load(t["artifact"]) for t in index}
    profiles = load("profiles.json")["items"]
    env = load("envelope.json")
    points = {(p["t"], p["r"]): p for p in env["points"]}
    cmap = column_map(tables, profiles)
    ex = os.path.join(out_dir, "exports")
    os.makedirs(ex, exist_ok=True)
    written, dictionary = {}, []

    def put(rel: str, text: str, klass: str):
        b = text.encode("utf-8")
        with open(os.path.join(out_dir, rel), "wb") as fh:
            fh.write(b)
        written[rel] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": klass}

    def as_csv(rows: list[list]) -> str:
        buf = io.StringIO()
        csv.writer(buf, lineterminator="\n").writerows(rows)
        return buf.getvalue()

    PROV = ["psi_record", "source_file", "row", "source_sha256", "ledger_entry"]
    long_rows = [PROV[:3] + ["column", "original_header", "value_text", "value_number", "unit", "ledger_entry"]]
    cond_rows = [PROV[:3] + ["series", "fuel_kind", "gravity", "oxygen_mole_fraction", "pressure_kpa", "fuel_or_material", "outcome_as_written", "source_sha256", "ledger_entry"]]
    kind_of = {s["id"]: s["kind"] for s in env["series"]}
    files = []
    for t in index:
        rel, d, cols = t["artifact"], tables[t["artifact"]], cmap[t["artifact"]]
        has_env = any((rel, i) in points for i in range(len(d["rows"])))
        head = PROV[:3] + [c["name"] for c in cols] + (["oxygen_mole_fraction", "pressure_kpa"] if has_env else []) + PROV[3:]
        rows = [head]
        for i, r in enumerate(d["rows"]):
            cells = [(r[j].strip() if j < len(r) else "") for j in range(len(cols))]
            clean = ["" if is_missing(c) else c for c in cells]
            pt = points.get((rel, i))
            extra = ([pt["x"] if pt else "", pt["p"] if pt and pt["p"] is not None else ""] if has_env else [])
            rows.append([t["accession"], t["file"], i + 1] + clean + extra + [t["sha256"], t["ledger_seq"]])
            for c, cell in zip(cols, cells):
                if is_missing(cell):
                    continue
                v, u = cell_number(cell)
                long_rows.append([t["accession"], t["file"], i + 1, c["name"], c["header"], cell, "" if v is None else v, u or c["unit"] or "", t["ledger_seq"]])
            if pt:
                cond_rows.append([t["accession"], t["file"], i + 1, pt["s"], kind_of.get(pt["s"], ""), "free fall", pt["x"], "" if pt["p"] is None else pt["p"], pt["f"], pt.get("o", ""), t["sha256"], t["ledger_seq"]])
        name = "exports/%s.csv" % os.path.splitext(os.path.basename(rel))[0]
        put(name, as_csv(rows), "observed")
        files.append({"file": name, "record": t["accession"], "source": t["file"], "rows": len(rows) - 1, "columns": len(head)})
        for c in cols:
            dictionary.append([name, c["name"], c["header"], c["unit"] or "", c["kind"], c["role"], c["filled"], c["distinct"], "" if c["min"] is None else c["min"], "" if c["max"] is None else c["max"], c["note"]])
        if has_env:
            dictionary.append([name, "oxygen_mole_fraction", "(derived)", "mole fraction", "number", "derived", "", "", "", "", "from the table's oxygen column; percent divided by 100"])
            dictionary.append([name, "pressure_kpa", "(derived)", "kPa", "number", "derived", "", "", "", "", "from the table's pressure column; mmHg x 0.1333224, atm x 101.325, bar x 100; empty when the table gives no pressure"])
    put("exports/tests_long.csv", as_csv(long_rows), "observed")
    put("exports/test_conditions.csv", as_csv(cond_rows), "derived")
    put("exports/data_dictionary.csv", as_csv([["file", "column", "original_header", "unit", "kind", "role_in_table", "filled", "distinct", "min", "max", "note"]] + dictionary), "derived")
    put("exports/column_map.json", json.dumps({"klass": "derived", "note": "Original header to canonical name and unit, per table. Overrides are listed in pipeline/zgf/canonical.py.", "tables": cmap},
                                              ensure_ascii=False, indent=1), "derived")
    licences = sorted({i.get("license") or "not stated" for i in inv.values()})
    put("exports/README.txt", "\n".join([
        "Zero-G Firewall: tidy exports of NASA's PSI combustion experimental tables",
        "",
        "Source: NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov, fetched on 14 November 2026.",
        "Licence stated on the PSI records: %s." % ", ".join(licences),
        "",
        "One CSV per experimental table: one row per test, columns renamed to snake_case (see column_map.json and data_dictionary.csv).",
        "Cells are NASA's text. A dash, 'n/a' or a spreadsheet error value is left empty. Nothing was corrected: see curator_report.json for what a user should know.",
        "Rows are counted as rows after the header with at least one filled cell; 'row' counts them from 1.",
        "oxygen_mole_fraction and pressure_kpa are added where the table states oxygen; pressure is empty where the table gives none. It is never assumed.",
        "",
        "tests_long.csv        one line per filled cell: value as text, value as a number when it is one, and its unit",
        "test_conditions.csv   one line per test that states oxygen: series, fuel kind, oxygen, pressure, fuel, outcome as written",
        "data_dictionary.csv   every column of every file: original header, unit, kind, how full, range, notes",
        "",
        "Every row carries its entry in the site's ledger (ledger.jsonl), which holds the address, the time and the SHA-256 of the NASA file; the per-table files repeat the SHA-256.",
        "Independent project for NASA Space Apps Challenge 2026. Not endorsed by NASA.",
        ""]), "derived")
    summary = {"klass": "derived", "files": files, "long_rows": len(long_rows) - 1, "condition_rows": len(cond_rows) - 1, "dictionary_rows": len(dictionary),
               "others": ["exports/tests_long.csv", "exports/test_conditions.csv", "exports/data_dictionary.csv", "exports/column_map.json", "exports/README.txt"]}
    put("exports/index.json", json.dumps(summary, ensure_ascii=False, separators=(",", ":")), "derived")
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"].update(written)
    manifest["nasa"]["export_files"] = len(written)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"files": len(written), "long_rows": len(long_rows) - 1, "condition_rows": len(cond_rows) - 1, "bytes": sum(w["bytes"] for w in written.values())}
