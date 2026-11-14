"""
The d-squared law against NASA's own FLEX columns.

A burning droplet shrinks so that the square of its diameter falls in a straight line with time:

    D(t)^2 = D0^2 - K t

NASA's FLEX table (PSI-69) states, for each test, the initial diameter, the diameter at which the visible
flame went out, a burning rate and a burn time. If the law holds and the columns mean what this site reads
them to mean, (D0^2 - Dext^2) / K must come out as the burn time. That is checked here, row by row, with
nothing fitted: four cells of one NASA row go in, one ratio comes out.

The result is a consistency check of NASA's table and a test of the simplest droplet model on real flight
data. It says nothing about partial gravity: every row was taken in free fall.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import statistics

from .derive_evidence import is_missing, norm, to_num

ACC = "PSI-69"
COLS = {"fuel": "Fuel", "x": "O initial ambient composition; mole fraction", "p": "Ambient pressure; mmHg",
        "he": "He initial ambient composition; mole fraction", "co2": "CO initial ambient composition; mole fraction",
        "d0": "Droplet initial diameter; mm", "de": "Visible flame extinction diameter; mm",
        "k": "Burning rate; mm", "tb": "Burn time; s", "end": "Test end"}
MMHG = 0.1333224
NEED = [("d0", "no initial diameter"), ("de", "no diameter at which the visible flame went out"), ("k", "no burning rate"), ("tb", "no burn time")]


def d2_time(d0: float, de: float, k: float) -> float:
    """Seconds for a droplet to shrink from d0 to de (mm) at a burning-rate constant k (mm2/s)."""
    return (d0 * d0 - de * de) / k


def read(table: dict) -> list[dict]:
    """One dict per row of the FLEX table, numbers where the cell is a number and None where it is not."""
    cols = [norm(c) for c in table["columns"]]
    missing = [c for c in COLS.values() if c not in cols]
    if missing:
        raise ValueError("droplets: expected column not found: %s" % ", ".join(missing))
    j = {k: cols.index(c) for k, c in COLS.items()}
    out = []
    for i, r in enumerate(table["rows"]):
        cell = lambda k: r[j[k]].strip() if j[k] < len(r) else ""
        num = lambda k: None if is_missing(cell(k)) else to_num(cell(k))
        row = {"r": i, "f": cell("fuel"), "x": num("x"), "p": None, "d0": num("d0"), "de": num("de"), "k": num("k"), "tb": num("tb"), "end": cell("end")}
        if num("p") is not None and num("p") > 0:
            row["p"] = round(num("p") * MMHG, 2)
        he, co2 = num("he") or 0.0, num("co2") or 0.0
        row["dil"] = " and ".join(w for w, v in (("helium", he), ("carbon dioxide", co2)) if v > 0)
        out.append(row)
    return out


def why_not(row: dict) -> str | None:
    """Why a row cannot be checked, or None when it can."""
    for key, words in NEED:
        if row[key] is None:
            return words
    if row["k"] <= 0 or row["tb"] <= 0:
        return "a rate or a time of zero"
    if row["de"] >= row["d0"]:
        return "the flame went out at the initial diameter or above it"
    return None


def quantile(sorted_values: list[float], f: float) -> float:
    return sorted_values[int(f * (len(sorted_values) - 1))]


def check(rows: list[dict]) -> dict:
    """The check itself. Pure: rows in, counts and ratios out."""
    left: dict[str, int] = {}
    usable = []
    for row in rows:
        w = why_not(row)
        if w:
            left[w] = left.get(w, 0) + 1
            continue
        exact = d2_time(row["d0"], row["de"], row["k"])
        row["td"], row["q"], row["_q"] = round(exact, 3), round(exact / row["tb"], 4), exact / row["tb"]       # counts use the unrounded ratio
        usable.append(row)
    if len(usable) + sum(left.values()) != len(rows):
        raise ValueError("droplets: usable and not usable rows do not add up")
    ratios = sorted(r["_q"] for r in usable)

    def group(key: str) -> list[dict]:
        by: dict[str, list[float]] = {}
        for r in usable:
            by.setdefault(r[key] or "(empty)", []).append(r["_q"])
        return [{"name": k, "n": len(v), "median": round(statistics.median(v), 3), "within10": sum(1 for q in v if abs(q - 1) <= 0.10)} for k, v in sorted(by.items(), key=lambda kv: -len(kv[1]))]

    rate: dict[tuple[str, int], list[float]] = {}
    for r in rows:
        if r["k"] is not None and r["k"] > 0 and r["x"] is not None and not r["dil"]:
            rate.setdefault((r["f"], int(math.floor(round(100.0 * r["x"], 3) + 0.5))), []).append(r["k"])
    r4 = lambda v: round(v, 4)
    stats = {"median": round(statistics.median(ratios), 3), "p10": r4(quantile(ratios, 0.10)), "p25": r4(quantile(ratios, 0.25)), "p75": r4(quantile(ratios, 0.75)), "p90": r4(quantile(ratios, 0.90)),
             "min": r4(ratios[0]), "max": r4(ratios[-1])} if ratios else {}
    return {"n_rows": len(rows), "n_usable": len(usable),
            "not_usable": [{"why": k, "rows": v} for k, v in sorted(left.items(), key=lambda kv: -kv[1])],
            "ratio": stats, "within": {str(p): sum(1 for q in ratios if abs(q - 1) <= p / 100.0) for p in (10, 20, 30)},
            "by_fuel": group("f"), "by_end": group("end"),
            "rate_by_oxygen": [{"fuel": f, "pct": pct, "n": len(v), "median": round(statistics.median(v), 3), "min": min(v), "max": max(v)} for (f, pct), v in sorted(rate.items())]}


def build(out_dir: str) -> dict:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    meta = [t for t in load("tables/index.json")["items"] if t["accession"] == ACC]
    if not meta:
        return {"skipped": "no %s table in this build" % ACC}
    meta = meta[0]
    rows = read(load(meta["artifact"]))
    res = check(rows)
    doc = {"klass": "derived",
           "title": "The d-squared law against NASA's FLEX columns",
           "source": {k: meta[k] for k in ("accession", "file", "artifact", "sha256", "ledger_seq")},
           "columns": COLS,
           "law": "burn time = (D0² − Dext²) / K",
           "rate_unit": {"header": "mm", "read_as": "mm²/s",
                         "why": "A droplet burning-rate constant is an area per time. Read as mm² per second, the rate column agrees with the three other columns of its row; the header in NASA's file gives mm."},
           **res,
           "points": [{k: r[k] for k in ("r", "f", "x", "p", "dil", "d0", "de", "k", "tb", "end", "td", "q") if k in r} for r in rows],
           "assumptions": ["the droplet is a sphere and burns at one steady rate from ignition to the end",
                           "the burn time NASA states runs from ignition to the end of the visible flame",
                           "the burning rate NASA states is the slope of the squared diameter against time",
                           "free fall and a still atmosphere, as in every FLEX test"],
           "limits": "A check of four columns against each other, not a prediction. It is silent on what follows the visible flame, on other fuels and on any gravity but free fall."}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "droplets.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["droplets.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "derived"}
    manifest["nasa"]["droplet_rows_checked"] = res["n_usable"]
    manifest["nasa"]["droplet_rows_within_10pct"] = res["within"]["10"]
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"rows": res["n_rows"], "checked": res["n_usable"], "within_10pct": res["within"]["10"], "median_ratio": res["ratio"].get("median")}
