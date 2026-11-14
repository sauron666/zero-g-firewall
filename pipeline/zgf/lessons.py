"""
Two pages built from the documents in the ledger and the counts already derived:

  gaps.json     what NASA's combustion tables do not hold, each measured from the tables,
                next to the experiment that is planned or flown to fill it
  lessons.json  three incidents (Apollo 1, Apollo 13, Mir) and three uses on Earth
                (NASA Spinoff), each in checked sentences, each tied to a page of this site

Every quotation is checked against the stored document at build time.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re

from . import ledger as L
from .claims import FM2, GLENN, GUIDE, LUCI, MIR, NAMES, OLSON, SAFFIRE6, Resolver, data_items, model_items, q, reading
from .falsify import fact
from .literature import Library

A1, A13, RB = "doc:apollo_1", "doc:apollo_13", "doc:apollo_204_review_board_summary"
SOFIE = "doc:glenn_child:solid-fuel-ignition-and-extinction-sofie"
FLARE = "doc:glenn_child:flammability-limits-at-reduced-g-experiment-flare"
S_TANKS, S_DET, S_ATTIRE = "doc:spinoff_firemans_air_tanks", "doc:spinoff_fire_detector", "doc:spinoff_fire_attire"
VIDEO = "doc:sciencecast_video_oembed"
NAMES.update({A1: "NASA Safety and Mission Assurance: Apollo 1 case study", A13: "NASA Safety and Mission Assurance: Apollo 13 case study",
              RB: "NASA: Apollo 204 Review Board summary", SOFIE: "NASA Glenn: Solid Fuel Ignition and Extinction (SoFIE)",
              FLARE: "NASA Glenn: Flammability Limits at Reduced-g Experiment (FLARE)", S_TANKS: "NASA Spinoff: Fireman's Air Tanks (1976)",
              S_DET: "NASA Spinoff: Fire Detector (1978)", S_ATTIRE: "NASA Spinoff: New Technology for the Fire Attire (1982)"})


KINDS = [("solid", "Solid materials"), ("droplet", "Liquid droplets"), ("gas", "Gas flames")]
COVER_AXIS = (10, 42)       # whole percents drawn one by one; everything above is one stretch up to pure oxygen
OXYGEN_COL = re.compile(r"oxygen|(?<![a-z])x?o2(?![a-z0-9])", re.I)


def whole_percent(x: float) -> int:
    """The whole percent nearest to a mole fraction, halves upward: 0.2095 counts at 21."""
    return int(math.floor(round(100.0 * x, 3) + 0.5))      # rounded first, so 17.5 stored as 17.499999 still goes up


def coverage(env: dict, tables: list[dict]) -> dict:
    """Where the placed test rows sit: fuel form by oxygen percent by gravity regime, with the rows that cannot be placed and why.

    env is envelope.json; tables are the experimental tables of the records in scope (accession, file, artifact, columns, rows).
    The counts must add up to every row of every table, or the build stops.
    """
    kind = {s["id"]: s["kind"] for s in env["series"]}
    cells: dict[str, dict[str, dict]] = {k: {} for k, _ in KINDS}
    stats = {k: {"id": k, "label": label, "rows": 0, "with_pressure": 0, "min": None, "max": None, "records": []} for k, label in KINDS}
    for p in env["points"]:
        k = kind[p["s"]]
        c = cells[k].setdefault(str(whole_percent(p["x"])), {"n": 0, "records": {}})
        c["n"] += 1
        c["records"][p["a"]] = c["records"].get(p["a"], 0) + 1
        s = stats[k]
        s["rows"] += 1
        s["with_pressure"] += 1 if p["p"] is not None else 0
        s["min"] = p["x"] if s["min"] is None else min(s["min"], p["x"])
        s["max"] = p["x"] if s["max"] is None else max(s["max"], p["x"])
        if p["a"] not in s["records"]:
            s["records"].append(p["a"])
    placed_tables = {p["t"] for p in env["points"]}
    left = {"empty": [0, set()], "inverse": [0, set()], "listed": [0, set()], "none": [0, set()]}
    placed_by_table: dict[str, int] = {}
    for p in env["points"]:
        placed_by_table[p["t"]] = placed_by_table.get(p["t"], 0) + 1
    total = 0
    for t in tables:
        n = len(t["rows"])
        total += n
        if t["artifact"] in placed_tables:
            why, n = "empty", n - placed_by_table[t["artifact"]]
        elif "inverse" in t["file"].lower():
            why = "inverse"
        elif any(OXYGEN_COL.search(c) and not re.search(r"co2|flow|mg/s", c, re.I) for c in t["columns"]):
            why = "listed"
        else:
            why = "none"
        if n:
            left[why][0] += n
            left[why][1].add(t["accession"])
    words = {"none": "the table has no oxygen column",
             "inverse": "inverse flames: the oxygen stated is that of the injected gas, not of the atmosphere",
             "listed": "one cell lists several oxygen values (a test matrix, not one test in each row)",
             "empty": "the oxygen cell of the row is empty"}
    not_placed = [{"id": k, "why": words[k], "rows": left[k][0], "records": sorted(left[k][1], key=lambda a: int(a.split("-")[1]))} for k in ("none", "inverse", "listed", "empty") if left[k][0]]
    placed = len(env["points"])
    if placed + sum(x["rows"] for x in not_placed) != total:
        raise ValueError("coverage: %d placed and %d not placed do not add up to %d rows" % (placed, sum(x["rows"] for x in not_placed), total))
    top = max((p["x"] for p in env["points"]), default=0.0)
    return {"klass": "derived",
            "rule": "A test row is counted at the whole percent nearest to the oxygen it states (20.95% counts at 21%). Only a row that states one oxygen value for its atmosphere can be placed.",
            "axis": {"lo": COVER_AXIS[0], "hi": COVER_AXIS[1], "unit": "oxygen, percent by volume"},
            "kinds": [stats[k] for k, _ in KINDS], "cells": cells,
            "regimes": [{"id": "micro", "label": "Free fall", "rows": env["gravity_counts"]["micro"]},
                        {"id": "partial", "label": "Lunar or Martian gravity", "rows": env["gravity_counts"]["partial"]}],
            "atmospheres": [{"id": n["id"], "label": n["label"], "x_o2": n["x_o2"], "p_kpa": n["p_kpa"], "pct": whole_percent(n["x_o2"])} for n in env["near_presets"]],
            "placed": placed, "total": total, "top": top, "not_placed": not_placed}


def gaps(out_dir: str, searches: dict[str, int]) -> list[dict]:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    env, rank = load("envelope.json"), load("rank_features.json")
    near = {n["id"]: n for n in env["near_presets"]}
    both = sum(1 for p in env["points"] if p["p"] is not None)
    solid = [s for s in env["series"] if s["kind"] == "solid"]
    n_solid, n_solid_p = sum(s["n"] for s in solid), sum(s["n_with_pressure"] for s in solid)
    kind_of = {s["id"]: s["kind"] for s in env["series"]}
    top = {k: max((p["x"] for p in env["points"] if kind_of[p["s"]] == k), default=0.0) for k, _ in KINDS}
    solid_top, solid_low = top["solid"], min((p["x"] for p in env["points"] if kind_of[p["s"]] == "solid"), default=0.0)
    pc = lambda x: ("%.1f" % (100.0 * x)).rstrip("0").rstrip(".")
    with_table = [i for i in rank["items"] if i["rows"]]
    with_outcome = [i for i in with_table if i["shared"]["outcome"]["score"] == 1]
    def in_psi(term: str) -> str:
        hits = searches.get(term) or []
        if not hits:
            return "PSI's search for \"%s\" returns no record." % term
        return "PSI's search for \"%s\" returns %d record%s: %s." % (term, len(hits), "" if len(hits) == 1 else "s", ", ".join(hits[:4]))
    rows_all = sum(t.get("rows") or 0 for i in load("investigations.json")["items"] if i.get("scope", {}).get("in_scope") for t in i["tables"])
    return [
        {"id": "partial-gravity", "title": "Nothing was burned in lunar or Martian gravity", "measure": "0", "unit": "of %s test rows" % format(rows_all, ","),
         "why": "Buoyant flow grows with gravity, and the flow near a small flame on the Moon falls where solids burn most readily. Free-fall data bound that case from one side and 1 g data from the other.",
         "evidence": [fact("Every record in PSI's combustion search is a flight experiment in free fall or ground work. No table row was taken in partial gravity.", link="/envelope"), {"kind": "model", "id": "lunar_buoyant_flow"}],
         "plans": [{"name": "FM2, Flammability of Materials on the Moon", "state": "planned", "items": [
                       q(GLENN, "FM2 is the first-ever combustion experiment to be performed on another planetary body", ""),
                       q(FM2, "The experiment burns four fuel samples individually in atmospheric conditions planned for future lunar habitats or vehicles", ""),
                       fact(in_psi("FM2"))]},
                   {"name": "LUCI, Lunar Combustion Investigation", "state": "flown", "items": [
                       q(LUCI, "These are the first-ever, extended-duration (greater than 25 seconds) combustion tests performed in simulated Lunar gravity", ""),
                       fact(in_psi("LUCI") + " Its results are in a NASA report, not in the data repository.")]}]},
        {"id": "solids-pressure", "title": "No solid material is on record at a known pressure", "measure": str(n_solid_p), "unit": "of %d solid-material rows state pressure" % n_solid,
         "why": "Cabins are built of solids. Exploration cabins trade pressure for oxygen, and the solid-fuel tables in PSI give oxygen alone.",
         "evidence": [fact("BASS-II and Saffire list oxygen for %d rows and pressure for none, so none can be placed on the atmosphere map." % n_solid, link="/envelope")],
         "plans": [{"name": "SoFIE, Solid Fuel Ignition and Extinction", "state": "on the station", "items": [
                       q(SOFIE, "The atmosphere will be a mix of oxygen and nitrogen, with the oxygen percentage ranging from atmospheric up to 85%", ""),
                       q(SOFIE, "The pressure will be varied accordingly to stay on or near the normoxic curve", ""),
                       fact(in_psi("SoFIE"))]}]},
        {"id": "solids-oxygen", "title": "No solid-material row states more than %s%% oxygen" % pc(solid_top),
         "measure": "%s%%" % pc(solid_top), "unit": "is the most oxygen any of the %d solid-material rows states" % n_solid,
         "why": "The two exploration atmospheres on this site's map hold 30%% and 34%% oxygen, and a suit holds pure oxygen. The solid-fuel rows in PSI run from %s%% to %s%%." % (pc(solid_low), pc(solid_top)),
         "evidence": [fact("Of %d rows that state oxygen, %d are solid materials; their oxygen runs from %s%% to %s%%. Droplet rows reach %s%% and gas-flame rows %s%%. No row of any kind states more than %s%%."
                           % (len(env["points"]), n_solid, pc(solid_low), pc(solid_top), pc(top["droplet"]), pc(top["gas"]), pc(max(top.values()))), link="/gaps"),
                      q(GUIDE, "The glovebox is normally limited to ISS “air,” nominally 21 percent oxygen by volume and one atmospheric pressure", "Why the station's solid-fuel tests stayed near air"),
                      q(GUIDE, "spacecraft frequently operate at an ambient oxygen mole fraction higher than that of air", "")],
         "plans": [{"name": "SoFIE, Solid Fuel Ignition and Extinction", "state": "on the station", "items": [
                       q(GUIDE, "SoFIE can accommodate testing in exploration atmospheres with reduced pressure and elevated oxygen", ""),
                       q(SOFIE, "The atmosphere will be a mix of oxygen and nitrogen, with the oxygen percentage ranging from atmospheric up to 85%", ""),
                       fact(in_psi("SoFIE"))]}]},
        {"id": "exploration-atmosphere", "title": "Few tests sit near the atmospheres planned for exploration", "measure": "%d and %d" % (near["challenge_limit"]["n_near"], near["exploration"]["n_near"]),
         "unit": "of %d rows lie near 30%% oxygen at 10.2 psia and 34%% at 8.2 psia" % both,
         "why": "Those rows are liquid droplets and gas flames. Near a suit atmosphere, pure oxygen at 4.3 psia, there are %d." % near["suit"]["n_near"],
         "evidence": [fact("%d rows lie near the cabin air of the space station; the count falls to %d and %d at the two exploration atmospheres (near means %s)."
                           % (near["iss"]["n_near"], near["challenge_limit"]["n_near"], near["exploration"]["n_near"], env["near_rule"]), link="/envelope")],
         "plans": [{"name": "FLARE, Flammability Limits at Reduced-g Experiment", "state": "led by JAXA", "items": [
                       q(FLARE, "a new fire safety standard test method for screening spacecraft materials will be proposed that addresses the shortcomings of existing standard test method such as NASA STD 6001B", ""),
                       q(OLSON, "If proven for more materials, this may indicate the need to include a factor of safety on 1g flammability limits", "Olson and Ferkul, on why the standard needs a second look")]}]},
        {"id": "outcomes", "title": "Most tables say what was set, fewer say what happened", "measure": str(len(with_outcome)), "unit": "of %d records with a table have an outcome column" % len(with_table),
         "why": "A table of conditions lets a reader find a test. Only an outcome lets a reader learn from it without opening the raw files, which for some records run to terabytes.",
         "evidence": [fact("Records whose table carries an outcome such as extinction, burn time, burn length or ignition: %s." % ", ".join(i["acronym"] or i["accession"] for i in with_outcome), link="/rank"),
                      {"kind": "data", "id": "bass2_rows"}],
         "plans": [{"name": "What would close it", "state": "a request to the curators", "items": [
                       reading("One outcome column per experimental table (extinguished, burned out, flow at extinction) would turn the test matrices into data. It is the first line of the report for the PSI curators.")]}]},
        {"id": "large-scale", "title": "Half of the large-fire flights are in the repository", "measure": str(len(searches.get("Saffire") or [])), "unit": "of six Saffire flights are in PSI",
         "why": "Saffire burned samples a metre long in a cargo vehicle, the only spacecraft-scale fire data there is.",
         "evidence": [fact(in_psi("Saffire"), "observed", "/evidence"),
                      q(SAFFIRE6, "These tests spanned 1.5 to 3.2 kW with free air volumes of 17 to 19 cubic meters", "The scale of the later flights"),
                      q(SAFFIRE6, "Overall, the temperature and pressure rise in the spacecraft were found to be less significant than the increase in carbon dioxide and carbon monoxide", "What they found mattered most")],
         "plans": [{"name": "Saffire IV to VI", "state": "flown", "items": [fact("Their results are in NASA reports (one is in this site's ledger, NTRS 20240002981). The data sets are not in PSI.")]}]},
    ]


def incidents() -> list[dict]:
    return [
        {"id": "apollo-1", "when": "27 January 1967", "title": "Apollo 1: a flash fire in pure oxygen", "resource": "R5",
         "what": [q(A1, "The astronauts would be wearing spacesuits with the spacecraft’s hatches closed and the cabin pressurized with 100% oxygen", "The test"),
                  q(A1, "Because of the pure oxygen atmosphere, the fire spread quickly, causing a rapid rise in temperature and pressure that led to the rupture of the Command Module pressure vessel", ""),
                  q(A1, "Air Force pathologists concluded the astronauts perished from asphyxia from carbon monoxide and other toxic gases resulting from the fire", "What killed the crew"),
                  q(RB, "NASA’s long history of successes in testing and launching space vehicles with pure oxygen environments at 16.7 p.s.i. and lower pressures led to overconfidence and complacency", "The congressional summary of the review")],
         "ties": [fact("Pure oxygen at 16.7 psi is on the atmosphere map as a historical point. No PSI test row lies anywhere near it, and none lies near today's suit atmosphere either.", link="/envelope"),
                  reading("Gases, not flames, killed the crew. Saffire reached the same ordering sixty years later: carbon monoxide and carbon dioxide rose more than temperature and pressure.")]},
        {"id": "apollo-13", "when": "April 1970", "title": "Apollo 13: insulation burned inside an oxygen tank", "resource": "R6",
         "what": [q(A13, "During the final test on the launch pad, the heaters were left on for an extended period and reached temperatures around 1000 degrees Fahrenheit, degrading the Teflon insulation", "The cause, years before the flight"),
                  q(A13, "the explosion in tank number two also damaged tank number one, making use of the fuel cells impossible and threatening the eventual loss of all electrical power and water", "The consequence"),
                  q(A13, "Thankfully, a lesson learned from the Apollo I fire prevented arcing from happening, as a major redesign added increased insulation to better protect the wiring", "A lesson that carried over")],
         "ties": [reading("A material judged acceptable was not, once the conditions around it changed. That is the question the ranking and the atmosphere map ask of every test: under which conditions was this measured?")]},
        {"id": "mir", "when": "24 February 1997", "title": "Mir: a fire that fed itself", "resource": "R7",
         "what": [q(MIR, "the canister ignited, shooting a three-foot flame with sparks and bits of molten metal across the module and generating a large quantity of dense smoke", ""),
                  q(MIR, "The flame blocked the evacuation route to the Soyuz spacecraft docked at the aft end of Kvant-1", ""),
                  q(MIR, "The flame finally extinguished itself", "After three extinguishers")],
         "ties": [fact("This is one of the cases set against \"a fire will self-extinguish if ventilation is shut off\".", "literature", "/myths/fans"),
                  reading("The page calls the device a solid-fuel oxygen generator. That it fed its own flame is our reading.")]},
    ]


def earth() -> list[dict]:
    return [
        {"id": "air-tanks", "title": "Lighter air tanks for firefighters", "resource": "R8",
         "what": [q(S_TANKS, "New backpack system weighs only 20 pounds for 30 minute air supply, 13 pounds less than conventional firefighting tanks", "With NASA's Johnson Space Center, 1976")],
         "ties": [reading("Breathing protection is the first step of every fire response on the station too. What the crew breathes while the fans are off is the subject of the alarm pages.")]},
        {"id": "detector", "title": "A detector that tells smoke from dust", "resource": "R9",
         "what": [q(S_DET, "can discriminate between combustion particles and extraneous matters such as dust", "First used in space shuttle orbiters"),
                  q(S_DET, "it senses and signals the presence of a fire condition before appearance of flame and smoke", "")],
         "ties": [q(GUIDE, "Fundamental research in microgravity highlighted the vastly different particulate size associated with flames in microgravity", "Why the problem is harder in orbit"),
                  fact("Smoke-particle measurements in PSI: SAME, SAME-R and the dust test DAFT.", "observed", "/evidence")]},
        {"id": "attire", "title": "Firefighters' gear from spacesuit materials", "resource": "R10",
         "what": [q(S_ATTIRE, "lightweight, fire-resistant, heat-protective materials originally developed for use in astronauts' space suits or in spacecraft components which require thermal protection", "Project FIRES, 1982")],
         "ties": [reading("Material choice is the oldest fire control in spaceflight, and the one the Apollo 1 review turned on. The ranking page orders the PSI records by how directly they test materials.")]},
    ]


def build(raw_dir: str, out_dir: str) -> dict:
    entries = L.load(raw_dir)
    by_key = L.latest(entries)
    lib = Library(raw_dir, by_key)
    resolve = Resolver(lib, by_key, data_items(out_dir), model_items())
    searches = {}
    for key, e in by_key.items():
        if e.get("kind") == "psi_search" and e.get("term") != "combustion":
            hits = json.loads(L.read(raw_dir, e).decode("utf-8"))["hits"]["hits"]
            searches[e["term"]] = ["%s (%s)" % (h["_source"].get("Accession"), h["_source"].get("Acronym") or (h["_source"].get("Title") or "")[:48]) for h in hits]
    combustion = {h["_source"].get("Accession") for h in json.loads(L.read(raw_dir, by_key["psi:search:combustion"]).decode("utf-8"))["hits"]["hits"]}
    outside = sorted({x for hits in searches.values() for x in hits if x.split(" ")[0] not in combustion})
    r = lambda items: [x for x in (resolve(i) for i in items) if x]
    g_out = [{**{k: g[k] for k in ("id", "title", "measure", "unit", "why")}, "evidence": r(g["evidence"]),
              "plans": [{"name": p["name"], "state": p["state"], "items": r(p["items"])} for p in g["plans"]]} for g in gaps(out_dir, searches)]
    card = lambda c: {**{k: c[k] for k in c if k not in ("what", "ties")}, "what": r(c["what"]), "ties": r(c["ties"])}
    video = None
    if VIDEO in by_key:
        o = json.loads(L.read(raw_dir, by_key[VIDEO]).decode("utf-8"))
        video = {"title": o.get("title"), "by": o.get("author_name"), "url": "https://www.youtube.com/watch?v=W1oXykoz9zg", "ref": lib.ref(VIDEO), "resource": "R3"}
    res = json.load(open(os.path.join(out_dir, "official_resources.json"), encoding="utf-8"))["items"]
    lessons = {"klass": "literature", "note": "Quotations are checked against the stored NASA pages. Sentences marked as readings are ours.",
               "incidents": [card(c) for c in incidents()], "earth": [card(c) for c in earth()], "video": video,
               "resources": [{k: x[k] for k in ("id", "title", "url", "type", "in_ledger", "used_in", "receipts")} for x in res]}
    scoped = [json.load(open(os.path.join(out_dir, tb["artifact"]), encoding="utf-8")) | {"artifact": tb["artifact"]}
              for i in json.load(open(os.path.join(out_dir, "investigations.json"), encoding="utf-8"))["items"] if i.get("scope", {}).get("in_scope") for tb in i["tables"]]
    cover = coverage(json.load(open(os.path.join(out_dir, "envelope.json"), encoding="utf-8")), scoped)
    gdoc = {"klass": "derived", "coverage": cover, "note": "Each gap is measured from NASA's tables as fetched for this site. Plans are quoted from NASA pages and reports in the ledger.", "searches": {k: len(v) for k, v in searches.items()}, "outside_the_combustion_search": outside,
            "outside_note": "Returned by another fire-related search of PSI but not by the combustion search, so not among the records on this site.", "items": g_out}
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    for name, doc, klass in (("gaps.json", gdoc, "derived"), ("lessons.json", lessons, "literature")):
        b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with open(os.path.join(out_dir, name), "wb") as fh:
            fh.write(b)
        manifest["artifacts"][name] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": klass}
    ok = resolve.n_quotes - sum(1 for m in resolve.missing if m.startswith("not found"))
    manifest["nasa"]["quotes"] = manifest["nasa"].get("quotes", 0) + resolve.n_quotes
    manifest["nasa"]["quotes_verified"] = manifest["nasa"].get("quotes_verified", 0) + ok
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"gaps": len(g_out), "coverage": {"placed": cover["placed"], "total": cover["total"], "not_placed": {x["id"]: x["rows"] for x in cover["not_placed"]}}, "quotes": resolve.n_quotes, "verified": ok, "problems": resolve.missing, "outside": outside}
