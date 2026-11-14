"""
The retrieval index for "Ask the evidence": short passages, each with its class, a link into the site
and a receipt. Built only from things already derived and from documents in the ledger.
The browser searches it with BM25 and answers by quoting passages; a language model, when one is
connected, may only rephrase what these passages say and must cite them.
"""
from __future__ import annotations

import hashlib
import json
import os
import re

from . import ledger as L
from .claims import M1, M2, M3
from .inventory import endings_sentence
from .literature import Library

PAGES = [  # (ledger key, title, link on the site or None)
    ("doc:mir_fire_1997", "NASA History: Fire Aboard Space Station Mir (1997)", "/myths"),
    ("doc:glenn_combustion_science", "NASA Glenn: Combustion Science", None),
    ("doc:glenn_child:flammability-of-materials-on-the-moon-fm2", "NASA Glenn: Flammability of Materials on the Moon (FM2)", None),
    ("doc:glenn_child:flammability-limits-at-reduced-g-experiment-flare", "NASA Glenn: Flammability Limits at Reduced-g Experiment (FLARE)", None),
    ("doc:glenn_child:solid-fuel-ignition-and-extinction-sofie", "NASA Glenn: Solid Fuel Ignition and Extinction (SoFIE)", None),
    ("doc:apollo_1", "NASA Safety: Apollo 1 case study", None),
    ("doc:apollo_13", "NASA Safety: Apollo 13 case study", None),
    ("doc:apollo_204_review_board_summary", "NASA: Apollo 204 Review Board summary", None),
    ("doc:spinoff_firemans_air_tanks", "NASA Spinoff: Fireman's Air Tanks", None),
    ("doc:spinoff_fire_detector", "NASA Spinoff: Fire Detector", None),
    ("doc:spinoff_fire_attire", "NASA Spinoff: New Technology for the Fire Attire", None),
]
GUIDE = "doc:researchers_guide"


def pieces(text: str, size: int = 900) -> list[str]:
    """Split running text at sentence ends into passages of about `size` characters."""
    text = re.sub(r"-\s*\n\s*", "", text)
    sents = re.split(r"(?<=[.!?])\s+(?=[A-Z(\"“])", re.sub(r"\s+", " ", text).strip())
    out, cur = [], ""
    for s in sents:
        if len(cur) + len(s) > size and cur:
            out.append(cur.strip())
            cur = ""
        cur += s + " "
    if cur.strip():
        out.append(cur.strip())
    return out


def prose(text: str) -> str:
    """Keep the lines of a web page that read as sentences; drop menus and link lists."""
    keep = [ln.strip() for ln in text.split("\n") if len(ln.strip()) >= 80 and re.search(r"[.!?]", ln) and ln.count(" ") >= 10]
    return "\n".join(keep)


def build(raw_dir: str, out_dir: str) -> dict:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    by_key = L.latest(L.load(raw_dir))
    lib = Library(raw_dir, by_key)
    chunks: list[dict] = []

    def add(cid, klass, title, text, link=None, ref=None, loc=None):
        text = re.sub(r"\s+", " ", text or "").strip()
        if len(text) < 40:
            return
        c = {"id": cid, "k": klass, "t": title, "x": text}
        if link:
            c["l"] = link
        if ref:
            c["r"] = {k: ref[k] for k in ("ledger_seq", "sha256", "url") if k in ref}
        if loc:
            c["loc"] = loc
        chunks.append(c)

    inv = load("investigations.json")["items"]
    prof = load("profiles.json")["items"]
    for i in inv:
        if not i.get("scope", {}).get("in_scope"):
            continue
        acc, name = i["accession"], ("%s (%s)" % (i["acronym"], i["accession"]) if i.get("acronym") else i["accession"])
        rows = sum(t.get("rows") or 0 for t in i["tables"])
        add("inv:%s:summary" % acc, "observed", "%s: record" % name,
            "%s: %s. %s. Hardware: %s. Topic: %s. %s. PSI lists %d files and %d publications for it."
            % (name, i["title"], "Flight experiment in free fall on %s" % (i["platform"] or "a platform PSI does not state") if i["gravity"] == "micro" else "Ground investigation at 1 g",
               i["hardware"] or "not stated", i["sub_research_area"] or "not stated", "%d test rows in its experimental table" % rows if rows else "It has no experimental table",
               i["files"]["count"], len(i["publications"])), "/evidence/%s" % acc, i["refs"].get("title"))
        for field, label in (("objective", "objective"), ("hypothesis", "hypothesis"), ("approach", "approach"), ("impacts", "why it matters")):
            for n, p in enumerate(pieces(i.get(field) or "")):
                add("inv:%s:%s:%d" % (acc, field, n), "observed", "%s: %s, in NASA's words" % (name, label), p, "/evidence/%s" % acc, i["refs"].get(field))
        for t in i["tables"]:
            p = prof.get(t.get("artifact") or "")
            if not p:
                continue
            varied = "; ".join("%s (%s)" % (c["name"], ("%s to %s" % (c["min"], c["max"]) if "min" in c else ", ".join(v for v, _ in c["top"][:4]))) for c in p["columns"] if c["role"] == "varied")
            const = "; ".join("%s = %s" % (a, b) for a, b in p["constant"])
            add("tab:%s" % t["artifact"], "derived", "%s: what varied in %s" % (name, t["file"]),
                "%s, table %s: %d test rows. Varied between tests: %s. Held constant: %s." % (name, t["file"], p["n_rows"], varied or "nothing", const or "nothing"),
                "/evidence/%s" % acc, {"ledger_seq": t["ledger_seq"], "sha256": t["sha256"], "url": i["psi_url"]})
    for f in load("curator_report.json")["items"]:
        if f["in_scope"]:
            add("cur:%s" % f["id"], "derived", "Curator note %s on %s" % (f["id"], f["accession"]), "%s %s How the site handles it: %s" % (f["accession"] + ":", f["detail"], f["handling"]), "/data")
    for c in load("myths.json")["items"]:
        add("myth:%s" % c["id"], "derived", "Our reading: %s" % c["question"], "Misconception %d in NASA's guide: \"%s\" %s %s" % (c["n"], c["myth"], c["question"], c["answer"]), "/myths/%s" % c["id"])
        for gi, g in enumerate(c["groups"]):
            for ii, it in enumerate(g["items"]):
                cid = "myth:%s:%d:%d" % (c["id"], gi, ii)
                if it["kind"] == "quote" and it["quote_verified"]:
                    add(cid, "literature", "%s%s" % (it["source"], ", " + it["ref"]["loc"] if it["ref"].get("loc") else ""), "%s%s\"%s\"" % (g["title"] + ". ", (it["says"] + ": ") if it["says"] else "", it["quote"]),
                        "/myths/%s" % c["id"], it["ref"], it["ref"].get("loc"))
                elif it["kind"] in ("data", "model"):
                    add(cid, it["klass"], g["title"], it["text"], it.get("link") or ("/evidence/%s" % it["accession"] if it.get("accession") else "/myths/%s" % c["id"]))
    if os.path.exists(os.path.join(out_dir, "matrix.json")):
        mx = load("matrix.json")
        phase = {p["id"]: p["name"] for p in mx["phases"]}
        for c in mx["cells"]:
            said = " ".join(it["text"] for it in c["items"] if it["kind"] in ("data", "model", "reading"))
            add("mx:%s" % c["id"], "derived", "Our reading: fire behaviour matrix, %s" % c["name"].lower(),
                "Fire behaviour \"%s\" (phase: %s; pillar: %s). On the space station: %s. In a lunar habitat: %s. %s"
                % (c["name"], phase[c["phase"]].lower(), c["pillar"], mx["words"][c["iss"]], mx["words"][c["lunar"]], said), "/playbooks/%s" % c["id"])
        for s in mx["playbook"]:
            add("pb:%s" % s["id"], "derived", "Our reading: response step %d, %s" % (s["n"], s["step"].lower()),
                "Response step %d of %d in documented spacecraft fire responses: %s. Evidence on the space station: %s. In a lunar habitat: %s (evidence from %s). %s %s"
                % (s["n"], len(mx["playbook"]), s["step"], s["iss"], s["lunar"], s["lunar_basis"], s["why"], s["adds"] or ""), "/playbooks/step-%s" % s["id"])
    env, val = load("envelope.json"), load("validation.json") if os.path.exists(os.path.join(out_dir, "validation.json")) else None
    both = sum(1 for p in env["points"] if p["p"] is not None)
    add("env:summary", "derived", "Atmosphere map: where the tests are",
        "%d test rows in NASA's tables state oxygen, %d of them also pressure. %s. No solid-material row states pressure, and %s (near means %s)."
        % (len(env["points"]), both, "; ".join("%d rows lie near %s" % (n["n_near"], n["label"]) for n in env["near_presets"]), env["gravity_counts"]["note"].rstrip(".").lower() if False else "no row was taken in lunar or Martian gravity", env["near_rule"]),
        "/envelope")
    if os.path.exists(os.path.join(out_dir, "gaps.json")):
        gdoc = load("gaps.json")
        pc = lambda x: ("%.1f" % (100.0 * x)).rstrip("0").rstrip(".")
        cv = gdoc.get("coverage")
        if cv:
            add("cov:oxygen", "derived", "Gaps: where the tests sit, by oxygen",
                "Counted from NASA's tables: %s. No row of any kind states more than %s%% oxygen, and no row was taken in lunar or Martian gravity. "
                "%d of %d rows are placed; the others cannot be, because %s."
                % ("; ".join("%s, %d rows, state %s%% to %s%% oxygen" % (k["label"].lower(), k["rows"], pc(k["min"]), pc(k["max"])) for k in cv["kinds"] if k["rows"]),
                   pc(cv["top"]), cv["placed"], cv["total"], "; ".join("%s (%d rows)" % (x["why"], x["rows"]) for x in cv["not_placed"])), "/gaps")
        for g in gdoc["items"]:
            add("gap:%s" % g["id"], "derived", "Gap measured from NASA's tables: %s" % g["title"].lower(),
                "%s: %s %s. %s Planned or flown to fill it: %s." % (g["title"], g["measure"], g["unit"], g["why"], "; ".join(p["name"] for p in g["plans"])), "/gaps")
    if os.path.exists(os.path.join(out_dir, "droplets.json")):
        dr = load("droplets.json")
        if dr.get("n_usable"):
            add("drop:summary", "derived", "Droplet check: the d-squared law against NASA's FLEX columns",
                "In %d of the %d FLEX tests that state all four values, the d-squared law gives NASA's own burn time within 10%%: the initial diameter squared minus the extinction diameter squared, divided by the burning rate. "
                "The median of law over stated time is %.2f. %d of %d rows state all four values. %s The check is silent on what follows the visible flame and on any gravity but free fall."
                % (dr["within"]["10"], dr["n_usable"], dr["ratio"]["median"], dr["n_usable"], dr["n_rows"], dr["rate_unit"]["why"]), "/physics")
    if os.path.exists(os.path.join(out_dir, "reported.json")):
        rp = load("reported.json")
        lu, sf, fm = rp["luci"], rp["saffire"], rp["fm2"]
        rate = {r["id"]: r for r in lu["rows"]}
        add("rep:luci", "derived", "Reported by NASA, read from its slides: burning in simulated lunar gravity (LUCI)",
            "In lunar gravity simulated by spin, NASA's LUCI flight burned a fabric and an acrylic rod in 2025; nothing has been burned on the Moon itself, and no PSI table holds a row from lunar or Martian gravity. "
            "Flame spread measured in that simulated lunar gravity: the flame base on the fabric spread at %g mm/s against %g mm/s in the same test on Earth, its flame tip at %g against %g, "
            "and the flame tip on the acrylic rod at %g against %g. The rocket spun at %g rpm, which gives %g g at the experiment."
            % (rate["fabric_base"]["lunar"], rate["fabric_base"]["earth"], rate["fabric_tip"]["lunar"], rate["fabric_tip"]["earth"], rate["rod_tip"]["lunar"], rate["rod_tip"]["earth"],
               lu["spin"]["rpm"], lu["spin"]["g"]), "/gaps")
        add("rep:fm2", "derived", "Reported by NASA, read from its slides: the tests planned on the Moon (FM2)",
            "NASA plans %d burn tests of one fabric on the Moon in the FM2 experiment, each at %g psia, starting at %s%% oxygen. They would be the first flames observed on another world."
            % (len(fm["tests"]), fm["tests"][0]["p_psia"], ", ".join("%g" % t["o2_pct"] for t in fm["tests"])), "/gaps")
        add("rep:saffire", "derived", "Reported by NASA, read from its paper: large fires in a cargo vehicle (Saffire IV to VI)",
            "Outside PSI, NASA's paper on Saffire IV to VI reports solid materials burned at up to %g%% oxygen: five large burns in a cargo vehicle, at %s%% oxygen and %s kPa. "
            "Carbon monoxide at the far sensors rose by %s ppm and carbon dioxide by %s mmHg, against limits of %g ppm for 24 hours, %g ppm for one hour and %g mmHg. "
            "The highest temperature at the far sensors was %g °C. In the two-sided acrylic test the smoke reading reached an alarm threshold of %g mg/m3 at %g s on the test clock."
            % (max(r["o2_pct"] for r in sf["rows"]), ", ".join("%g" % r["o2_pct"] for r in sf["rows"]), ", ".join("%g" % r["p_kpa"] for r in sf["rows"]), ", ".join("%g" % r["co_ppm"] for r in sf["rows"]),
               ", ".join("%g" % r["co2_mmhg"] for r in sf["rows"]), sf["limits"]["co_24h_ppm"], sf["limits"]["co_1h_ppm"], sf["limits"]["co2_1h_mmhg"], max(r["t_far_c"] for r in sf["rows"]),
               sf["alarm"]["threshold_mg_m3"], sf["alarm"]["t_s"]), "/alarm")
        for group, items in rp["quotes"].items():
            for n, it in enumerate(items):
                if it["quote_verified"]:
                    add("rep:q:%s:%d" % (group, n), "literature", "%s%s" % (it["source"], ", " + it["ref"]["loc"] if it["ref"].get("loc") else ""),
                        "%s\"%s\"" % ((it["says"] + ": ") if it["says"] else "", it["quote"]), "/alarm" if group == "saffire" else "/gaps", it["ref"], it["ref"].get("loc"))
    if os.path.exists(os.path.join(out_dir, "recorded.json")):
        rc = load("recorded.json")
        sc, fl = rc["derived"]["scatter"], rc["derived"]["flame"]
        add("rec:saffire3", "derived", "Recorded aboard the Cygnus cargo vehicle: its smoke detector during the Saffire-III fire",
            "During the Saffire-III fire of 5 June 2017 the smoke detector of the Cygnus vehicle recorded a peak scatter reading of %g, against %g after a smoke wire with nothing burning (raw data of PSI-100). "
            "The reading was above %g for %g s during the fire and for %g s after the wire; before both it had stayed at or below %g for %d minutes. "
            "It peaked %g s after the igniter fired, and the radiometers were back at baseline at %g s. The file gives no units and no alarm level."
            % (sc["fire"]["peak"], sc["wire"]["peak"], round(sc["mark"], 2), sc["fire"]["above_mark_s"], sc["wire"]["above_mark_s"], sc["quiet"]["max"], sc["quiet"]["minutes"], sc["fire"]["peak_s"], fl["until_t"]), "/alarm")
    ipath = os.path.join(out_dir, "inventory.json")
    if os.path.exists(ipath):                                   # what the tables state, quantity by quantity: counted in inventory.py, only worded here
        ivd = json.load(open(ipath, encoding="utf-8"))
        of = ivd["counts"]["with_table"]
        who = lambda its: ", ".join(it["acronym"] or it["accession"] for it in its)
        for q in ivd["quantities"]:
            have = [it for it in ivd["items"] if q["id"] in it["cells"]]
            if not have:
                continue
            cols = sorted({c["name"] for it in have for c in it["cells"][q["id"]]["columns"]})
            add("inv:%s" % q["id"], "derived", "Which experimental tables state %s" % q["phrase"],
                "%d of the %d combustion records with an experimental table %s a column for %s: %s. The columns, as NASA wrote them: %s%s."
                % (len(have), of, "has" if len(have) == 1 else "have", q["about"], who(have), "; ".join(cols[:12]), " and %d more" % (len(cols) - 12) if len(cols) > 12 else ""), "/evidence/measured")
        fans = ["oxygen", "flow", "ending"]
        if not [it for it in ivd["items"] if all(q in it["cells"] for q in fans)]:
            t = ivd["totals"]
            add("inv:fans", "derived", "No experimental table holds all that a fans-off model needs",
                "No record's experimental table states oxygen, air flow and how the flame ended together: of the %d records with a table, %d state oxygen, %d state air flow and %d state the ending. "
                "A model of whether a flame goes out when the fans stop would need all three in one table."
                % (of, t["oxygen"]["records"], t["flow"]["records"], t["ending"]["records"]), "/evidence/measured")
        for w in ivd.get("flow_words", {}).get("tables", []):       # the same sentence as on the fans card, so an answer says it once
            add("inv:words:%s" % w["accession"], "derived", "How %s tests ended, in the words of the table's flow columns" % (w["acronym"] or w["accession"]), endings_sentence(w), "/evidence/measured")
        c = ivd["counts"]
        add("inv:raw", "derived", "Raw data that PSI lists behind the combustion records",
            "PSI lists %s raw data files, %.1f terabytes, behind the %d combustion records; this site fetched the experimental tables and the small files, not the video."
            % ("{:,}".format(c["raw_files"]), c["raw_bytes"] / 1e12, c["records"]), "/evidence/measured")
    if val:
        o = val["overall"]["closer_convention_per_table"]
        add("val:summary", "model", "Model check against NASA's Tad column",
            "The equilibrium flame-temperature model was compared with NASA's own Tad column in %d rows of %d tables (PSI-10 and PSI-159). Mean difference %.1f K, largest %.1f K. "
            "PSI-159's Tad matches a calculation at one atmosphere, not at the pressure of the test. %s" % (o["n"], len(val["tables"]), o["mean_abs"], o["max_abs"], val["limits"]), "/physics")
    if GUIDE in by_key:
        for u in lib.units(GUIDE) or []:
            body = re.sub(r"^\s*\d{1,3}\s*\n", "", u["text"])
            flat = re.sub(r"\s+", " ", body)
            if any(m in flat for m in (M1, M2)):
                # the guide lists these beliefs in order to reject them; a passage must never offer one as a finding
                for m in (M1, M2, M3, M3.replace("Because", "B ecause")):
                    flat = flat.replace(m, "[A misconception, in the guide's words: \"%s\"]" % m.replace("B ecause", "Because"))
                flat = re.sub(r"(?<=[:\]]) ?[123]\. (?=\[A misconception)", " ", flat)
                body = flat
            for n, p in enumerate(pieces(body)):
                marked = " (words in square brackets are ours)" if "[A misconception" in p else ""
                add("guide:pdf%d:%d" % (u["page_pdf"], n), "literature", "A Researcher's Guide to: Combustion Science, %s%s" % (u["loc"], marked), p, None, lib.ref(GUIDE, u), u["loc"])
    for key, title, link in PAGES:
        if key in by_key:
            for u in lib.units(key) or []:
                for n, p in enumerate(pieces(prose(u["text"]))):
                    add("%s:%d" % (key.replace("doc:", "page:"), n), "literature", title, p, link, lib.ref(key))
    for key, e in sorted(by_key.items()):
        if e.get("kind") == "ntrs_record":
            for u in lib.units(key) or []:
                if u.get("loc") == "abstract" and u["text"]:
                    for n, p in enumerate(pieces(u["text"])):
                        add("ntrs:%s:%d" % (e["ntrs_id"], n), "literature", "%s (NASA technical report %s, abstract)" % (u.get("title") or "NASA report", e["ntrs_id"]), p, None, lib.ref(key), "abstract")
    ids = [c["id"] for c in chunks]
    assert len(ids) == len(set(ids)), "duplicate passage id"
    for c in chunks:      # a belief NASA lists as a misconception may appear only where the passage says that it is one
        if any(m.rstrip(".") in c["x"] for m in (M1, M2)) and "misconception" not in c["x"].lower():
            raise ValueError("passage %s states a listed misconception without saying so" % c["id"])
    doc = {"klass": "derived", "note": "Passages for retrieval. Each keeps the class of what it holds: NASA data, NASA document, derived, model.", "count": len(chunks), "chunks": chunks}
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(os.path.join(out_dir, "index.json"), "wb") as fh:
        fh.write(b)
    ipath = os.path.join(out_dir, "ledger_index.json")
    index = json.load(open(ipath, encoding="utf-8"))
    index["used"] = sorted(L.READ | set(index.get("used", [])))
    ib = json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(ipath, "wb") as fh:
        fh.write(ib)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["index.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "derived"}
    manifest["artifacts"]["ledger_index.json"] = {"sha256": hashlib.sha256(ib).hexdigest(), "bytes": len(ib), "klass": "observed"}
    manifest["nasa"]["passages"] = len(chunks)
    manifest["nasa"]["files_read"] = len(index["used"])
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    kinds: dict[str, int] = {}
    for c in chunks:
        kinds[c["id"].split(":")[0]] = kinds.get(c["id"].split(":")[0], 0) + 1
    return {"passages": len(chunks), "bytes": len(b), "by_source": kinds}
