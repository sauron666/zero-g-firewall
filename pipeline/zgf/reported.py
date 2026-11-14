"""
Numbers NASA has reported in papers and presentations but has not put in a PSI table.

Three sets, each read from the stored text of the document by a pattern, never typed in:

  saffire   five large fires in a cargo vehicle (Saffire IV to VI): conditions, and what rose in the cabin
  luci      two samples burned in simulated lunar gravity on a spinning rocket, against the same burns on Earth
  fm2       the four tests NASA plans to run on the Moon

Each set is cross-checked against something else NASA states in the same document, and the build
stops if a check fails: a table that no longer agrees with the paper's own sentences has been misread.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re

from . import atmospheres as A
from . import ledger as L
from .claims import LUCI_SLIDES as LUCI
from .claims import LUNAR, LUNAR_SLIDES, NAMES, Resolver, q
from .claims import SAFFIRE6_TEXT as SAFFIRE
from .literature import Library

MMHG_PER_KPA = 7.50062
G_EARTH = 9.80665
NUM = r"[\d,]*\.?\d+"


class ReportedError(RuntimeError):
    pass


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def nums(s: str) -> list[float]:
    return [float(x.replace(",", "")) for x in re.findall(NUM, s)]


def page_with(lib: Library, key: str, needle: str) -> tuple[dict, str]:
    for u in lib.units(key) or []:
        t = flat(u["text"])
        if needle in t:
            return u, t
    raise ReportedError("%s: no page holds %r" % (key, needle))


def where(lib: Library, key: str, unit: dict, what: str) -> dict:
    return {**lib.ref(key, unit), "source": NAMES[key], "what": what}


def row_after(text: str, label: str, n: int) -> list[float]:
    m = re.search(re.escape(label) + r"\s+((?:%s\s+){%d}%s)" % (NUM, n - 1, NUM), text)
    if not m:
        raise ReportedError("row %r with %d numbers not found" % (label, n))
    return nums(m.group(1))


def saffire(lib: Library) -> dict:
    u1, t1 = page_with(lib, SAFFIRE, "Table 1. Saffire IV-VI Sample Test Conditions")
    ids = re.search(r"Flight/Sample ((?:[IV]+-\d ?){5})", t1)
    if not ids:
        raise ReportedError("Saffire Table 1: the row of flights was not found")
    ids = ids.group(1).split()
    cond = {"length_cm": row_after(t1, "Length (cm)", 5), "flow_cm_s": row_after(t1, "Air Flow Rate (cm/s)", 5), "p_kpa": row_after(t1, "Ambient Pressure (kPa)", 5),
            "o2_pct": row_after(t1, "Oxygen Concentration (mol %)", 5), "volume_m3": row_after(t1, "Free volume (m3)", 5)}
    direction = re.search(r"Flow Direction ((?:\w+ ){5})", t1).group(1).split()

    u2, t2 = page_with(lib, SAFFIRE, "Table 2. Saffire IV-VI Heat release and increase of carbon oxides")
    order = ["Max Temp at SFU outlet (°C)", "Max Temp at FFD or nearest location (°C)", "FFD inlet CO2 increase (ppm)", "CO2 partial pressure increase (mmHg)", "FFD inlet CO increase (ppm)"]
    at = [t2.find(h) for h in order]
    if min(at) < 0 or at != sorted(at):
        raise ReportedError("Saffire Table 2: the last five column headings are not there in the expected order")
    body = t2[t2.index(ids[0] + " ", at[-1]):t2.index("*Empty fields")]
    cut = [body.index(i + " ") for i in ids] + [len(body)]
    rows = []
    for n, i in enumerate(ids):
        chunk = body[cut[n]:cut[n + 1]].strip()
        material = re.match(re.escape(i) + r" ((?:\d-sided )?[A-Za-z]+(?: Jersey)?)", chunk).group(1)
        v = nums(chunk[len(i) + 1 + len(material):])
        if len(v) < 5:
            raise ReportedError("Saffire Table 2, row %s: fewer than five numbers" % i)
        rows.append({"id": i, "material": material, "direction": direction[n], **{k: cond[k][n] for k in cond},
                     "t_outlet_c": v[-5], "t_far_c": v[-4], "co2_ppm": v[-3], "co2_mmhg": v[-2], "co_ppm": v[-1], "n_numbers_in_row": len(v)})

    u3, t3 = page_with(lib, SAFFIRE, "Spacecraft Maximum Allowed Concentration (SMAC) value")
    m = re.search(r"the 1-hour SMAC is (\d+) ppm, and the 24-hour SMAC is (\d+) ppm", t3)
    m2 = re.search(r"limits the 1-hour average CO2 partial pressure to no more than (\d+) mm Hg", t3)
    m3 = re.search(r"Selecting (\d+) mg/m3 as a relatively tight alarm threshold, the FFD detector reached that threshold at (\d+) seconds", t3)
    if not (m and m2 and m3):
        raise ReportedError("Saffire paper: the limits or the alarm sentence were not found")
    limits = {"co_1h_ppm": float(m.group(1)), "co_24h_ppm": float(m.group(2)), "co2_1h_mmhg": float(m2.group(1))}
    alarm = {"threshold_mg_m3": float(m3.group(1)), "t_s": float(m3.group(2)), "test": "VI-3"}
    m4 = re.search(r"The flow was changed from (\d+) cm/s to (\d+) cm/s at (\d+) s and terminated at (\d+) s", t3)
    if m4:
        alarm.update({"flow_reduced_s": float(m4.group(3)), "flow_from_cm_s": float(m4.group(1)), "flow_to_cm_s": float(m4.group(2)), "flow_stopped_s": float(m4.group(4))})

    checks = []
    for r in rows:                                                      # the same column twice: parts per million, and millimetres of mercury
        calc = r["co2_ppm"] * 1e-6 * r["p_kpa"] * MMHG_PER_KPA
        ok = abs(calc - r["co2_mmhg"]) <= 0.03 * r["co2_mmhg"]
        checks.append({"what": "%s: %d ppm of carbon dioxide at %.1f kPa is %.2f mmHg; the table says %.2f" % (r["id"], r["co2_ppm"], r["p_kpa"], calc, r["co2_mmhg"]), "ok": ok})
    pmma = [r for r in rows if "PMMA" in r["material"]]
    checks.append({"what": "the paper says both PMMA tests exceeded the carbon dioxide limit of %g mmHg: the table gives %s" % (limits["co2_1h_mmhg"], " and ".join("%.2f" % r["co2_mmhg"] for r in pmma)),
                   "ok": len(pmma) == 2 and all(r["co2_mmhg"] > limits["co2_1h_mmhg"] for r in pmma)})
    checks.append({"what": "the paper says their carbon monoxide was above the 24-hour limit of %g ppm and close to the 1-hour limit of %g: the table gives %s" % (
                   limits["co_24h_ppm"], limits["co_1h_ppm"], " and ".join("%d" % r["co_ppm"] for r in pmma)),
                   "ok": all(limits["co_24h_ppm"] < r["co_ppm"] < limits["co_1h_ppm"] for r in pmma)})
    full = [r for r in rows if r["n_numbers_in_row"] == 10]
    checks.append({"what": "one row of the table has all ten values, which fixes the order of the columns (%s)" % ", ".join(r["id"] for r in full), "ok": bool(full)})
    # the size of the fires and of the vehicles, as the paper states it twice: in its introduction and in its conclusion
    whole = flat(" ".join(u["text"] for u in lib.units(SAFFIRE) or []))
    sizes = re.findall(r"(?:spanned|ranging from) ([\d.]+) to ([\d.]+) kW (?:were tested in unmanned spacecraft )?with free air volumes of (\d+) to (\d+) cubic meters", whole)
    if not sizes:
        raise ReportedError("the Saffire paper no longer states the range of fire sizes and free volumes")
    kw_lo, kw_hi, v_lo, v_hi = (float(x) for x in sizes[0])
    scale = {"kw_min": kw_lo, "kw_max": kw_hi, "volume_min_m3": v_lo, "volume_max_m3": v_hi,
             "ref": where(lib, SAFFIRE, page_with(lib, SAFFIRE, "%s to %s kW" % (sizes[0][0], sizes[0][1]))[0], "the paper's own summary of the test series")}
    vols = [r["volume_m3"] for r in rows if r.get("volume_m3")]
    whole_m3 = lambda x: math.floor(x + 0.5)
    checks.append({"what": "the paper gives the fires as %g to %g kW in free volumes of %g to %g cubic metres, %d time%s in its text and with the same numbers; Table 1 lists volumes from %g to %g, which are %d and %d in whole cubic metres"
                           % (kw_lo, kw_hi, v_lo, v_hi, len(sizes), "" if len(sizes) == 1 else "s", min(vols), max(vols), whole_m3(min(vols)), whole_m3(max(vols))),
                   "ok": len(set(sizes)) == 1 and whole_m3(min(vols)) == v_lo and whole_m3(max(vols)) == v_hi})
    return {
        "title": "Five large fires in a cargo vehicle (Saffire IV to VI)",
        "rows": [{k: v for k, v in r.items() if k != "n_numbers_in_row"} for r in rows],
        "columns": {"p_kpa": "Ambient pressure, kPa", "o2_pct": "Oxygen, mol %", "flow_cm_s": "Air flow, cm/s", "length_cm": "Sample length, cm", "volume_m3": "Free volume, m³",
                    "t_outlet_c": "Highest temperature at the outlet of the flow duct, °C", "t_far_c": "Highest temperature at the far sensors or nearest location, °C",
                    "co2_ppm": "Rise in carbon dioxide at the far sensors, ppm", "co2_mmhg": "Rise in carbon dioxide partial pressure, mmHg", "co_ppm": "Rise in carbon monoxide at the far sensors, ppm"},
        "limits": limits, "alarm": alarm, "scale": scale,
        "refs": {"conditions": where(lib, SAFFIRE, u1, "Table 1"), "products": where(lib, SAFFIRE, u2, "Table 2"), "limits": where(lib, SAFFIRE, u3, "text and Figure 5 caption")},
        "checks": checks,
        "not_used": "Table 2 also lists burn duration and heat release. Some of those cells are empty, and the stored text does not show which, so they are left out.",
    }


def luci(lib: Library) -> dict:
    u1, t1 = page_with(lib, LUCI, "SIBAL Flame Spread Fit Comparison")
    if not re.search(r"Partial- ?G \(mm/s\) 1-G \(mm/s\) Ratio", t1):
        raise ReportedError("LUCI: the heading of the fabric comparison changed")
    base = row_after(t1, "Flame Base", 3)
    tip = row_after(t1, "Flame Tip", 3)
    u2, t2 = page_with(lib, LUCI, "PMMA Flame Tip Comparison")
    m = re.search(r"Partial-G \(cm/s\) 1-G \(cm/s\) Ratio ((?:%s ?){3})" % NUM, t2)
    if not m:
        raise ReportedError("LUCI: the rod comparison was not found")
    rod = nums(m.group(1))
    rows = [
        {"id": "fabric_base", "sample": "Cotton and fibreglass fabric", "measure": "Flame base", "lunar": base[0], "earth": base[1], "ratio": base[2], "unit": "mm/s", "ref": where(lib, LUCI, u1, "slide 33")},
        {"id": "fabric_tip", "sample": "Cotton and fibreglass fabric", "measure": "Flame tip", "lunar": tip[0], "earth": tip[1], "ratio": tip[2], "unit": "mm/s", "ref": where(lib, LUCI, u1, "slide 33")},
        {"id": "rod_tip", "sample": "Acrylic rod, 4 mm", "measure": "Flame tip", "lunar": round(10 * rod[0], 3), "earth": round(10 * rod[1], 3), "ratio": rod[2], "unit": "mm/s",
         "as_stated": "%g and %g cm/s" % (rod[0], rod[1]), "ref": where(lib, LUCI, u2, "slide 36")},
    ]
    checks = [{"what": "%s, %s: %g / %g = %.2f; the slide says %g" % (r["sample"], r["measure"].lower(), r["lunar"], r["earth"], r["lunar"] / r["earth"], r["ratio"]),
               "ok": abs(r["lunar"] / r["earth"] - r["ratio"]) <= 0.011} for r in rows]
    u3, t3 = page_with(lib, LUCI, "A steady vehicle rotation of")
    m = re.search(r"A steady vehicle rotation of (%s) RPM is established, with an effective radius of rotation of (%s) m" % (NUM, NUM), t3)
    if not m:
        raise ReportedError("LUCI: the rotation sentence was not found")
    rpm, radius = float(m.group(1)), float(m.group(2))
    a = (rpm * 2 * math.pi / 60) ** 2 * radius
    spin = {"rpm": rpm, "radius_m": radius, "accel_m_s2": round(a, 3), "g": round(a / G_EARTH, 3), "ref": where(lib, LUCI, u3, "slide 12"),
            "rule": "centripetal acceleration = (2π × rpm / 60)² × radius"}
    u4, t4 = page_with(lib, LUNAR_SLIDES, "Lunar-g =")
    m = re.search(r"Lunar-g = (%s) gE" % NUM, t4)
    if m:
        spin["lunar_g_stated"] = float(m.group(1))
        spin["lunar_g_ref"] = where(lib, LUNAR_SLIDES, u4, "slide 13")
        checks.append({"what": "%g rpm at %g m gives %.3f g; NASA's slide gives lunar gravity as %g g" % (rpm, radius, a / G_EARTH, spin["lunar_g_stated"]), "ok": abs(a / G_EARTH - spin["lunar_g_stated"]) <= 0.01})
    oxygen = []
    for needle, sample, pattern in (("O2% decreases from", "Acrylic rod, 4 mm", r"O2%% decreases from (%s)%% to (%s)%%" % (NUM, NUM)),
                                    ("O2 concentration decreases from", "Cotton and fibreglass fabric", r"O2 concentration decreases from ~(%s)%% to ~(%s)%%" % (NUM, NUM))):
        try:
            u, t = page_with(lib, LUCI, needle)
        except ReportedError:
            continue
        m = re.search(pattern, t)
        if m and t.lstrip().startswith("LUCI"):                       # the slides of the flight, not of the comparison burns on Earth
            oxygen.append({"sample": sample, "from_pct": float(m.group(1)), "to_pct": float(m.group(2)), "approximate": "~" in m.group(0), "ref": where(lib, LUCI, u, "slide %d" % u["page_pdf"])})
    launched = None
    try:
        u, t = page_with(lib, LUCI, "launched")
        m = re.search(r"launched ([A-Z][a-z]{2,8} \d{1,2},? \d{4})", t)
        if m:
            launched = {"as_stated": m.group(1), "ref": where(lib, LUCI, u, "slide %d" % u["page_pdf"])}
    except ReportedError:
        pass
    return {"title": "Two samples in simulated lunar gravity, and the same on Earth (LUCI)", "rows": rows, "spin": spin, "oxygen": oxygen, "launched": launched, "checks": checks}


def fm2(lib: Library) -> dict:
    u, t = page_with(lib, LUNAR_SLIDES, "Initial Chamber Conditions")
    tests = [{"n": int(n), "p_psia": float(p), "tolerance_psi": float(tol), "o2_pct": float(o)} for n, p, tol, o in
             re.findall(r"Test (\d): (%s) psia \(\+/- (%s) psi\), (\d+)%% O2 ?, balance nitrogen" % (NUM, NUM), t)]
    if len(tests) != 4:
        raise ReportedError("FM2: expected four planned tests, found %d" % len(tests))
    for x in tests:
        x["p_kpa"] = round(x["p_psia"] * 6.894757, 2)
    return {"title": "The four tests planned on the Moon (FM2)", "tests": tests, "ref": where(lib, LUNAR_SLIDES, u, "slide 10"),
            "state": "planned", "checks": [{"what": "four tests, each at the same pressure, in falling order of oxygen",
                                             "ok": len({x["p_psia"] for x in tests}) == 1 and [x["o2_pct"] for x in tests] == sorted((x["o2_pct"] for x in tests), reverse=True)}]}


def atmospheres(lib: Library, by_key: dict) -> dict:
    """The cabin atmospheres the site marks, each with the sentence of a stored NASA document that states it."""
    NAMES.setdefault(A.BOARD, "NASA: Apollo 204 Review Board summary")
    pages = lambda key: [(u, flat(u["text"])) for u in lib.units(key) or []] if key in by_key else []
    items, checks = [], []
    for a in A.ATMOSPHERES:
        pair = "%g%% oxygen at %g psia" % (100 * a["x_o2"], a["p_psia"])
        item = {"id": a["id"], "kind": a["kind"], "name": a["name"], "label": a["label"], "o2_pct": round(100 * a["x_o2"], 2), "p_psia": a["p_psia"], "p_kpa": A.p_kpa(a),
                "note": a["note"], "words": None, "ref": None}
        if a["doc"] in by_key:
            st = A.stated(a, pages(a["doc"]), pages(a["also"][0]) if a.get("also") else None)
            checks.append({"what": ("%s: %s is the pair NASA's sentence gives (“%s”)" % (a["name"], pair, st["words"])) if st["ok"]
                                   else "%s: %s is written in the list of atmospheres, but %s" % (a["name"], pair, st["why"]), "ok": st["ok"]})
            if st["ok"]:
                item["words"] = st["words"]
                item["ref"] = where(lib, a["doc"], st["unit"], "the sentence that states this atmosphere")
                if st.get("band_pct") is not None:
                    item["note"] = (item["note"] + " NASA expects control bands that allow up to %g%% oxygen." % st["band_pct"]).strip()
                if "also_ok" in st and a["also"][0] in by_key:
                    checks.append({"what": "%s: a second NASA document gives the same pair (“%s”)" % (a["name"], st["also_words"]), "ok": bool(st["also_ok"])})
                    if st["also_ok"]:
                        item["also_words"] = st["also_words"]
        items.append(item)
    return {"items": items, "checks": checks,
            "note": "The pair of numbers of each atmosphere is an input of the models and of the counts of tests near it. Each is checked at every build against the sentence of the NASA document shown in its receipt."}


QUOTES = {
    "saffire": [
        q(SAFFIRE, "Selecting 1 mg/m3 as a relatively tight alarm threshold, the FFD detector reached that threshold at 981 seconds. By this point, much of the hazardous gas release had occurred.", "The two-sided acrylic sample of Saffire VI"),
        q(SAFFIRE, "Despite these fires, the temperature only increased significantly very near to the fire itself.", ""),
        q(SAFFIRE, "the human hazard from a fire in a spacecraft is very similar to terrestrial fires where the heat from the fire is not the principal hazard and rather the smoke and gaseous products are a much greater concern", "The paper's conclusion"),
        q(SAFFIRE, "Further work will be needed to extend these results to the partial gravity environment expected on future mission to the moon and Mars.", ""),
    ],
    "luci": [
        q(LUCI, "Two samples are burned simultaneously in air at normal pressure", "What flew"),
        q(LUCI, "1-g extinction happens ~ 45 seconds sooner than partial-g extinction", "The fabric burned longer in lunar gravity"),
        q(LUCI, "Flame extinction for 1-g experiment occurs quicker", ""),
        q(LUCI, "demonstrates how the Coriolis force pulls the flame away from the axis of the fuel", "Spinning is not the Moon"),
        q(LUCI, "Material flammability testing at partial-g is feasible using a spinning vehicle.", "Outcome"),
    ],
    "lunar": [
        q(LUNAR, "the crucial mechanism of buoyant oxygen entrainment at the flame base is still present, but at a slower rate", "Why a fire on the Moon does not wait for a fan"),
        q(LUNAR, "partial-g fire in an extraterrestrial habitat is a real hazard that is expected to be substantially worse than in 0-g and potentially worse than even 1-g", ""),
        q(LUNAR, "Related work suggests that oxygen concentration for flammability reaches a minimum value in the vicinity of g = g Lunar.", ""),
        q(LUNAR, "the available times are too short to provide significant flame development (5 s for drop tower and ~25 s for aircraft)", "Why so little has been measured"),
        q(LUNAR, "The first-ever combustion experiments on another world will be performed, with a planned launch date of late 2026.", "FM2"),
    ],
    "fm2": [
        q(LUNAR_SLIDES, "Four 20-cm tall fabric samples burned individually; atmosphere is refreshed between burns", ""),
        q(LUNAR_SLIDES, "There is mounting evidence that if a material passes the NASA standard test it might fail at levels of gravity and flow below 1-g.", ""),
        q(LUNAR_SLIDES, "not expected to ignite but would provide a margin of safety if the limit was lower than expected", "The fourth test, at 25% oxygen"),
    ],
}


def build(raw_dir: str, out_dir: str) -> dict:
    by_key = L.latest(L.load(raw_dir))
    dst = os.path.join(out_dir, "reported.json")
    need = [SAFFIRE, LUCI, LUNAR, LUNAR_SLIDES]
    absent = [k for k in need if k not in by_key]
    if absent:
        if os.path.exists(dst):
            os.remove(dst)
        return {"written": False, "why": "not in this ledger: %s" % "; ".join(absent)}
    lib = Library(raw_dir, by_key)
    resolve = Resolver(lib, by_key, {}, {})
    sets = {"saffire": saffire(lib), "luci": luci(lib), "fm2": fm2(lib), "atmospheres": atmospheres(lib, by_key)}
    failed = [c["what"] for s in sets.values() for c in s["checks"] if not c["ok"]]
    if failed:
        raise ReportedError("a reported number no longer agrees with its own document: %s" % "; ".join(failed))
    quotes = {k: [r for r in (resolve(i) for i in v) if r] for k, v in QUOTES.items()}
    ok = resolve.n_quotes - sum(1 for m in resolve.missing if m.startswith("not found"))
    doc = {"klass": "literature",
           "note": "Reported by NASA in papers and presentations; not in a PSI table. Each number is read from the stored text of its document and checked against another statement in the same document.",
           **sets, "quotes": quotes, "n_quotes": resolve.n_quotes, "n_quotes_verified": ok,
           "n_checks": sum(len(s["checks"]) for s in sets.values())}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(dst, "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["reported.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "literature"}
    manifest["nasa"]["quotes"] = manifest["nasa"].get("quotes", 0) + resolve.n_quotes
    manifest["nasa"]["quotes_verified"] = manifest["nasa"].get("quotes_verified", 0) + ok
    manifest["nasa"]["reported_values_checked"] = doc["n_checks"]
    manifest["nasa"]["files_read"] = len(L.READ)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"written": True, "bytes": len(b), "saffire_rows": len(sets["saffire"]["rows"]), "luci_rows": len(sets["luci"]["rows"]), "fm2_tests": len(sets["fm2"]["tests"]),
            "checks": doc["n_checks"], "quotes": resolve.n_quotes, "verified": ok, "problems": resolve.missing}
