"""
Derivation, second stage. Reads the stage-one artifacts (tables as NASA wrote them) and adds:

  profiles.json         per column: how full, how many distinct values, range; and so
                        what varied and what stayed constant in each table
  curator_report.json   data-quality findings, each found by a stated rule and tied to rows
  envelope.json         every test row that states oxygen (and pressure, where given)
  validation.json       the equilibrium model against NASA's own Tad and Zst columns

Nothing here corrects a NASA value. A finding says what was seen and how the site handles it.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import statistics

MISSING = {"", "-", "–", "—", "n/a", "na", "none"}
DASHES = {"-", "–", "—"}
ERR = re.compile(r"^#(VALUE!|DIV/0!|REF!|N/A|NAME\?|NUM!|NULL!)$", re.I)
NUM = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")
QTY = re.compile(r"^~?\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*([A-Za-zµ°%][A-Za-z/%²]*)$")
FIRST_NUM = re.compile(r"[+-]?(?:\d+\.?\d*|\.\d+)")
ID_NAME = re.compile(r"(test\s*#|^test$|sample\s*#|sample number|identifier|flex number|^data id$|^run|^camera|^cir$|session name)", re.I)
WHEN_NAME = re.compile(r"\b(date|gmt|year|month|day|local time)\b", re.I)
NOTE_NAME = re.compile(r"\b(notes?|comments?)\b", re.I)


def norm(h) -> str:
    return " ".join(str(h).split())


def is_missing(c: str) -> bool:
    return c.strip().lower() in MISSING or bool(ERR.match(c.strip()))


def to_num(c: str):
    s = c.strip()
    return float(s) if NUM.match(s) else None


def first_num(c: str):
    m = FIRST_NUM.search(c)
    return float(m.group(0)) if m else None


# ---------------------------------------------------------------- profiles: what varied

def profile_column(name: str, cells: list[str]) -> dict:
    filled = [c.strip() for c in cells if not is_missing(c)]
    nums = [to_num(c) for c in filled]
    n_num = sum(v is not None for v in nums)
    qty = [QTY.match(c) for c in filled]
    n_qty = sum(q is not None for q in qty)
    if not filled:
        kind = "empty"
    elif n_num >= 0.9 * len(filled):
        kind = "number"
    elif n_num + n_qty >= 0.9 * len(filled) and n_qty:
        kind = "quantity"
    else:
        kind = "text"
    counts: dict[str, int] = {}
    for c in filled:
        counts[c] = counts.get(c, 0) + 1
    out = {"name": name, "filled": len(filled), "missing": len(cells) - len(filled), "distinct": len(counts), "kind": kind}
    if kind == "number":
        vals = [v for v in nums if v is not None]
        out.update(min=min(vals), max=max(vals))
    elif kind == "quantity":
        vals = [float(q.group(1)) for q in qty if q] + [v for v in nums if v is not None]
        out.update(min=min(vals), max=max(vals), units=sorted({q.group(2) for q in qty if q}))
    out["top"] = [[v[:90], n] for v, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:6]]
    n = len(cells)
    if kind == "empty":
        role = "empty"
    elif NOTE_NAME.search(name):
        role = "notes"
    elif len(counts) == 1:
        role = "constant" if len(filled) == n else "constant_where_given"
    elif ID_NAME.search(name) and len(counts) >= 0.9 * len(filled):
        role = "identifier"
    elif WHEN_NAME.search(name):
        role = "when"
    else:
        role = "varied"
    out["role"] = role
    return out


def profile_table(t: dict) -> dict:
    cols = [norm(c) for c in t["columns"]]
    rows = t["rows"]
    prof = [profile_column(name, [r[j] if j < len(r) else "" for r in rows]) for j, name in enumerate(cols)]
    return {"accession": t["accession"], "file": t["file"], "n_rows": t["n_rows"], "columns": prof,
            "varied": [p["name"] for p in prof if p["role"] == "varied"],
            "constant": [[p["name"], p["top"][0][0]] for p in prof if p["role"] in ("constant", "constant_where_given")],
            "rule": "a column is constant when every filled cell holds the same text; identifiers, dates and notes are set aside by header name"}


# ---------------------------------------------------------------- curator findings

def _fill_runs(values: list[str]) -> list[tuple[int, int]]:
    """Runs of three or more consecutive rows whose text is identical except for one integer, written against a letter, that rises by one."""
    parts = []
    for v in values:
        ms = list(re.finditer(r"\d+", v))
        ok = ms and ms[-1].start() > 0 and v[ms[-1].start() - 1].isalpha()      # a number written against a letter, as in a formula
        parts.append((v[:ms[-1].start()], int(ms[-1].group(0)), v[ms[-1].end():]) if ok else None)
    runs, i = [], 0
    while i < len(parts):
        j = i
        while (j + 1 < len(parts) and parts[j] and parts[j + 1] and parts[j][0] == parts[j + 1][0]
               and parts[j][2] == parts[j + 1][2] and parts[j + 1][1] == parts[j][1] + 1):
            j += 1
        if j - i >= 2:
            runs.append((i, j))
        i = j + 1
    return runs


def findings_for_table(t: dict, rel: str) -> list[dict]:
    out: list[dict] = []
    cols = [norm(c) for c in t["columns"]]
    rows = t["rows"]

    def add(rule, level, detail, handling, column=None, hit=None):
        f = {"rule": rule, "level": level, "accession": t["accession"], "file": t["file"], "table": rel, "detail": detail, "handling": handling}
        if column is not None:
            f["column"] = column
        if hit:
            f["rows"] = hit[:12]
            f["n_rows"] = len(hit)
        out.append(f)

    if t.get("encoding") != "utf-8":
        add("encoding", "note", "The file is not UTF-8; it decodes cleanly as Windows-1252.", "Decoded as Windows-1252. Text is kept as written.")
    if t.get("n_empty_lines"):
        add("empty_lines", "note", "%d line%s after the header %s empty (only separators). The table has %d data rows."
            % (t["n_empty_lines"], "" if t["n_empty_lines"] == 1 else "s", "is" if t["n_empty_lines"] == 1 else "are", t["n_rows"]),
            "Empty lines are not counted as tests. Row counts state this rule.")
    comp = [(j, c) for j, c in enumerate(cols) if re.search(r"initial ambient composition; mole fraction$", c)]
    if len(comp) >= 3:
        bad, ok = [], 0
        for i, r in enumerate(rows):
            vals = [to_num(r[j]) for j, _ in comp]
            if None in vals:
                continue
            if abs(sum(vals) - 1.0) <= 0.011:
                ok += 1
            else:
                bad.append(i)
        add("composition_closure", "note",
            "The headers %s lost their subscripts. In %d of %d rows the %d fractions add up to 1, so they are read as O2, N2, CO2 and He."
            % (", ".join("'%s'" % c.split(" ")[0] for _, c in comp), ok, ok + len(bad), len(comp)),
            "Labels on the site say O2, N2 and CO2 and name this check. 'CO' is carbon dioxide used as a diluent, not carbon monoxide.", hit=bad)
    for j, name in enumerate(cols):
        cells = [r[j].strip() if j < len(r) else "" for r in rows]
        err = [i for i, c in enumerate(cells) if ERR.match(c)]
        if err:
            add("spreadsheet_error", "caution", "%d cells hold a spreadsheet error value (%s)." % (len(err), ", ".join(sorted({cells[i] for i in err}))),
                "Treated as missing. Never read as a number.", name, err)
        dash = [i for i, c in enumerate(cells) if c in DASHES]
        if dash:
            add("dash_as_missing", "note", "%d cells hold only a dash." % len(dash), "Treated as 'no value'. Never read as zero.", name, dash)
        if name.startswith("?") or "?-" in name:
            add("header_symbol_lost", "note", "The header '%s' shows '?' where a symbol was lost in export (most likely the micro sign in µ-g)." % name,
                "Shown as written, with this note.", name)
        prof = profile_column(name, cells)
        if prof["kind"] == "text" and prof["role"] not in ("identifier", "notes", "when"):
            groups: dict[str, set] = {}
            for c in cells:
                if c and not is_missing(c):
                    groups.setdefault(re.sub(r"\s+", "", c.lower()), set()).add(c)
            var = [sorted(g) for g in groups.values() if len({" ".join(v.split()) for v in g}) > 1]      # more than a difference in the number of spaces
            if var:
                add("spelling_variants", "note", "The same value is written in more than one way: %s." % "; ".join(" = ".join("'%s'" % v for v in g) for g in var[:6]),
                    "Grouped as one value in counts and filters; the table shows each cell as written.", name)
        if re.search(r"fuel|atmosphere|bottle|gas|material", name, re.I):
            runs = _fill_runs(cells)
            if runs:
                hit = [i for a, b in runs for i in range(a + 1, b + 1)]
                ex = "; ".join("rows %d to %d: '%s' … '%s'" % (a + 1, b + 1, cells[a], cells[b]) for a, b in runs[:3])
                add("fill_series", "caution",
                    "Consecutive rows differ only by a number that rises by one (%s). This is the pattern a spreadsheet makes when a cell is dragged down." % ex,
                    "Kept as written. Only the first value of each run is used to identify the gas; the others are flagged.", name, hit)
        pct = [i for i, c in enumerate(cells) if re.fullmatch(r"\d+(\.\d+)?\s*%", c) and float(c.rstrip("% ")) > 100]
        if pct:
            add("percent_over_100", "caution", "A percentage above 100 appears (%s)." % ", ".join(sorted({cells[i] for i in pct})), "Kept as written; not used as a number.", name, pct)
        if re.search(r"ppm|% by vol|mole frac|percent o2", name, re.I):
            neg = [i for i, c in enumerate(cells) if (to_num(c) or 0) < 0]
            if neg:
                add("negative_concentration", "note", "%d cells hold a negative concentration (lowest %s)." % (len(neg), min(to_num(cells[i]) for i in neg)),
                    "Kept as written; consistent with a sensor offset near zero. Not clipped.", name, neg)
        if re.search(r"pressure", name, re.I):
            zero = [i for i, c in enumerate(cells) if to_num(c) == 0]
            if zero:
                add("zero_pressure", "caution", "%d row%s a pressure of 0." % (len(zero), " gives" if len(zero) == 1 else "s give"), "Those rows are left off the atmosphere map and counted as 'pressure not usable'.", name, zero)
    return out


def findings_for_records(items: list[dict], tables: dict[str, dict]) -> list[dict]:
    out = []
    dated: dict[tuple, list[str]] = {}
    for i in items:
        if i.get("start") and i.get("end"):
            dated.setdefault((i["start"], i["end"]), []).append(i["accession"])
    for (s, e), accs in sorted(dated.items()):
        if len(accs) > 1:
            names = ", ".join("%s (%s)" % (a, next(x.get("acronym") or x.get("title", "")[:40] for x in items if x["accession"] == a)) for a in accs)
            titles = " ".join("The proposal title on %s reads '%s'." % (a, x["proposal_title"]) for a in accs for x in items if x["accession"] == a and x.get("proposal_title"))
            out.append({"rule": "same_dates_in_two_records", "level": "caution", "accession": accs[0], "also": accs[1:],
                        "detail": ("%s carry the same investigation dates, %s to %s. %s" % (names, s, e, titles)).strip(),
                        "handling": "Dates are shown as PSI gives them, with this note. They are not used to order experiments."})
    for i in items:
        if not i.get("scope", {}).get("in_scope"):
            continue
        if i.get("gravity") == "micro" and not (i.get("start") and i.get("end")):
            out.append({"rule": "dates_missing", "level": "note", "accession": i["accession"], "detail": "The record lacks a start date, an end date, or both.",
                        "handling": "Shown as 'not stated'."})
        if i.get("gravity") == "micro" and not i.get("hardware"):
            out.append({"rule": "hardware_missing", "level": "note", "accession": i["accession"], "detail": "The record's hardware field is empty.",
                        "handling": "Grouped as 'hardware not stated'; no hardware is assumed."})
    by_acc: dict[str, list[tuple[str, dict]]] = {}
    for rel, t in tables.items():
        by_acc.setdefault(t["accession"], []).append((rel, t))
    for acc, ts in by_acc.items():
        for a in range(len(ts)):
            for b in range(a + 1, len(ts)):
                ta, tb = ts[a][1], ts[b][1]
                if ta["n_rows"] == tb["n_rows"] and ta["n_cols"] == tb["n_cols"] and ta["n_rows"]:
                    cells = ta["n_rows"] * ta["n_cols"]
                    same = sum(1 for ra, rb in zip(ta["rows"], tb["rows"]) for ca, cb in zip(ra, rb) if ca == cb)
                    if same >= 0.9 * cells:
                        out.append({"rule": "near_duplicate_tables", "level": "note", "accession": acc, "file": ta["file"], "table": ts[a][0],
                                    "detail": "Two tables of this record ('%s' and '%s') agree in %d of %d cells." % (ta["file"], tb["file"], same, cells),
                                    "handling": "Both are kept; rows are counted once per file and the record is out of scope or counted with this note."})
    return out


# notes a person made while reading the tables; each is kept only while its evidence cells still hold
HAND_NOTES = [
    {"rule": "swapped_columns", "level": "caution", "accession": "PSI-98",
     "detail": "For the same fabric sample, PSI-98 gives length 40.6 and width 94 (cm) while PSI-100 gives length 94 cm and width 40.6 cm.",
     "handling": "Both shown as written. Dimensions are not compared across the Saffire tables.",
     "checks": [("PSI-98", "Sample Length (cm)", "40.6"), ("PSI-98", "Sample Width (cm)", "94"), ("PSI-100", "Sample Length", "94 cm"), ("PSI-100", "Sample Width", "40.6 cm")]},
    {"rule": "unit_in_header", "level": "note", "accession": "PSI-69",
     "detail": "The header 'Burning rate; mm' gives millimetres. A droplet burning-rate constant is an area per time (mm²/s).",
     "handling": "Shown under NASA's header; where it is plotted the axis says 'as stated in the table'.",
     "checks": [("PSI-69", "Burning rate; mm", None)]},
    {"rule": "header_typo", "level": "note", "accession": "PSI-99",
     "detail": "The header reads 'Samle Thickness' and one cell reads '037 mm'.",
     "handling": "Shown as written.",
     "checks": [("PSI-99", "Samle Thickness", "037 mm")]},
]


def hand_notes(tables: dict[str, dict]) -> list[dict]:
    out = []
    for n in HAND_NOTES:
        ok = True
        for acc, col, val in n["checks"]:
            hit = False
            for t in tables.values():
                if t["accession"] != acc:
                    continue
                cols = [norm(c) for c in t["columns"]]
                if col in cols:
                    j = cols.index(col)
                    hit = val is None or any(j < len(r) and r[j].strip() == val for r in t["rows"])
            ok = ok and hit
        if ok:
            out.append({k: v for k, v in n.items() if k != "checks"} | {"found_by": "a person reading the tables; the cells it rests on are re-checked at every build"})
    return out


# ---------------------------------------------------------------- atmosphere points

KPA = {"atm": 101.325, "bar": 100.0, "mmHg": 0.1333224}
ENVELOPE = [
    {"acc": "PSI-69", "series": "FLEX droplets", "kind": "droplet", "x": ("O initial ambient composition; mole fraction", 1.0),
     "p": ("Ambient pressure; mmHg", KPA["mmHg"]), "fuel": "Fuel", "outcome": "Test end"},
    {"acc": "PSI-39", "series": "CFI droplets", "kind": "droplet", "x": ("Oxygen", 1.0), "p": ("Pressure", KPA["atm"]), "fuel": "Fuel"},
    {"acc": "PSI-159", "file": "Normal", "series": "CFI-G gas flames", "kind": "gas", "x": ("XO2 before test", 1.0), "p": ("approx p (bar)", KPA["bar"]),
     "fuel": "Fuel", "outcome": "Self-ext or flow term"},
    {"acc": "PSI-10", "file": "Normal", "series": "Flame Design gas flames", "kind": "gas", "x": ("XO2 (init)", 1.0), "p": ("pinit (atm)", KPA["atm"]), "fuel": "Fuel"},
    {"acc": "PSI-25", "series": "BASS-II solids", "kind": "solid", "x": ("Calibrated initial O2 % by vol", 0.01), "p": None, "fuel": "Fuel Sample Material"},
    {"acc": "PSI-98", "series": "Saffire solids", "kind": "solid", "x": ("Percent O2", 0.01), "p": None, "fuel": "Material", "approx": True},
    {"acc": "PSI-99", "series": "Saffire solids", "kind": "solid", "x": ("Percent O2 (Note 1)", 0.01), "p": None, "fuel": "Material", "approx": True},
]
PRESETS = [("iss", "ISS cabin", 0.2095, 101.325), ("challenge_limit", "30% oxygen at 10.2 psia", 0.30, 70.33),
           ("exploration", "34% oxygen at 8.2 psia", 0.34, 56.54), ("suit", "Suit, pure oxygen at 4.3 psia", 1.0, 29.65)]
NEAR = (0.03, 0.15)


def envelope(tables: dict[str, dict]) -> dict:
    points, series, left_out = [], {}, []
    for spec in ENVELOPE:
        for rel, t in sorted(tables.items()):
            if t["accession"] != spec["acc"] or (spec.get("file") and spec["file"] not in t["file"]):
                continue
            cols = [norm(c) for c in t["columns"]]
            need = [spec["x"][0], spec["fuel"]] + ([spec["p"][0]] if spec["p"] else [])
            if any(c not in cols for c in need):
                left_out.append({"table": rel, "reason": "expected column not found: %s" % ", ".join(c for c in need if c not in cols)})
                continue
            jx, jf = cols.index(spec["x"][0]), cols.index(spec["fuel"])
            jp = cols.index(spec["p"][0]) if spec["p"] else None
            jo = cols.index(spec["outcome"]) if spec.get("outcome") in cols else None
            s = series.setdefault(spec["series"], {"id": spec["series"], "kind": spec["kind"], "gravity": "micro", "accessions": [], "n": 0, "n_with_pressure": 0,
                                                    "no_oxygen": 0, "pressure_not_usable": 0, "pressure_in_table": bool(spec["p"]),
                                                    "oxygen_from": spec["x"][0], "oxygen_factor": spec["x"][1], "pressure_from": spec["p"][0] if spec["p"] else None,
                                                    "pressure_factor": spec["p"][1] if spec["p"] else None})
            if spec["acc"] not in s["accessions"]:
                s["accessions"].append(spec["acc"])
            for i, r in enumerate(t["rows"]):
                raw = r[jx].strip() if jx < len(r) else ""
                x = first_num(raw) if spec.get("approx") else to_num(raw)
                if x is None or is_missing(raw):
                    s["no_oxygen"] += 1
                    continue
                pt = {"s": spec["series"], "a": spec["acc"], "t": rel, "r": i, "x": round(x * spec["x"][1], 5), "p": None, "f": r[jf].strip()[:60]}
                if spec.get("approx"):
                    pt["approx"] = raw
                if jp is not None:
                    praw = r[jp].strip()
                    pv = to_num(praw)
                    if pv is None and QTY.match(praw):
                        pv = float(QTY.match(praw).group(1))
                    if pv is None or pv <= 0:
                        s["pressure_not_usable"] += 1
                    else:
                        pt["p"] = round(pv * spec["p"][1], 2)
                        s["n_with_pressure"] += 1
                if jo is not None and r[jo].strip() and not is_missing(r[jo]):
                    pt["o"] = r[jo].strip()
                s["n"] += 1
                points.append(pt)
    both = [p for p in points if p["p"] is not None]
    near = []
    for pid, label, x0, p0 in PRESETS:
        hit = [p for p in both if abs(p["x"] - x0) <= NEAR[0] and abs(p["p"] - p0) / p0 <= NEAR[1]]
        kinds: dict[str, int] = {}
        for p in hit:
            k = series[p["s"]]["kind"]
            kinds[k] = kinds.get(k, 0) + 1
        near.append({"id": pid, "label": label, "x_o2": x0, "p_kpa": p0, "n_near": len(hit), "by_kind": kinds})
    return {"klass": "observed", "units": {"x": "oxygen mole fraction", "p": "kPa"},
            "note": "Each point is one row of a NASA experimental table. Rows that state oxygen but no pressure have p null and are drawn on a separate strip, never at an assumed pressure.",
            "near_rule": "within %.2f in oxygen fraction and %d%% in pressure" % (NEAR[0], NEAR[1] * 100), "near": {"dx": NEAR[0], "dp": NEAR[1]},
            "series": list(series.values()), "points": points, "near_presets": near, "left_out": left_out,
            "gravity_counts": {"micro": len(points), "partial": 0, "note": "No row in any PSI combustion table was taken in lunar or Martian gravity."}}


# ---------------------------------------------------------------- model against NASA's Tad and Zst

W = {"C2H4": 28.054, "C3H8": 44.097, "C2H6": 30.070, "C4H10": 58.124, "N2": 28.014, "O2": 31.998}
NU = {"C2H4": 3.0, "C3H8": 5.0, "C2H6": 3.5, "C4H10": 6.5}
CEA_NAME = {"C4H10": "C4H10,n-butane"}
FUEL_WORDS = [("ethylene", "C2H4"), ("c2h4", "C2H4"), ("propane", "C3H8"), ("c3h8", "C3H8"), ("ethane", "C2H6"), ("butane", "C4H10")]
PRODUCTS = ["O2", "N2", "CO2", "H2O", "CO", "H2", "OH", "O", "H", "NO", "HO2"]
VALIDATION = [
    {"acc": "PSI-10", "file": "Normal", "fuel": "Fuel", "xf": ["Xfuel"], "xo": ["XO2 (init)", "XO2 (final)"], "p": (["pinit (atm)", "pfinal (atm)"], KPA["atm"]), "T": "Tad (K)", "Z": "mean Zst"},
    {"acc": "PSI-10", "file": "Inverse", "fuel": "C2H4", "xf": ["XC2H4 initial", "XC2H4 final"], "xo": ["XO2"], "p": (["pinit (atm)", "pfinal (atm)"], KPA["atm"]), "T": "Tad (K)", "Z": "mean Zst"},
    {"acc": "PSI-159", "file": "Normal", "fuel": "Fuel", "xf": ["Xf"], "xo": ["XO2 before test", "XO2 after test"], "p": (["approx p (bar)"], KPA["bar"]), "T": "Tad (K)", "Z": "Zst"},
    {"acc": "PSI-159", "file": "Inverse", "fuel": "Fuel", "xf": ["Xf before test", "Xf after test"], "xo": ["XO2"], "p": (["approx p (bar)"], KPA["bar"]), "T": "Tad (K)", "Z": "Zst"},
]


def zst(fuel: str, xf: float, xo: float) -> float:
    """Stoichiometric mixture fraction for a fuel stream (fuel in N2) against an oxidizer stream (O2 in N2)."""
    yf = xf * W[fuel] / (xf * W[fuel] + (1 - xf) * W["N2"])
    yo = xo * W["O2"] / (xo * W["O2"] + (1 - xo) * W["N2"])
    return 1.0 / (1.0 + NU[fuel] * W["O2"] / W[fuel] * yf / yo)


def _stats(d: list[float]) -> dict:
    a = [abs(x) for x in d]
    return {"n": len(d), "mean_abs": round(statistics.mean(a), 2), "median_abs": round(statistics.median(a), 2), "max_abs": round(max(a), 2),
            "bias": round(statistics.mean(d), 2)} if d else {"n": 0}


def validation(tables: dict[str, dict]) -> dict | None:
    try:
        import cantera as ct
    except Exception:
        return None
    names = set(PRODUCTS) | set(NU) | set(CEA_NAME.values())
    gas = ct.Solution(thermo="ideal-gas", species=[s for s in ct.Species.list_from_file("nasa_gas.yaml") if s.name in names])

    def tad(fuel, xf, xo, p_kpa):
        nu = NU[fuel]
        gas.TPX = 298.15, p_kpa * 1000.0, {CEA_NAME.get(fuel, fuel): 1.0, "O2": nu, "N2": (1 - xf) / xf + nu * (1 - xo) / xo}
        gas.equilibrate("HP")
        return float(gas.T)

    out_tables, points = [], []
    for spec in VALIDATION:
        for rel, t in sorted(tables.items()):
            if t["accession"] != spec["acc"] or spec["file"] not in t["file"]:
                continue
            cols = [norm(c) for c in t["columns"]]
            col = lambda r, name: (r[cols.index(name)].strip() if name in cols and cols.index(name) < len(r) else "")
            skipped: dict[str, int] = {}
            d_row, d_atm, d_z, by_fuel = [], [], [], {}
            for i, r in enumerate(t["rows"]):
                ftxt = col(r, spec["fuel"]) if spec["fuel"] in cols else spec["fuel"]
                fuel = next((f for w, f in FUEL_WORDS if w in ftxt.lower()), None)
                xf = [to_num(col(r, c)) for c in spec["xf"]]
                xo = [to_num(col(r, c)) for c in spec["xo"]]
                ps = [to_num(col(r, c)) for c in spec["p"][0]]
                T, Z = to_num(col(r, spec["T"])), to_num(col(r, spec["Z"]))
                xf = [v for v in xf if v is not None]
                xo = [v for v in xo if v is not None]
                ps = [v for v in ps if v is not None]
                why = ("fuel not recognised" if fuel is None else "NASA's Tad or Zst is not a number" if T is None or Z is None
                       else "a stream composition or the pressure is not a number" if not xf or not xo or not ps
                       else "a stream fraction is zero" if min(xf) <= 0 or min(xo) <= 0 else None)
                if why:
                    skipped[why] = skipped.get(why, 0) + 1
                    continue
                xfm, xom, pm = sum(xf) / len(xf), sum(xo) / len(xo), sum(ps) / len(ps) * spec["p"][1]
                t_row, t_atm, z = tad(fuel, xfm, xom, pm), tad(fuel, xfm, xom, 101.325), zst(fuel, xfm, xom)
                d_row.append(t_row - T)
                d_atm.append(t_atm - T)
                d_z.append(z - Z)
                by_fuel.setdefault(ftxt, []).append((t_row - T, t_atm - T))
                points.append({"a": spec["acc"], "t": rel, "r": i, "f": ftxt, "p": round(pm, 2), "T": round(T, 1), "Tr": round(t_row, 1), "Ta": round(t_atm, 1),
                               "Z": round(Z, 5), "Zm": round(z, 5)})
            row, atm = _stats(d_row), _stats(d_atm)
            best = "one_atmosphere" if atm.get("n") and atm["mean_abs"] < row["mean_abs"] else "row_pressure"
            out_tables.append({"accession": spec["acc"], "file": t["file"], "table": rel, "n_rows": t["n_rows"], "n_compared": len(d_row), "skipped": skipped,
                               "Tad": {"row_pressure": row, "one_atmosphere": atm, "closer": best},
                               "Zst": {"n": len(d_z), "mean_abs": round(statistics.mean(abs(x) for x in d_z), 5), "max_abs": round(max(abs(x) for x in d_z), 5)} if d_z else {"n": 0},
                               "by_fuel": [{"fuel": f, "row_pressure": _stats([a for a, _ in v]), "one_atmosphere": _stats([b for _, b in v])} for f, v in sorted(by_fuel.items())],
                               "conditions": "streams and pressure are the mean of the values given for before and after the test, where both are given"})
    best_all = [p["Tr"] - p["T"] if next(t for t in out_tables if t["table"] == p["t"])["Tad"]["closer"] == "row_pressure" else p["Ta"] - p["T"] for p in points]
    return {"klass": "model", "title": "Equilibrium flame temperature and stoichiometric mixture fraction against NASA's own columns",
            "method": "Fuel stream (fuel in nitrogen) and oxidizer stream (oxygen in nitrogen) mixed in stoichiometric proportion, reactants at 298.15 K, "
                      "equilibrium at constant pressure and enthalpy. Computed twice: at the pressure the row states and at one atmosphere.",
            "engine": "Cantera %s, ideal gas, thermodynamic data from nasa_gas.yaml (NASA polynomial fits distributed with Cantera)" % ct.__version__,
            "species": sorted(gas.species_names), "tables": out_tables, "points": points,
            "overall": {"closer_convention_per_table": _stats(best_all), "row_pressure": _stats([p["Tr"] - p["T"] for p in points]), "one_atmosphere": _stats([p["Ta"] - p["T"] for p in points])},
            "limits": "An equilibrium temperature is an upper bound for a gas flame. It says nothing about solid materials, flame spread or extinction."}


# ---------------------------------------------------------------- run

def run(out_dir: str) -> dict:
    inv = json.load(open(os.path.join(out_dir, "investigations.json"), encoding="utf-8"))
    index = json.load(open(os.path.join(out_dir, "tables", "index.json"), encoding="utf-8"))
    in_scope = {i["accession"] for i in inv["items"] if i.get("scope", {}).get("in_scope")}
    tables = {t["artifact"]: json.load(open(os.path.join(out_dir, t["artifact"]), encoding="utf-8")) for t in index["items"]}
    written: dict[str, dict] = {}

    def put(rel: str, obj, klass: str):
        b = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with open(os.path.join(out_dir, rel), "wb") as fh:
            fh.write(b)
        written[rel] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": klass}

    put("profiles.json", {"klass": "derived", "items": {rel: profile_table(t) for rel, t in tables.items()}}, "derived")
    scoped = {rel: t for rel, t in tables.items() if t["accession"] in in_scope}
    val = validation(scoped)
    if val and not val["points"]:
        val = None                      # no table with NASA's Tad and Zst columns in this cache
    finds = []
    for rel, t in sorted(tables.items()):
        finds += findings_for_table(t, rel)
    finds += findings_for_records(inv["items"], tables) + hand_notes(tables)
    if val:
        for vt in val["tables"]:
            r, a = vt["Tad"]["row_pressure"], vt["Tad"]["one_atmosphere"]
            if r.get("n") and a["mean_abs"] * 3 < r["mean_abs"]:
                finds.append({"rule": "tad_pressure_convention", "level": "caution", "accession": vt["accession"], "file": vt["file"], "table": vt["table"], "column": "Tad (K)",
                              "detail": "NASA's Tad column is reproduced within %.1f K on average (largest difference %.1f K, %d rows) when the equilibrium is computed at one atmosphere, "
                                        "but differs by %.1f K on average and up to %.1f K when computed at the pressure the row states."
                                        % (a["mean_abs"], a["max_abs"], a["n"], r["mean_abs"], r["max_abs"]),
                              "handling": "Read Tad in this table as a one-atmosphere value. The site plots it that way and says so.",
                              "found_by": "model comparison, see validation.json"})
    for n, f in enumerate(finds, 1):
        f["id"] = "CF-%03d" % n
        f.setdefault("found_by", "rule '%s'" % f["rule"])
        f["in_scope"] = f["accession"] in in_scope
    by_rule: dict[str, int] = {}
    for f in finds:
        by_rule[f["rule"]] = by_rule.get(f["rule"], 0) + 1
    put("curator_report.json", {"klass": "derived", "note": "Found by the rules named on each row. Nothing was corrected; each row says how the site handles it.",
                                "count": len(finds), "by_rule": by_rule, "items": finds}, "derived")
    env = envelope(scoped)
    put("envelope.json", env, "observed")
    if val:
        put("validation.json", val, "model")

    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"].update(written)
    manifest["nasa"].update({"curator_findings": len(finds), "envelope_points": len(env["points"]),
                             "envelope_points_with_pressure": sum(1 for p in env["points"] if p["p"] is not None),
                             "validation_rows": len(val["points"]) if val else None,
                             "validation_mean_abs_K": val["overall"]["closer_convention_per_table"]["mean_abs"] if val else None})
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"findings": by_rule, "envelope": {s["id"]: [s["n"], s["n_with_pressure"]] for s in env["series"]}, "near": env["near_presets"],
            "validation": [(t["accession"], t["file"][-22:], t["n_compared"], t["Tad"]["row_pressure"].get("mean_abs"), t["Tad"]["one_atmosphere"].get("mean_abs"), t["Tad"]["closer"], t["Zst"].get("mean_abs")) for t in val["tables"]] if val else "cantera not installed; validation.json left as it was",
            "overall": val["overall"] if val else None}
