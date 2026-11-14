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
    env, val = load("envelope.json"), load("validation.json") if os.path.exists(os.path.join(out_dir, "validation.json")) else None
    both = sum(1 for p in env["points"] if p["p"] is not None)
    add("env:summary", "derived", "Atmosphere map: where the tests are",
        "%d test rows in NASA's tables state oxygen, %d of them also pressure. %s. No solid-material row states pressure, and %s (near means %s)."
        % (len(env["points"]), both, "; ".join("%d rows lie near %s" % (n["n_near"], n["label"]) for n in env["near_presets"]), env["gravity_counts"]["note"].rstrip(".").lower() if False else "no row was taken in lunar or Martian gravity", env["near_rule"]),
        "/envelope")
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
