"""
Myth vs Evidence. NASA's "A Researcher's Guide to: Combustion Science" (official resource R4, p. 35)
lists three misconceptions about fire in spacecraft. Each card sets the misconception against what
NASA's own documents and PSI tables say: where it held, where it may fail, what nobody has measured.

Every quotation below is checked against the stored document at build time (literature.Library.find).
Sentences marked "reading" are this project's own and are labelled so on the site.
"""
from __future__ import annotations

import hashlib
import json
import os

from . import ledger as L
from . import physics as ph
from .literature import Library

GUIDE = "doc:researchers_guide"
MIR = "doc:mir_fire_1997"
GLENN = "doc:glenn_combustion_science"
FM2 = "doc:glenn_child:flammability-of-materials-on-the-moon-fm2"
BASS2 = "ntrs:text:20210011385:TM-20210011385.pdf.txt"
OLSON = "ntrs:text:20130010991:20130010991.txt"
LUCI = "ntrs:record:20250010653"
SAFFIRE6 = "ntrs:record:20240002981"
# full texts of the newer reports, stored page by page
SAFFIRE6_TEXT = "ntrs:text:20240002981:Saffire-ICES-2024-ICES-365-accepted final.pdf.txt"
LUCI_SLIDES = "ntrs:text:20250010653:ASGSR 2025-LUCI-Ferkul-Presentation-v2-20250010653.pdf.txt"
LUNAR = "ntrs:text:20260000646:Ferkul-Lunar and Planetary Science Conference 2026.pdf.txt"
LUNAR_SLIDES = "ntrs:text:20260001966:Ferkul-Lunar and Planetary Science Conf 2026 v2.pdf.txt"

NAMES = {
    GUIDE: "A Researcher's Guide to: Combustion Science (NASA)",
    MIR: "NASA History: 25 Years Ago, Fire Aboard Space Station Mir",
    GLENN: "NASA Glenn: Combustion Science",
    FM2: "NASA Glenn: Flammability of Materials on the Moon (FM2)",
    BASS2: "Burning and Suppression of Solids-II (BASS-II) Summary Report, NASA TM, NTRS 20210011385",
    OLSON: "Olson and Ferkul, Evaluating Material Flammability in Microgravity and Martian Gravity Compared to the NASA Standard Normal Gravity Test, NTRS 20130010991",
    LUCI: "Ferkul et al., Lunar Combustion Investigation: Flammability Results from a Rotating Sounding Rocket, NTRS 20250010653 (abstract)",
    SAFFIRE6: "Urban et al., Preliminary Results from the Saffire VI Experiment, NTRS 20240002981 (abstract)",
    SAFFIRE6_TEXT: "Urban et al., Preliminary Results from the Saffire VI Experiment, ICES-2024-365, NTRS 20240002981",
    LUCI_SLIDES: "Ferkul et al., Lunar Combustion Investigation: Flammability Results from a Rotating Sounding Rocket, presentation, NTRS 20250010653",
    LUNAR: "Ferkul, Kralik and Liao, Material Flammability at Lunar and Martian Gravity, extended abstract, NTRS 20260000646",
    LUNAR_SLIDES: "Ferkul et al., Material Flammability at Lunar and Martian Gravity, presentation, NTRS 20260001966",
}
RESOURCE = {GUIDE: "R4", MIR: "R7", GLENN: "R2", FM2: "R2"}


def q(doc: str, quote: str, says: str = "") -> dict:
    return {"kind": "quote", "doc": doc, "quote": quote, "says": says}


def reading(text: str) -> dict:
    return {"kind": "reading", "text": text}


M1 = "A steady fire cannot exist in a quiescent microgravity environment."
M2 = "A fire will self-extinguish if ventilation is shut off."
M3 = "Because the reduced-gravity environment is inherently safer, terrestrial fire standards and tests represent a very conservative approach to fire safety."
FALLACY = q(GUIDE, "demonstrates the fallacy of these assumptions", "NASA Glenn research, in the guide's words")

CARDS = [
    {"id": "fans", "n": 2, "myth": M2,
     "question": "Kill the fans?",
     "answer": "On the space station, cutting the airflow starved the flame NASA tested, within two seconds. NASA's own guide still lists the belief as a misconception, "
               "its documents name the cases where it can fail, and on the Moon gravity keeps air moving after every fan has stopped.",
     "groups": [
         {"side": "holds", "title": "It held when the forced flow was the flame's only source of oxygen", "items": [
             q(BASS2, "After the flame propagated across half the sample length at a steady spread rate of 2.2 mm/s, the flow was abruptly cut off and the flame was observed to extinguish within 2 s",
               "A BASS-II test on the space station"),
             {"kind": "data", "id": "bass2_rows"},
         ]},
         {"side": "warns", "title": "NASA does not treat it as a rule", "items": [
             q(GUIDE, "This resulted in several critical misconceptions about potential fires in spacecraft", "The guide, before listing this belief as the second of three"),
             FALLACY,
         ]},
         {"side": "fails", "title": "Diffusion alone can feed a flame", "items": [
             q(GUIDE, "Contrary to published speculation, the microgravity flame burned in some tests for over 45 minutes before extinguishing from a lack of fuel", "A candle in microgravity"),
             q(GUIDE, "producing the weakest flames ever burned (approximately 1 Watt) and some burning for over 40 minutes before the experiment timed out", "Flame balls, with no flow at all"),
         ]},
         {"side": "fails", "title": "The response itself can supply the air", "items": [
             q(GUIDE, "The local jet entrains air and sustains the flame even when the ambient airflow is turned off", "A suppressant jet aimed at the flame"),
         ]},
         {"side": "fails", "title": "The fuel can bring its own oxygen", "items": [
             q(MIR, "the canister ignited, shooting a three-foot flame with sparks and bits of molten metal across the module and generating a large quantity of dense smoke", "Mir, 24 February 1997"),
             q(MIR, "The flame finally extinguished itself", "After three extinguishers"),
             reading("The page calls the device a solid-fuel oxygen generator. That it fed its own flame, so that stopping ventilation could not have starved it, is our reading and not a sentence on the page."),
         ]},
         {"side": "fails", "title": "The visible flame is not the whole reaction", "items": [
             q(GUIDE, "This vaporization, we now know, is supported by a lower-temperature cool flame that forms after visible flame extinction", "Fuel droplets on the station"),
             {"kind": "data", "id": "cool_flame_rows"},
             reading("Cool flames were seen on large droplets of particular fuels and on gas burners. Nothing here says cabin materials behave this way."),
         ]},
         {"side": "fails", "title": "Gravity can supply the flow", "items": [
             q(GUIDE, "the characteristic gas velocity of the minimum in the curve is on the order of 10 cm/s and also corresponds to a maximum in the flame spread rate", "The flow at which solids burn most readily"),
             {"kind": "model", "id": "lunar_buoyant_flow"},
             q(GUIDE, "In the low-flow conditions of microgravity or partial gravity, some materials are flammable at lower oxygen concentrations than in normal gravity", ""),
             q(LUCI, "the burn lasts for over two and a half minutes", "Fabric and an acrylic rod burning in simulated lunar gravity on a spinning rocket"),
             q(LUNAR, "the crucial mechanism of buoyant oxygen entrainment at the flame base is still present, but at a slower rate", "NASA in 2026, on a marginal material on the Moon"),
             {"kind": "data", "id": "luci_rates"},
         ]},
         {"side": "open", "title": "What nobody has measured yet", "items": [
             {"kind": "data", "id": "partial_gravity_rows"},
             q(LUCI, "These are the first-ever, extended-duration (greater than 25 seconds) combustion tests performed in simulated Lunar gravity", "2025; the data are not in PSI"),
             q(FM2, "Conduct the first-ever observations and measurements of flame spread on the Moon", "An objective of the FM2 experiment"),
         ]},
     ]},
    {"id": "still-air", "n": 1, "myth": M1,
     "question": "Can a fire burn steadily in still air, with no gravity to feed it?",
     "answer": "Yes. NASA's experiments burned candles, flame balls and fuel droplets for minutes in still microgravity gas.",
     "groups": [
         {"side": "fails", "title": "Flames that burned steadily with nothing blowing on them", "items": [
             q(GUIDE, "Contrary to published speculation, the microgravity flame burned in some tests for over 45 minutes before extinguishing from a lack of fuel", "A candle"),
             q(GUIDE, "producing the weakest flames ever burned (approximately 1 Watt) and some burning for over 40 minutes before the experiment timed out", "Flame balls"),
             q(GUIDE, "the identification of stable, quasi-steady cool flames that form after radiative extinction of the visible flame for heptane droplet combustion", "Droplets"),
             {"kind": "data", "id": "flex_ends"},
         ]},
         {"side": "warns", "title": "NASA's verdict on the belief", "items": [FALLACY]},
     ]},
    {"id": "one-g-tests", "n": 3, "myth": M3,
     "question": "Are tests on Earth a safe upper bound for space?",
     "answer": "Not always. NASA reports materials that burn at lower oxygen in microgravity and in Martian gravity than in the standard test on Earth.",
     "groups": [
         {"side": "fails", "title": "Materials that burned in less oxygen than on Earth", "items": [
             q(GUIDE, "is not conservative, and materials can burn at lower oxygen levels in microgravity than on Earth", "The guide, on results from BASS and the standard upward-burning test"),
             q(OLSON, "the 1g flammability limits are generally not conservative for these materials as evidenced by the negative ∆O2%, by up to -5.75% oxygen", "Drop-tower tests at Martian gravity, three materials"),
             q(OLSON, "If proven for more materials, this may indicate the need to include a factor of safety on 1g flammability limits", ""),
             q(GLENN, "which some researchers believe is not conservative in low-g", "NASA Glenn, on the 1 g flame propagation test of NASA-STD-6001"),
             q(FM2, "This means that some things that are not flammable on Earth, may be flammable in potential habitats on the Moon and other places with reduced gravity", ""),
         ]},
         {"side": "holds", "title": "What the same tables show side by side", "items": [{"kind": "data", "id": "saffire2_pairs"}]},
         {"side": "warns", "title": "Why designers relied on Earth tests", "items": [
             q(SAFFIRE6, "The lack of this experimental data has forced spacecraft designers to base their designs and safety precautions on 1-g understanding of flame spread, flame self-extinguishment, fire detection, and suppression", ""),
             FALLACY,
         ]},
     ]},
]

USES = {      # official resource -> where the site uses it (only pages that exist)
    "R1": [("/evidence", "every investigation card and table"), ("/envelope", "every point of the atmosphere map"), ("/rank", "the factors of the ranking"), ("/data", "the curator report and the model check"), ("/ledger", "the first entry of the ledger")],
    "R2": [("/myths", "the caution about the 1 g test, and the FM2 objective"), ("/gaps", "the experiments planned to fill each gap: FM2, SoFIE, FLARE"), ("/falsify", "what would test each conclusion next")],
    "R3": [("/lessons", "linked as the introduction to combustion research on the station; title and author from the stored record")],
    "R4": [("/myths", "the three misconceptions and most of the evidence against them"), ("/falsify", "the conditions under which each conclusion fails"), ("/ask", "153 passages of the guide, searchable")],
    "R5": [("/lessons", "Apollo 1: a flash fire in pure oxygen"), ("/envelope", "the historical point at 16.7 psi of pure oxygen")],
    "R6": [("/lessons", "Apollo 13: insulation burned inside an oxygen tank")],
    "R7": [("/myths", "the Mir fire: a flame fed by its own oxygen"), ("/lessons", "the incident, in NASA's words"), ("/falsify", "a case where stopping the flow could not have starved the flame")],
    "R8": [("/lessons", "lighter air tanks for firefighters")],
    "R9": [("/lessons", "a detector that tells smoke from dust"), ("/playbooks", "the behaviour 'dust that looks like smoke'"), ("/falsify", "why a detector from Earth may not behave the same in orbit")],
    "R10": [("/lessons", "firefighters' gear from spacesuit materials")],
}


def _table(out_dir: str, acc: str, part: str = ""):
    idx = json.load(open(os.path.join(out_dir, "tables", "index.json"), encoding="utf-8"))["items"]
    for t in idx:
        if t["accession"] == acc and part in t["file"]:
            return t, json.load(open(os.path.join(out_dir, t["artifact"]), encoding="utf-8"))
    return None, None


def _col(doc: dict, name: str) -> list[str]:
    cols = [" ".join(c.split()) for c in doc["columns"]]
    j = cols.index(name)
    return [r[j].strip() if j < len(r) else "" for r in doc["rows"]]


def data_items(out_dir: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    t, d = _table(out_dir, "PSI-25")
    if d:
        o2 = [float(v) for v in _col(d, "Calibrated initial O2 % by vol") if v.replace(".", "", 1).isdigit()]
        out["bass2_rows"] = {"klass": "observed", "accession": "PSI-25", "table": t["artifact"], "ledger_seq": t["ledger_seq"], "sha256": t["sha256"],
                             "text": "BASS-II in PSI: %d test rows, with oxygen at the start between %.1f%% and %.1f%%. The table records conditions and gas readings. "
                                     "It has no column saying whether each flame went out." % (d["n_rows"], min(o2), max(o2))}
    t, d = _table(out_dir, "PSI-69")
    if d:
        ends: dict[str, int] = {}
        for v in _col(d, "Test end"):
            ends[v] = ends.get(v, 0) + 1
        out["flex_ends"] = {"klass": "observed", "accession": "PSI-69", "table": t["artifact"], "ledger_seq": t["ledger_seq"], "sha256": t["sha256"],
                            "text": "FLEX in PSI: %d droplet tests. The column 'Test end' reads %s." % (d["n_rows"], ", ".join("%s in %d" % kv for kv in sorted(ends.items(), key=lambda kv: -kv[1])))}
    t, d = _table(out_dir, "PSI-159", "Normal")
    t39, d39 = _table(out_dir, "PSI-39")
    if d and d39:
        yes = [v for v in _col(d, "Cool flame?") if v.lower().startswith("yes")]
        out["cool_flame_rows"] = {"klass": "observed", "accession": "PSI-159", "table": t["artifact"], "ledger_seq": t["ledger_seq"], "sha256": t["sha256"],
                                  "also": ["PSI-39"],
                                  "text": "In PSI: the Cool Flames Investigation lists %d droplet tests (PSI-39); the gas-burner follow-up marks %d of its %d normal-flame rows 'yes' under 'Cool flame?' (PSI-159)."
                                          % (d39["n_rows"], len(yes), d["n_rows"])}
    env = json.load(open(os.path.join(out_dir, "envelope.json"), encoding="utf-8"))
    inv = json.load(open(os.path.join(out_dir, "investigations.json"), encoding="utf-8"))["items"]
    scoped = [i for i in inv if i.get("scope", {}).get("in_scope")]
    rows = sum(t.get("rows", 0) for i in scoped for t in i["tables"])
    out["partial_gravity_rows"] = {"klass": "derived", "link": "/envelope",
                                   "text": "Of %s test rows in the %d combustion records of PSI, %d were taken in lunar or Martian gravity. %d records are flight experiments in free fall and %d are ground work."
                                           % (format(rows, ","), len(scoped), env["gravity_counts"]["partial"], sum(i["gravity"] == "micro" for i in scoped), sum(i["gravity"] == "ground" for i in scoped))}
    t, d = _table(out_dir, "PSI-99")
    if d:
        cols = [" ".join(c.split()) for c in d["columns"]]
        want = ["Sample Number", "Material", "?-g Burn Length", "1-g Burn Length", "?-g Spread Length", "1-g Spread Rate"]
        if all(w in cols for w in want):
            pairs = [[r[cols.index(w)].strip() for w in want] for r in d["rows"] if r[cols.index("?-g Burn Length")].strip() and r[cols.index("1-g Burn Length")].strip()]
            out["saffire2_pairs"] = {"klass": "observed", "accession": "PSI-99", "table": t["artifact"], "ledger_seq": t["ledger_seq"], "sha256": t["sha256"],
                                     "text": "Saffire-II in PSI gives a microgravity and a 1 g result for %d samples in the same table. They are shown as NASA wrote them; the lost symbol in '?-g' is the micro sign." % len(pairs),
                                     "columns": want, "rows": pairs}
    out.update(reported_items(out_dir))
    return out


def reported_items(out_dir: str) -> dict[str, dict]:
    """Facts from reported.json and recorded.json, when this build has them: numbers NASA reported outside PSI, and one recording."""
    out: dict[str, dict] = {}
    path = os.path.join(out_dir, "reported.json")
    if os.path.exists(path):
        rp = json.load(open(path, encoding="utf-8"))
        rows = rp["luci"]["rows"]
        fb = next(r for r in rows if r["id"] == "fabric_base")
        out["luci_rates"] = {"klass": "literature", "link": "/gaps",
                             "text": "NASA's LUCI flight, in simulated lunar gravity: the flame base on the fabric moved at %g mm/s, against %g mm/s in the same test on Earth. "
                                     "Slower, and it burned longer. Read from NASA's slides; the data are not in PSI." % (fb["lunar"], fb["earth"]),
                             "columns": ["Sample", "Measured", "Lunar gravity, simulated", "On Earth", "Ratio on the slide"],
                             "rows": [[r["sample"], r["measure"], "%g %s" % (r["lunar"], r["unit"]), "%g %s" % (r["earth"], r["unit"]), "%g" % r["ratio"]] for r in rows]}
        tests = rp["fm2"]["tests"]
        out["fm2_tests"] = {"klass": "literature", "link": "/gaps",
                            "text": "NASA's plan for the Moon, from its 2026 presentation: %d tests of one fabric at %g psia, starting at %s%% oxygen."
                                    % (len(tests), tests[0]["p_psia"], ", ".join("%g" % t["o2_pct"] for t in tests[:-1]) + " and %g" % tests[-1]["o2_pct"])}
        sf = rp["saffire"]
        hi, lo = max(r["o2_pct"] for r in sf["rows"]), min(r["o2_pct"] for r in sf["rows"])
        out["saffire_conditions"] = {"klass": "literature", "link": "/gaps",
                                     "text": "NASA's paper on Saffire IV to VI lists %d large burns of solid materials at %g%% to %g%% oxygen and %g to %g kPa. These tests are not in a PSI table."
                                             % (len(sf["rows"]), lo, hi, min(r["p_kpa"] for r in sf["rows"]), max(r["p_kpa"] for r in sf["rows"])),
                                     "columns": ["Test", "Material", "Oxygen, mol %", "Pressure, kPa"],
                                     "rows": [[r["id"], r["material"], "%g" % r["o2_pct"], "%g" % r["p_kpa"]] for r in sf["rows"]]}
        pm = [r for r in sf["rows"] if "PMMA" in r["material"]]
        out["saffire_products"] = {"klass": "literature", "link": "/alarm",
                                   "text": "In the two acrylic tests of Saffire VI, carbon monoxide at the far sensors rose by %s ppm and carbon dioxide by %s mmHg. NASA's limits in the same paper: %g ppm of carbon monoxide for 24 hours, "
                                           "%g ppm for one hour, %g mmHg of carbon dioxide as a one-hour average. The highest temperature at the far sensors was %s °C."
                                           % (" and ".join("%g" % r["co_ppm"] for r in pm), " and ".join("%g" % r["co2_mmhg"] for r in pm), sf["limits"]["co_24h_ppm"], sf["limits"]["co_1h_ppm"],
                                              sf["limits"]["co2_1h_mmhg"], " and ".join("%g" % r["t_far_c"] for r in pm))}
    path = os.path.join(out_dir, "recorded.json")
    if os.path.exists(path):
        rc = json.load(open(path, encoding="utf-8"))
        sc, src = rc["derived"]["scatter"], rc["source"]
        out["recorded_detector"] = {"klass": "derived", "accession": "PSI-100", "link": "/alarm",
                                    "text": "Saffire-III, from the vehicle's own telemetry in PSI-100: the smoke detector's scatter reading peaked at %g after a smoke wire was powered and at %g while a sheet of fabric %s long burned. "
                                            "It stayed above %g for %g s the first time and for %g s the second. The file gives no units and no alarm level."
                                            % (sc["wire"]["peak"], sc["fire"]["peak"], rc["samples"][0].get("Sample Length", "").strip() or "about a metre", round(sc["mark"], 2), sc["wire"]["above_mark_s"], sc["fire"]["above_mark_s"]),
                                    "ledger_seq": src["ledger_seq"], "sha256": src["sha256"]}
        out["recorded_delay"] = {"klass": "derived", "accession": "PSI-100", "link": "/alarm",
                                 "text": "In the same recording, with the cabin fan running, the detector's reading first exceeded its level of the minute before ignition %g s after the igniter fired, "
                                         "was half-way to its peak after %g s, and peaked after %g s. The radiometers were back at baseline %g s after ignition."
                                         % (sc["fire"]["first_above_before_s"], sc["fire"]["half_s"], sc["fire"]["peak_s"], rc["derived"]["flame"]["until_t"]),
                                 "ledger_seq": src["ledger_seq"], "sha256": src["sha256"]}
    return out


def model_items() -> dict[str, dict]:
    lo, hi = ph.buoyant_speed_range(0.165)
    return {"lunar_buoyant_flow": {"klass": "model", "link": "/physics",
                                   "text": "Simple scaling puts the buoyant flow near a small flame in lunar gravity at about %.0f to %.0f cm/s: inside the range the guide calls most flammable. "
                                           "A bound from a formula, not a measurement." % (lo * 100, hi * 100)}}


class Resolver:
    """Turns a declared evidence item into what the site shows: a checked quotation, a computed fact, or a labelled reading."""

    def __init__(self, lib: Library, by_key: dict, data: dict, model: dict):
        self.lib, self.by_key, self.data, self.model = lib, by_key, data, model
        self.missing: list[str] = []
        self.n_quotes = 0

    def __call__(self, item: dict) -> dict | None:
        if item["kind"] == "quote":
            if item["doc"] not in self.by_key:
                self.missing.append("document not in the ledger: %s" % item["doc"])
                return None
            where = self.lib.find(item["doc"], item["quote"])
            self.n_quotes += 1
            if not where:
                self.missing.append("not found in %s: %s" % (item["doc"], item["quote"][:70]))
            return {"kind": "quote", "quote": item["quote"], "says": item["says"], "quote_verified": bool(where), "source": NAMES[item["doc"]],
                    "resource": RESOURCE.get(item["doc"]), "ref": self.lib.ref(item["doc"], where)}
        if item["kind"] == "reading":
            return {"kind": "reading", "text": item["text"]}
        if item["kind"] == "fact":
            return {"kind": "data", **{k: v for k, v in item.items() if k != "kind"}}
        src = (self.data if item["kind"] == "data" else self.model).get(item["id"])
        return {"kind": item["kind"], **src} if src else None


def build(raw_dir: str, out_dir: str) -> dict:
    entries = L.load(raw_dir)
    by_key = L.latest(entries)
    lib = Library(raw_dir, by_key)
    data, model = data_items(out_dir), model_items()
    resolve = Resolver(lib, by_key, data, model)
    missing = resolve.missing

    cards = []
    for c in CARDS:
        where = lib.find(GUIDE, c["myth"])
        groups = []
        for g in c["groups"]:
            items = [r for r in (resolve(i) for i in g["items"]) if r]
            if items:
                groups.append({"side": g["side"], "title": g["title"], "items": items})
        cards.append({"id": c["id"], "n": c["n"], "myth": c["myth"], "myth_verified": bool(where), "myth_ref": lib.ref(GUIDE, where), "question": c["question"],
                      "answer": c["answer"], "groups": groups})
    n_quotes = resolve.n_quotes
    doc = {"klass": "literature",
           "note": "Quotations are checked against the stored NASA documents at every build. The short answers and the sentences marked as readings are this project's own; they are not NASA conclusions and not operational advice.",
           "source": NAMES[GUIDE], "quotes": n_quotes, "quotes_verified": n_quotes - sum(1 for m in missing if m.startswith("not found")), "items": cards}

    def put(rel: str, obj) -> dict:
        b = json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with open(os.path.join(out_dir, rel), "wb") as fh:
            fh.write(b)
        return {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "literature"}

    written = {"myths.json": put("myths.json", doc)}
    rpath = os.path.join(out_dir, "official_resources.json")
    res = json.load(open(rpath, encoding="utf-8"))
    for r in res["items"]:
        r["used_in"] = [{"page": p, "what": w} for p, w in USES.get(r["id"], [])]
        r["takeaways"] = [{"text": i["quote"], "ref": i["ref"], "quote_verified": i["quote_verified"]}
                          for c in cards for g in c["groups"] for i in g["items"] if i["kind"] == "quote" and i.get("resource") == r["id"]][:4]
    written["official_resources.json"] = put("official_resources.json", res)
    ipath = os.path.join(out_dir, "ledger_index.json")          # the documents read here count as used by the build
    index = json.load(open(ipath, encoding="utf-8"))
    index["used"] = sorted(L.READ | set(index.get("used", [])))
    written["ledger_index.json"] = {**put("ledger_index.json", index), "klass": "observed"}
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"].update(written)
    manifest["nasa"].update({"official_resources_used": sum(1 for r in res["items"] if r["in_ledger"] and r["used_in"]),
                             "quotes": manifest["nasa"].get("quotes", 0) + n_quotes, "quotes_verified": manifest["nasa"].get("quotes_verified", 0) + doc["quotes_verified"],
                             "files_read": len(L.READ)})
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"quotes": n_quotes, "verified": doc["quotes_verified"], "problems": missing, "resources_used": manifest["nasa"]["official_resources_used"]}
