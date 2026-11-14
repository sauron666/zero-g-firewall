"""
Ranking features. For each combustion record of PSI: ten factors between 0 and 1, each computed
from an artifact that already exists, each with the sentence that explains it. The browser
combines them with weights the reader can change. A score is a way to order reading, built from
stated rules. It is not a probability and not a safety rating.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re

NEAR_X, NEAR_P = 0.03, 0.15
FACTORS = [
    ("atmosphere", "Tested near this atmosphere", "Rows of its tables near the oxygen and pressure of the mission. Ten or more rows score 1. Rows that state oxygen but no pressure count half."),
    ("material", "Burns what a cabin is made of", "Solid materials 1; a gas burner built to emulate solids and liquids 0.6; liquid droplets 0.5; smoke and aerosol studies 0.4; gas flames 0.35."),
    ("gravity", "Gravity of the data", "How directly the gravity of the tests matches the mission. No PSI record was taken in lunar or Martian gravity, so none scores 1 for the Moon or Mars."),
    ("flow", "Varies the airflow", "1 when a column for the air moving past the fuel (air flow, flow or inlet velocity, fan setting, flow direction) changes between tests; 0.5 when such a column holds one value. A burner's own fuel or oxidizer feed does not count."),
    ("outcome", "Records what happened", "1 when the table has a column for an outcome such as extinction, burn time, burn length, spread or ignition."),
    ("detection", "Informs fire detection", "1 for smoke and aerosol measurements; 0.6 when the table records combustion gases (CO, CO2)."),
    ("depth", "Number of tests", "Test rows on a logarithmic scale; 300 rows or more score 1."),
    ("data", "Data held in PSI", "Size of the record's files in PSI on a logarithmic scale; a terabyte or more scores 1."),
    ("reliability", "Free of data cautions", "1 with no curator caution on the record; each kind of caution takes a third off."),
    ("literature", "Publications listed", "Publications listed in the record; twenty or more score 1."),
]
W = lambda **k: k
LENSES = [
    {"id": "iss", "name": "Space station cabin", "gravity": "micro", "about": "Free fall, sea-level air, air moved by fans.",
     "atmospheres": [["ISS cabin", 0.2095, 101.325]],
     "weights": W(atmosphere=0.18, material=0.16, gravity=0.10, flow=0.16, outcome=0.10, detection=0.10, depth=0.08, data=0.04, reliability=0.05, literature=0.03)},
    {"id": "lunar", "name": "Lunar habitat", "gravity": "partial", "about": "One sixth of Earth's gravity; less pressure and more oxygen than on the station.",
     "atmospheres": [["30% oxygen at 10.2 psia", 0.30, 70.33], ["34% oxygen at 8.2 psia", 0.34, 56.54]],
     "weights": W(atmosphere=0.24, material=0.20, gravity=0.14, flow=0.10, outcome=0.10, detection=0.06, depth=0.06, data=0.03, reliability=0.05, literature=0.02)},
    {"id": "mars", "name": "Mars habitat", "gravity": "partial", "about": "Three eighths of Earth's gravity; the same candidate atmospheres as for the Moon.",
     "atmospheres": [["30% oxygen at 10.2 psia", 0.30, 70.33], ["34% oxygen at 8.2 psia", 0.34, 56.54]],
     "weights": W(atmosphere=0.24, material=0.20, gravity=0.14, flow=0.10, outcome=0.10, detection=0.06, depth=0.06, data=0.03, reliability=0.05, literature=0.02)},
    {"id": "rover", "name": "Pressurised rover or lander", "gravity": "partial", "about": "A small cabin at 8.2 psia and 34% oxygen, where smoke fills the volume fast.",
     "atmospheres": [["34% oxygen at 8.2 psia", 0.34, 56.54]],
     "weights": W(atmosphere=0.24, material=0.18, gravity=0.12, flow=0.08, outcome=0.10, detection=0.12, depth=0.06, data=0.03, reliability=0.05, literature=0.02)},
    {"id": "suit", "name": "Spacesuit", "gravity": "any", "about": "Pure oxygen at 4.3 psia, used in free fall and on a surface.",
     "atmospheres": [["pure oxygen at 4.3 psia", 1.0, 29.65]],
     "weights": W(atmosphere=0.34, material=0.24, gravity=0.06, flow=0.06, outcome=0.12, detection=0.02, depth=0.06, data=0.03, reliability=0.05, literature=0.02)},
]
KINDS = [
    ("solid", 1.0, r"\bbass\b|burning and suppression of solids|saffire|spacecraft fire (safety )?experiment|flame spread", "solid materials"),
    ("gas", 0.35, r"smoke point|\bspice\b", "gas-jet flames at their smoke point"),
    ("smoke", 0.4, r"smoke|aerosol|\bsame\b|\bdaft\b|dust", "smoke and aerosols"),
    ("emulator", 0.6, r"burning rate emulator", "a gas burner built to emulate burning solids and liquids"),
    ("droplet", 0.5, r"droplet|\bflex\b|flame extinguishment|cool flames investigation$", "liquid fuel droplets"),
    ("gas", 0.35, r"acme|gaseous|slice|spice|coflow|counterflow|flame design|s-flame|laminar", "gas flames"),
]
FLOW = re.compile(r"air ?flow|flow velocity|inlet velocity|air rate|\bfan\b|flow direction|^direction$|flow restrictor|air display", re.I)   # ambient flow, not a burner's fuel or oxidizer feed
OUTCOME = re.compile(r"test end|self.?\s?-?ext|burn time|burn length|spread|extinction|ignit|cool flame|burning rate|rt/r0|flame off", re.I)
GASES = re.compile(r"\bco2?\b|ppm", re.I)


def kind_of(inv: dict) -> tuple[str, float, str]:
    text = " ".join(str(inv.get(k) or "") for k in ("acronym", "title", "sub_research_area", "hardware")).lower()
    title = str(inv.get("title") or "").lower().strip()
    for kind, score, pat, label in KINDS:
        if re.search(pat, title if pat.endswith("$") and "|" not in pat else text) or (kind == "droplet" and re.search(r"cool flames investigation$", title)):
            return kind, score, label
    return "unknown", 0.0, "not determined from the record"


def build(out_dir: str) -> dict:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    inv, env, prof, cur = load("investigations.json")["items"], load("envelope.json"), load("profiles.json")["items"], load("curator_report.json")["items"]
    items = []
    for i in inv:
        if not i.get("scope", {}).get("in_scope"):
            continue
        acc = i["accession"]
        kind, kscore, klabel = kind_of(i)
        cols = [c for t in i["tables"] if t.get("artifact") in prof for c in prof[t["artifact"]]["columns"]]
        flow_cols = [c for c in cols if FLOW.search(c["name"]) and c["role"] not in ("notes", "empty")]
        flow_var = [c["name"] for c in flow_cols if c["role"] == "varied"]
        out_cols = [c["name"] for c in cols if OUTCOME.search(c["name"]) and c["role"] not in ("notes", "empty", "identifier")]
        gas_cols = [c["name"] for c in cols if GASES.search(c["name"]) and "composition" not in c["name"].lower() and c["role"] != "empty"]
        rows = sum(t.get("rows") or 0 for t in i["tables"])
        cautions = len({f["rule"] for f in cur if f["level"] == "caution" and (f["accession"] == acc or acc in (f.get("also") or []))})
        pubs, size = len(i.get("publications") or []), i["files"]["bytes_listed"]
        shared = {
            "material": {"score": kscore, "why": "Studies %s." % klabel},
            "flow": {"score": 1.0 if flow_var else 0.5 if flow_cols else 0.0,
                     "why": ("Varies: %s." % ", ".join(flow_var[:3])) if flow_var else ("Has '%s', held at one value." % flow_cols[0]["name"]) if flow_cols else ("No flow column in its table." if cols else "No experimental table.")},
            "outcome": {"score": 1.0 if out_cols else 0.0, "why": ("Records: %s." % ", ".join(out_cols[:3])) if out_cols else ("The table lists conditions only." if cols else "No experimental table.")},
            "detection": {"score": 1.0 if kind == "smoke" else 0.6 if gas_cols else 0.0,
                          "why": "Measures smoke or aerosol particles." if kind == "smoke" else ("Records gases: %s." % ", ".join(gas_cols[:3])) if gas_cols else "No smoke or gas readings in its table."},
            "depth": {"score": round(min(1.0, math.log10(1 + rows) / math.log10(301)), 3), "why": "%d test rows." % rows if rows else "No experimental table."},
            "data": {"score": round(min(1.0, math.log10(1 + size) / 12.0), 3), "why": "%d files in PSI." % i["files"]["count"] if i["files"]["count"] else "No files listed beyond the table."},
            "reliability": {"score": round(max(0.0, 1.0 - cautions / 3.0), 3), "why": "%d kind%s of curator caution." % (cautions, "" if cautions == 1 else "s") if cautions else "No curator caution."},
            "literature": {"score": round(min(1.0, pubs / 20.0), 3), "why": "%d publication%s listed." % (pubs, "" if pubs == 1 else "s")},
        }
        pts = [p for p in env["points"] if p["a"] == acc]
        by_lens = {}
        for lens in LENSES:
            best, why = 0.0, "No oxygen or pressure in its table." if not pts else ""
            for name, x0, p0 in lens["atmospheres"]:
                both = sum(1 for p in pts if p["p"] is not None and abs(p["x"] - x0) <= NEAR_X and abs(p["p"] - p0) / p0 <= NEAR_P)
                oxy = sum(1 for p in pts if p["p"] is None and abs(p["x"] - x0) <= NEAR_X)
                s = min(1.0, (both + 0.5 * oxy) / 10.0)
                if s > best or (not why and pts):
                    w = "%d row%s near %s" % (both, "" if both == 1 else "s", name) if both else ""
                    if oxy:
                        w += ("; " if w else "") + "%d row%s match its oxygen but state no pressure" % (oxy, "" if oxy == 1 else "s")
                    if s > best or not why:
                        best, why = max(best, s), (w + "." if w else "None of its %d rows lies near %s." % (len(pts), name))
            g = i["gravity"]
            if lens["gravity"] == "micro":
                gs, gw = (1.0, "Taken in free fall, as on the station.") if g == "micro" else (0.3, "Ground work at 1 g; it supports flight data but is not flight data.")
            elif lens["gravity"] == "partial":
                gs, gw = (0.5, "Taken in free fall. It bounds the low-gravity side; nothing in PSI was taken in partial gravity.") if g == "micro" else (0.3, "Ground work at 1 g. It bounds the high-gravity side only.")
            else:
                gs, gw = (0.7, "Taken in free fall, one of the two settings a suit works in.") if g == "micro" else (0.3, "Ground work at 1 g.")
            by_lens[lens["id"]] = {"atmosphere": {"score": round(best, 3), "why": why}, "gravity": {"score": gs, "why": gw}}
        items.append({"accession": acc, "acronym": i.get("acronym") or "", "title": i["title"], "gravity": i["gravity"], "kind": kind, "rows": rows, "shared": shared, "by_lens": by_lens})
    doc = {"klass": "derived",
           "note": "A score orders reading. It is built from the stated rules below and the weights the reader sets. It is not a probability and not a safety rating.",
           "near_rule": "within %.2f in oxygen fraction and %d%% in pressure" % (NEAR_X, NEAR_P * 100),
           "factors": [{"id": a, "label": b, "rule": c} for a, b, c in FACTORS], "lenses": LENSES, "items": items}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "rank_features.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["rank_features.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "derived"}
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"items": len(items), "kinds": {k: sum(1 for x in items if x["kind"] == k) for k in sorted({x["kind"] for x in items})}}
