"""
Try to refute it. For a conclusion, including the ones this site itself draws, set out:
the evidence for it and the scope that evidence covers; the conditions under which NASA's
documents or tables say it fails or weakens; what has never been tested; and what would test it.

Deterministic: every item is a checked quotation, a number computed from a NASA table, a model
result labelled as such, or a sentence marked as our reading. The verdict words are fixed:
holds within the tested scope, limited, contradicted, untested.
"""
from __future__ import annotations

import hashlib
import json
import os

from . import ledger as L
from .claims import (BASS2, FM2, GLENN, GUIDE, LUCI, LUNAR, MIR, OLSON, SAFFIRE6, SAFFIRE6_TEXT, M2, M3, Resolver, data_items, model_items, q, reading)
from .literature import Library
from . import atmospheres as ATM

SPINOFF_DET = "doc:spinoff_fire_detector"
VERDICTS = {"holds": "Holds within the tested scope", "limited": "Limited: true only under conditions", "contradicted": "Contradicted by NASA's evidence", "untested": "Untested"}


def fact(text: str, klass: str = "derived", link: str | None = None, accession: str | None = None) -> dict:
    f = {"kind": "fact", "klass": klass, "text": text}
    if link:
        f["link"] = link
    if accession:
        f["accession"] = accession
    return f


def claims(out_dir: str) -> list[dict]:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    env, val = load("envelope.json"), load("validation.json")
    near = {n["id"]: n for n in env["near_presets"]}
    both = sum(1 for p in env["points"] if p["p"] is not None)
    solids_p = sum(s["n_with_pressure"] for s in env["series"] if s["kind"] == "solid")
    o = val["overall"]["closer_convention_per_table"]
    one = [t for t in val["tables"] if t["Tad"]["closer"] == "one_atmosphere"]
    skipped = sum(sum(t["skipped"].values()) for t in val["tables"])
    pmin, pmax = min(p["p"] for p in val["points"]), max(p["p"] for p in val["points"])
    bx = [p["x"] for p in env["points"] if p["a"] == "PSI-25"]
    bass_o2 = "oxygen between %.1f%% and %.1f%% at the start of the tests" % (100 * min(bx), 100 * max(bx)) if bx else "oxygen as recorded in the table"
    FAILS = [
        {"title": "A flame can live on diffusion alone", "items": [
            q(GUIDE, "Contrary to published speculation, the microgravity flame burned in some tests for over 45 minutes before extinguishing from a lack of fuel", "A candle in microgravity"),
            q(GUIDE, "producing the weakest flames ever burned (approximately 1 Watt) and some burning for over 40 minutes before the experiment timed out", "Flame balls, with no flow at all")]},
        {"title": "The response supplies the air", "items": [q(GUIDE, "The local jet entrains air and sustains the flame even when the ambient airflow is turned off", "A suppressant jet aimed at the flame")]},
        {"title": "The fuel brings its own oxygen", "items": [
            q(MIR, "The flame finally extinguished itself", "Mir, 1997: a solid-fuel oxygen generator burned for minutes"),
            reading("That the canister fed its own flame is our reading of what such a device is; the page does not say it.")]},
        {"title": "The reaction outlives the visible flame", "items": [q(GUIDE, "This vaporization, we now know, is supported by a lower-temperature cool flame that forms after visible flame extinction", "Fuel droplets")]},
        {"title": "Gravity moves the air", "items": [
            q(GUIDE, "the characteristic gas velocity of the minimum in the curve is on the order of 10 cm/s and also corresponds to a maximum in the flame spread rate", ""),
            {"kind": "model", "id": "lunar_buoyant_flow"},
            q(LUCI, "the burn lasts for over two and a half minutes", "Simulated lunar gravity")]},
    ]
    UNTESTED_G = fact("No row of any PSI combustion table was taken in lunar or Martian gravity.", link="/envelope")
    return [
        {"id": "bass-flow-off", "origin": "/myths/fans", "verdict": "holds",
         "claim": "In a BASS-II test, the flame goes out after the forced flow stops.",
         "summary": "True as observed, for a flame whose only air came from the fan. Five kinds of condition are documented under which stopping the flow does not end the burning, and one whole regime, partial gravity, has no data.",
         "scope": ["free fall, on the space station", "a solid sample in a small wind tunnel", bass_o2, "forced flow as the flame's only air supply", "pressure not recorded in the table"],
         "holds": [q(BASS2, "After the flame propagated across half the sample length at a steady spread rate of 2.2 mm/s, the flow was abruptly cut off and the flame was observed to extinguish within 2 s", "The observation"),
                   {"kind": "data", "id": "bass2_rows"}, {"kind": "data", "id": "bass2_endings"}],
         "fails": FAILS,
         "untested": [UNTESTED_G, fact("The BASS-II and Saffire tables do not record pressure, so the result cannot be placed at a reduced-pressure, oxygen-rich atmosphere.", link="/envelope")],
         "next": [q(FM2, "Conduct the first-ever observations and measurements of flame spread on the Moon", "FM2, planned"),
                  q(LUCI, "These are the first-ever, extended-duration (greater than 25 seconds) combustion tests performed in simulated Lunar gravity", "LUCI, flown; its data are not in PSI")]},
        {"id": "fans-rule", "origin": "/myths/fans", "verdict": "contradicted",
         "claim": M2,
         "summary": "As a general rule, no. NASA's guide lists this sentence as a misconception. It describes what happened in the tested case and fails under the conditions below.",
         "scope": ["stated without conditions"],
         "holds": [q(BASS2, "the flow was abruptly cut off and the flame was observed to extinguish within 2 s", "Where it did happen")],
         "fails": [{"title": "NASA rejects it as a rule", "items": [q(GUIDE, "This resulted in several critical misconceptions about potential fires in spacecraft", ""), q(GUIDE, "demonstrates the fallacy of these assumptions", "")]}] + FAILS,
         "untested": [UNTESTED_G], "next": [q(FM2, "Conduct the first-ever observations and measurements of flame spread on the Moon", "FM2, planned")]},
        {"id": "earth-tests", "origin": "/myths/one-g-tests", "verdict": "contradicted",
         "claim": "A material that passes the flammability test on Earth is safe to fly.",
         "summary": "NASA's documents report materials that burn in less oxygen in microgravity and in Martian gravity than in the standard test on Earth. The word 'safe' is not one the evidence can support.",
         "scope": ["stated without conditions"],
         "holds": [reading("The standard upward-burning test is the worst case on Earth, where buoyant flow is strong. That is the reason it was long treated as a bound.")],
         "fails": [{"title": "Lower oxygen limits away from 1 g", "items": [
             q(GUIDE, "is not conservative, and materials can burn at lower oxygen levels in microgravity than on Earth", "The guide, on BASS results"),
             q(OLSON, "the 1g flammability limits are generally not conservative for these materials as evidenced by the negative ∆O2%, by up to -5.75% oxygen", "Martian gravity, three materials"),
             q(GLENN, "which some researchers believe is not conservative in low-g", "NASA Glenn"),
             q(FM2, "This means that some things that are not flammable on Earth, may be flammable in potential habitats on the Moon and other places with reduced gravity", "")]}],
         "untested": [UNTESTED_G, fact("%d rows lie near %s and %d near %s; none of them is a solid material." % (near["challenge_limit"]["n_near"], ATM.words("challenge_limit"), near["exploration"]["n_near"], ATM.short("exploration")), link="/envelope")],
         "next": [q(OLSON, "If proven for more materials, this may indicate the need to include a factor of safety on 1g flammability limits", "What the authors propose")]},
        {"id": "coverage", "origin": "/envelope", "verdict": "contradicted",
         "claim": "NASA's microgravity combustion data cover the atmospheres planned for lunar and Martian habitats.",
         "summary": "They touch those atmospheres with a handful of gas and droplet rows. For solid materials and for partial gravity there is nothing to cover with.",
         "scope": ["the 24 combustion records of PSI, as fetched for this site"],
         "holds": [fact("%d of %d test rows state both oxygen and pressure; %d lie near the cabin air of the space station." % (both, len(env["points"]), near["iss"]["n_near"]), link="/envelope"),
                   fact("%d rows lie near %s and %d near %s (near means %s)." % (near["challenge_limit"]["n_near"], ATM.words("challenge_limit"), near["exploration"]["n_near"], ATM.short("exploration"), env["near_rule"]), link="/envelope")],
         "fails": [{"title": "What the counts leave out", "items": [
             fact("Solid-material rows that state pressure: %d. The BASS-II and Saffire tables give oxygen only." % solids_p, link="/envelope"),
             fact("Rows near a suit atmosphere (%s): %d." % (ATM.words("suit"), near["suit"]["n_near"]), link="/envelope"),
             UNTESTED_G]}],
         "untested": [fact("Whether the raw files of these records hold pressures that the experimental tables omit. The site reads the tables, a few summaries and one raw data file (the Saffire-III recording), not the other raw data.")],
         "next": [q(FM2, "Conduct the first-ever observations and measurements of flame spread on the Moon", "FM2, planned")]},
        {"id": "our-model", "origin": "/physics", "verdict": "holds",
         "claim": "The flame-temperature model on this site agrees with NASA's own numbers.",
         "summary": "For the gas flames NASA tabulated, yes, to about two kelvin. It says nothing about solids, and for one record the agreement depends on reading NASA's column as a one-atmosphere value.",
         "scope": ["gas flames of ethylene, propane, ethane and butane diluted with nitrogen", "pressures from %.0f to %.0f kPa" % (pmin, pmax), "the %d rows of four tables where NASA gives a number" % o["n"]],
         "holds": [fact("Model against NASA's Tad: %d rows, mean difference %.1f K, median %.1f K, bias %+.1f K. Zst agrees to the fourth decimal." % (o["n"], o["mean_abs"], o["median_abs"], o["bias"]), "model", "/physics")],
         "fails": [{"title": "Where the agreement is weaker or conditional", "items": [
             fact("The largest single difference is %.1f K." % o["max_abs"], "model", "/physics"),
             fact("In %s the columns agree only when the model is run at one atmosphere. Run at the pressure each row states, the mean difference is %.1f K and the largest %.1f K."
                  % (" and ".join(sorted({t["accession"] for t in one})), max(t["Tad"]["row_pressure"]["mean_abs"] for t in one), max(t["Tad"]["row_pressure"]["max_abs"] for t in one)), "model", "/data"),
             fact("%d rows were left out because NASA's cell or an input is not a number (ramp tests, spreadsheet errors)." % skipped, "derived", "/data")]}],
         "untested": [fact("Solid materials, droplets, flame spread and extinction: NASA's tables carry no computed temperature for them, and an equilibrium temperature could not describe them anyway."),
                      fact("Diluents other than nitrogen. FLEX used carbon dioxide and helium; those rows have no Tad column to compare with.")],
         "next": [reading("A table from NASA with measured flame temperatures, or with Tad computed at the stated pressure, would test this directly.")]},
        {"id": "detector", "origin": "/alarm", "verdict": "limited",
         "claim": "A smoke detector that works on Earth will work the same way in a spacecraft.",
         "summary": "NASA's documents say smoke itself is different without buoyancy, and that telling smoke from dust took a purpose-built detector.",
         "scope": ["stated without conditions"],
         "holds": [reading("Detectors of both kinds have flown and have raised alarms; nothing here says they do not work."),
                   {"kind": "data", "id": "recorded_delay"}],
         "fails": [{"title": "A wire and a fire can read alike", "items": [{"kind": "data", "id": "recorded_detector"}]},
                   {"title": "The alarm can come after the gases", "items": [
             q(SAFFIRE6_TEXT, "Selecting 1 mg/m3 as a relatively tight alarm threshold, the FFD detector reached that threshold at 981 seconds. By this point, much of the hazardous gas release had occurred.", "Saffire VI, two-sided acrylic sample"),
             {"kind": "data", "id": "saffire_products"}]},
                   {"title": "The particles are not the same", "items": [
             q(GUIDE, "Fundamental research in microgravity highlighted the vastly different particulate size associated with flames in microgravity", ""),
             q(SPINOFF_DET, "can discriminate between combustion particles and extraneous matters such as dust", "A detector first used in space shuttle orbiters"),
             q(SAFFIRE6, "Overall, the temperature and pressure rise in the spacecraft were found to be less significant than the increase in carbon dioxide and carbon monoxide", "What a large fire changed most in a cargo vehicle")]}],
         "untested": [UNTESTED_G, fact("Smoke particle sizes in PSI come from two flight experiments (SAME and SAME-R) and a dust test (DAFT), all in free fall.", "observed", "/evidence")],
         "next": [reading("Particle-size data from a partial-gravity burn would show whether lunar smoke looks like Earth's, like the station's, or like neither.")]},
    ]


def build(raw_dir: str, out_dir: str) -> dict:
    by_key = L.latest(L.load(raw_dir))
    lib = Library(raw_dir, by_key)
    resolve = Resolver(lib, by_key, data_items(out_dir), model_items())
    from .claims import NAMES
    NAMES.setdefault(SPINOFF_DET, "NASA Spinoff: Fire Detector (1978)")
    out = []
    for c in claims(out_dir):
        r = lambda items: [x for x in (resolve(i) for i in items) if x]
        out.append({"id": c["id"], "claim": c["claim"], "origin": c["origin"], "verdict": c["verdict"], "verdict_label": VERDICTS[c["verdict"]], "summary": c["summary"], "scope": c["scope"],
                    "holds": r(c["holds"]), "fails": [{"title": g["title"], "items": r(g["items"])} for g in c["fails"]], "untested": r(c["untested"]), "next": r(c["next"])})
    doc = {"klass": "derived", "verdicts": VERDICTS,
           "note": "Each conclusion is set against checked quotations and numbers computed from NASA's tables. The verdict words are fixed and say only what the evidence allows. Summaries are our reading.",
           "quotes": resolve.n_quotes, "quotes_verified": resolve.n_quotes - sum(1 for m in resolve.missing if m.startswith("not found")), "items": out}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "falsify.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["falsify.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "derived"}
    manifest["nasa"]["quotes"] = manifest["nasa"].get("quotes", 0) + resolve.n_quotes
    manifest["nasa"]["quotes_verified"] = manifest["nasa"].get("quotes_verified", 0) + doc["quotes_verified"]
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"claims": len(out), "quotes": resolve.n_quotes, "verified": doc["quotes_verified"], "problems": resolve.missing}
