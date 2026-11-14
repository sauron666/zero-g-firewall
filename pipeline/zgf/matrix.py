"""
The fire behaviour matrix and the response playbook, built the way a security team maps an intrusion:
phases across, behaviours down, and for each behaviour what the evidence covers on the space station
and in a lunar habitat. Every cell opens onto checked quotations, counted table rows or labelled model
results.

The playbook's steps are taken from responses documented in NASA's own pages (what the crew did on Mir,
what NASA's guide says about detectors and extinguishers). Nothing is invented. What this project adds
is the evidence badge beside each step. It is a reading of evidence, not a procedure and not operational
advice.
"""
from __future__ import annotations

import hashlib
import json
import os

from . import ledger as L
from .claims import BASS2, GUIDE, LUCI, LUNAR, M2, MIR, NAMES, OLSON, SAFFIRE6, Resolver, data_items, model_items, q, reading
from .falsify import fact
from .lessons import A1, A13, S_DET
from .literature import Library
from . import atmospheres as ATM

# Fetched by sync 1.2.0. Until a document is in the ledger its quotations are simply left out, and the build says so.
BRIEF = "doc:std3001_fire_protection_brief"
NAMES.setdefault(BRIEF, "NASA-STD-3001 Technical Brief: Fire Protection (NASA Office of the Chief Health and Medical Officer)")

# coverage: "evidence" = measured in that setting; "bounded" = a model or a related test bounds it; "gap" = nothing measured;
# "na" = the behaviour needs something that setting does not have (buoyant flow in free fall)
STATES = ("evidence", "bounded", "gap", "na")
WORDS = {"evidence": "measured there", "bounded": "bounded by a model or a related test", "gap": "nothing measured", "na": "does not apply"}
PHASES = [
    ("preconditions", "Preconditions", "What makes a cabin ready to burn"),
    ("ignition", "Ignition", "How it starts"),
    ("spread", "Growth and spread", "What feeds the flame"),
    ("stealth", "Stealth", "Burning that is hard to see"),
    ("products", "Products and transport", "What the fire puts in the air"),
    ("detection", "Detection", "What the alarm can and cannot know"),
    ("response", "Response and recovery", "What the answer does to the fire"),
]


# the challenge's three pillars; a phase gives the default and a few behaviours differ
PILLAR = {"preconditions": "prevention", "ignition": "prevention", "spread": "suppression", "stealth": "detection", "products": "detection",
          "detection": "detection", "response": "suppression"}


def cells(out_dir: str) -> list[dict]:
    env = json.load(open(os.path.join(out_dir, "envelope.json"), encoding="utf-8"))
    near = {n["id"]: n["n_near"] for n in env["near_presets"]}
    C = lambda cid, phase, name, iss, lunar, items, links=(): {"id": cid, "phase": phase, "name": name, "pillar": PILLAR[phase] if cid not in PILLAR else PILLAR[cid],
                                                                 "iss": iss, "lunar": lunar, "items": items, "links": list(links)}
    return [
        C("rich-air", "preconditions", "Oxygen-rich air at reduced pressure", "evidence", "gap", [
            q(GUIDE, "In the low-flow conditions of microgravity or partial gravity, some materials are flammable at lower oxygen concentrations than in normal gravity", ""),
            fact("%d test rows lie near %s and %d near %s; none is a solid material and none was taken in partial gravity." % (near["challenge_limit"], ATM.words("challenge_limit"), near["exploration"], ATM.short("exploration")), link="/envelope")], ["/envelope", "/gaps"]),
        C("earth-pass", "preconditions", "Materials that pass the test on Earth", "evidence", "bounded", [
            q(GUIDE, "is not conservative, and materials can burn at lower oxygen levels in microgravity than on Earth", "The guide, on BASS results"),
            q(OLSON, "the 1g flammability limits are generally not conservative for these materials as evidenced by the negative ∆O2%, by up to -5.75% oxygen", "Martian gravity, drop tower")], ["/myths/one-g-tests"]),
        C("pure-oxygen", "preconditions", "Pure oxygen, combustibles uncontrolled", "evidence", "gap", [
            q(A1, "Because of the pure oxygen atmosphere, the fire spread quickly, causing a rapid rise in temperature and pressure that led to the rupture of the Command Module pressure vessel", "Apollo 1, on the ground"),
            fact("No PSI test row lies near %s, today's suit atmosphere: %d rows." % (ATM.words("suit"), near["suit"]), link="/envelope")], ["/lessons"]),
        C("arcing", "ignition", "Electrical arcing", "evidence", "gap", [
            q(A1, "Although they couldn’t determine a specific source of ignition, investigators found evidence of arcing in several wires in the spacecraft near the environment control system", "Apollo 1")], ["/lessons"]),
        C("overheat", "ignition", "Overheated insulation", "evidence", "gap", [
            q(A13, "the heaters were left on for an extended period and reached temperatures around 1000 degrees Fahrenheit, degrading the Teflon insulation", "Apollo 13"),
            reading("The alarm lab's 'overheated wire' scenario is the same start seen from the sensors: carbon monoxide without flame.")], ["/alarm/pyrolysis", "/lessons"]),
        C("oxygen-device", "ignition", "A device that makes oxygen", "evidence", "gap", [
            q(MIR, "the canister ignited, shooting a three-foot flame with sparks and bits of molten metal across the module and generating a large quantity of dense smoke", "Mir, 1997")], ["/lessons"]),
        C("flow-fed", "spread", "Spread fed by the fans", "evidence", "bounded", [
            q(GUIDE, "the characteristic gas velocity of the minimum in the curve is on the order of 10 cm/s and also corresponds to a maximum in the flame spread rate", ""),
            {"kind": "data", "id": "bass2_rows"}], ["/evidence/PSI-25", "/evidence/PSI-99"]),
        C("diffusion-fed", "spread", "Burning with no flow at all", "evidence", "gap", [
            q(GUIDE, "Contrary to published speculation, the microgravity flame burned in some tests for over 45 minutes before extinguishing from a lack of fuel", "A candle"),
            {"kind": "data", "id": "flex_ends"}], ["/myths/still-air"]),
        C("gravity-fed", "spread", "Spread fed by gravity", "na", "bounded", [
            {"kind": "model", "id": "lunar_buoyant_flow"},
            q(LUCI, "the burn lasts for over two and a half minutes", "Simulated lunar gravity"),
            {"kind": "data", "id": "luci_rates"},
            q(LUNAR, "the crucial mechanism of buoyant oxygen entrainment at the flame base is still present, but at a slower rate", "NASA in 2026, on a marginal material on the Moon"),
            {"kind": "data", "id": "partial_gravity_rows"}], ["/physics", "/gaps"]),
        C("cool-flame", "stealth", "A cool flame after the visible one", "evidence", "gap", [
            q(GUIDE, "This vaporization, we now know, is supported by a lower-temperature cool flame that forms after visible flame extinction", "Fuel droplets"),
            {"kind": "data", "id": "cool_flame_rows"}], ["/evidence/PSI-39"]),
        C("weak-flame", "stealth", "Flames almost too weak to see", "evidence", "gap", [
            q(GUIDE, "producing the weakest flames ever burned (approximately 1 Watt) and some burning for over 40 minutes before the experiment timed out", "Flame balls")], ["/myths/still-air"]),
        C("unseen-smoke", "stealth", "Smoke that never reaches the detector", "bounded", "bounded", [
            reading("In this site's transport model, in free fall with the fans off, the duct detector stays below its alarm level for the whole ten-minute run. A model result: relative units, prescribed flow."),
            {"kind": "data", "id": "recorded_delay"}], ["/paradox", "/alarm"]),
        C("gases", "products", "Toxic gases, a greater hazard than heat", "evidence", "gap", [
            q(SAFFIRE6, "Overall, the temperature and pressure rise in the spacecraft were found to be less significant than the increase in carbon dioxide and carbon monoxide", "Saffire, a cargo vehicle"),
            {"kind": "data", "id": "saffire_products"},
            q(A1, "Air Force pathologists concluded the astronauts perished from asphyxia from carbon monoxide and other toxic gases resulting from the fire", "Apollo 1")], ["/lessons", "/alarm"]),
        C("particles", "products", "Smoke particles unlike those on Earth", "evidence", "gap", [
            q(GUIDE, "Fundamental research in microgravity highlighted the vastly different particulate size associated with flames in microgravity", ""),
            fact("Smoke-particle measurements in PSI: SAME, SAME-R and the dust test DAFT, all in free fall.", "observed", "/evidence")], ["/evidence/PSI-102", "/evidence/PSI-101", "/evidence/PSI-47"]),
        C("flow-borne", "products", "Smoke goes where the air goes", "bounded", "bounded", [
            reading("Without buoyancy smoke does not rise; it follows the ventilation. The Two realities model shows the consequence for a detector in the return duct.")], ["/paradox"]),
        C("dust-alarm", "detection", "Dust that looks like smoke", "evidence", "gap", [
            q(S_DET, "can discriminate between combustion particles and extraneous matters such as dust", "A detector first flown on the Shuttle"),
            {"kind": "data", "id": "recorded_detector"},
            reading("The alarm lab's dust scenario: two separated detectors at once, no combustion gas, no heat.")], ["/alarm/dust", "/alarm"]),
        C("quiet-detector", "detection", "A detector silenced by the response", "bounded", "bounded", [
            reading("Stopping the fans stops the air that carries smoke to a duct detector. In the alarm lab the alarm latches, and the quiet detector is reported as 'smoke no longer reaches it', never as 'fire out'.")], ["/alarm/fire_fans_off", "/paradox"]),
        C("bad-data", "detection", "Readings that cannot be trusted", "bounded", "bounded", [
            reading("Injected, replayed and clock-shifted readings (SPARTA EX-0014.03, EX-0001.02, EX-0014.01) are rejected by signature, sequence and clock checks. In the test runs, six seeds for each of nine situations, no tampering lowered a fire alarm. Synthetic scenarios.")], ["/alarm/replay"]),
        C("fans-off", "response", "Stopping the ventilation", "evidence", "gap", [
            q(BASS2, "the flow was abruptly cut off and the flame was observed to extinguish within 2 s", "Where it worked"),
            q(GUIDE, M2, "Listed in NASA's guide among the critical misconceptions about spacecraft fires"),
            q(BRIEF, "Terminate ventilation in the affected module to slow the spread of fire", "The station's response, in NASA's technical brief")], ["/myths/fans", "/falsify/bass-flow-off", "/paradox"]),
        C("jet", "response", "A suppressant jet that feeds the flame", "evidence", "gap", [
            q(GUIDE, "The local jet entrains air and sustains the flame even when the ambient airflow is turned off", "")], ["/myths/fans"]),
        C("self-fed", "response", "A fire the extinguisher cannot starve", "evidence", "gap", [
            q(MIR, "The flame finally extinguished itself", "Mir, after three extinguishers"),
            reading("That the canister supplied its own oxygen is our reading of what the device is.")], ["/lessons"]),
        C("lingering", "response", "Smoke and gases that stay after the flame", "evidence", "gap", [
            q(MIR, "Over the next several hours, the station’s life support system cleared the smoke and life returned to normal aboard Mir", "Mir, 1997"),
            {"kind": "data", "id": "recorded_linger"},
            q(BRIEF, "Considerable clean-up will be required after all fire events, minor or major.", "NASA's technical brief")], ["/lessons", "/alarm"]),
    ]


def S(sid, step, documented, iss, lunar, basis, why, adds, cells_):
    return {"id": sid, "step": step, "documented": documented, "iss": iss, "lunar": lunar, "lunar_basis": basis, "why": why, "adds": adds, "cells": cells_}


# Each step is a response that a NASA page documents. Badges: supported | uncertain | gap, for each habitat.
# "basis" says where the evidence behind a lunar badge was taken: no step has a measurement in lunar gravity.
PLAYBOOK = [
    S("detect", "Detect it, and tell smoke from dust", [
        q(GUIDE, "The conditions on a spacecraft require rapid detection of fires with limited false alarms", "NASA's guide"),
        q(GUIDE, "One of the achievements in this area is a new device that monitors particulates and chemical species simultaneously to better detect the onset of a fire", "NASA's guide")],
      "supported", "gap", "free fall only",
      "Smoke and dust particles were measured in free fall (SAME, SAME-R, DAFT). In partial gravity smoke can also rise, which changes which detector sees it first. Nobody has measured that.",
      "One sensor alone cannot tell dust, a failed detector or bad data from smoke. A second kind of sign can: see the alarm lab.",
      ["dust-alarm", "particles", "bad-data"]),
    S("masks", "Protect breathing first", [
        q(MIR, "The crew quickly donned oxygen masks", "What the crew did on Mir"),
        q(BRIEF, "Don protective masks", "The station's response, in NASA's technical brief")],
      "supported", "uncertain", "Earth gravity and free fall only",
      "In Apollo 1 the crew died of the gases. In the Saffire flights carbon monoxide and carbon dioxide rose more than temperature and pressure. Measured at Earth gravity and in free fall, nothing in between.",
      None, ["gases", "lingering"]),
    S("ventilation", "Stop the ventilation", [
        q(BRIEF, "Terminate ventilation in the affected module to slow the spread of fire", "The station's response, in NASA's technical brief"),
        q(BASS2, "the flow was abruptly cut off and the flame was observed to extinguish within 2 s", "Where NASA tested it"),
        q(GUIDE, M2, "Listed in NASA's guide as a critical misconception")],
      "supported", "gap", "free fall only",
      "It starved the flame NASA tested in free fall, and solids burn most readily near ventilation speed. That supports stopping the air to slow a fire. NASA's guide lists the belief that this alone puts a fire out among its critical misconceptions. In lunar gravity buoyancy keeps air moving after the fans stop, and no test exists.",
      "A duct detector that goes quiet after the fans stop has lost its air supply, not necessarily its fire. A model result on this site.",
      ["fans-off", "flow-fed", "diffusion-fed", "gravity-fed", "quiet-detector"]),
    S("extinguisher", "Use the extinguisher, and mind where the jet goes", [
        q(MIR, "Korzun began dousing the flame with foam from a fire extinguisher", "What the crew did on Mir"),
        q(GUIDE, "The first two of the planned nine water-mist portable fire extinguishers were sent to the ISS in December 2015 to replace CO2 units that are currently onboard", "NASA's guide"),
        q(GUIDE, "current findings show that local application of suppressant is not adequate for flame extinguishment", "NASA's guide, on BASS")],
      "uncertain", "gap", "free fall only",
      "The evidence pulls both ways. Extinguishers are on board and were used; in BASS a local jet dragged air into the flame, and on Mir three extinguishers were used before the flame went out by itself. Suppressant tests in PSI are all in free fall.",
      None, ["jet", "self-fed"]),
    S("escape", "Keep the way out open", [
        q(MIR, "The flame blocked the evacuation route to the Soyuz spacecraft docked at the aft end of Kvant-1", "What happened on Mir"),
        q(GUIDE, "have limited options for escape", "NASA's guide, on spacecraft")],
      "supported", "gap", "one incident in free fall",
      "A documented incident, not an experiment: on Mir the flame cut the crew off from one of two escape vehicles. For a surface habitat nothing comparable is on record.",
      None, ["oxygen-device", "self-fed"]),
    S("clear-air", "Clear the air, and keep watching", [
        q(MIR, "The station’s life support systems cleared its atmosphere of the toxic smoke over several hours", "What happened on Mir"),
        q(BRIEF, "Considerable clean-up will be required after all fire events, minor or major.", "NASA's technical brief")],
      "supported", "gap", "free fall only",
      "In the Saffire flights carbon monoxide and carbon dioxide rose more than temperature or pressure. A cool flame can keep reacting after the visible flame is gone: seen for large fuel droplets only, not for cabin materials.",
      None, ["gases", "lingering", "cool-flame", "weak-flame"]),
]


def build(raw_dir: str, out_dir: str) -> dict:
    by_key = L.latest(L.load(raw_dir))
    lib = Library(raw_dir, by_key)
    resolve = Resolver(lib, by_key, data_items(out_dir), model_items())
    keep = lambda items: [x for x in (resolve(i) for i in items) if x]
    out = [{**{k: c[k] for k in ("id", "phase", "name", "pillar", "iss", "lunar", "links")}, "items": keep(c["items"])} for c in cells(out_dir)]
    ids = {c["id"] for c in out}
    steps = []
    for n, s in enumerate(PLAYBOOK, 1):
        unknown = [c for c in s["cells"] if c not in ids]
        if unknown:
            raise ValueError("playbook step %s names behaviours that are not in the matrix: %s" % (s["id"], unknown))
        documented = keep(s["documented"])
        if not any(d["kind"] == "quote" and d["quote_verified"] for d in documented):
            raise ValueError("playbook step %s has no checked quotation behind it: a step must be documented, never invented" % s["id"])
        steps.append({**s, "n": n, "documented": documented})
    for c in out:
        c["steps"] = [s["id"] for s in steps if c["id"] in s["cells"]]
    count = lambda rows, hab, states: {st: sum(1 for r in rows if r[hab] == st) for st in states}
    waiting = sorted({m.split(": ", 1)[1] for m in resolve.missing if m.startswith("document not in the ledger")})
    doc = {"klass": "derived",
           "note": "Coverage says what kind of evidence exists for a behaviour in each setting: measured there, bounded by a model or a related test, or nothing. The playbook's steps are responses that NASA's pages document; the badges are this project's reading of the evidence. It is not a procedure and not operational advice.",
           "phases": [{"id": a, "name": b, "about": c} for a, b, c in PHASES], "pillars": ["prevention", "detection", "suppression"], "cells": out, "playbook": steps,
           "coverage": {h: count(out, h, STATES) for h in ("iss", "lunar")}, "words": WORDS,
           "playbook_coverage": {h: count(steps, h, ("supported", "uncertain", "gap")) for h in ("iss", "lunar")},
           "waiting_for_sync": [{"key": k, "name": NAMES.get(k, k)} for k in waiting]}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "matrix.json"), "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["matrix.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "derived"}
    not_found = [m for m in resolve.missing if m.startswith("not found")]
    manifest["nasa"]["quotes"] = manifest["nasa"].get("quotes", 0) + resolve.n_quotes
    manifest["nasa"]["quotes_verified"] = manifest["nasa"].get("quotes_verified", 0) + resolve.n_quotes - len(not_found)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"cells": len(out), "steps": len(steps), "quotes": resolve.n_quotes, "verified": resolve.n_quotes - len(not_found), "not_found": not_found,
            "waiting_for_sync": waiting, "coverage": doc["coverage"], "playbook_coverage": doc["playbook_coverage"]}
