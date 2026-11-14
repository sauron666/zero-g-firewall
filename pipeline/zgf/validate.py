"""
The last step of every build. It fails the build when something on the site could no longer be traced:
a data file that differs from its hash in the manifest, a table without a ledger entry, a point of the
atmosphere map that names a row which does not exist, a quotation marked as checked without a receipt.
"""
from __future__ import annotations

import hashlib
import json
import os


class IntegrityError(RuntimeError):
    pass


def check(out_dir: str) -> dict:
    load = lambda name: json.load(open(os.path.join(out_dir, name), encoding="utf-8"))
    manifest = load("manifest.json")
    n = 0
    for name, a in manifest["artifacts"].items():
        path = os.path.join(out_dir, name)
        if not os.path.exists(path):
            raise IntegrityError("the manifest lists %s, which is not there" % name)
        if name not in ("manifest.json",) and hashlib.sha256(open(path, "rb").read()).hexdigest() != a["sha256"]:
            raise IntegrityError("%s differs from its hash in the manifest" % name)
        n += 1
    ledger = {}
    with open(os.path.join(out_dir, "ledger.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                e = json.loads(line)
                ledger[e["seq"]] = e["sha256"]
    tables = {}
    for t in load("tables/index.json")["items"]:
        if t.get("ledger_seq") not in ledger or ledger[t["ledger_seq"]] != t.get("sha256"):
            raise IntegrityError("table %s has no matching ledger entry" % t.get("file"))
        tables[t["artifact"]] = load(t["artifact"])["n_rows"]
        n += 1
    for i in load("investigations.json")["items"]:
        for field, ref in (i.get("refs") or {}).items():
            if ref.get("ledger_seq") not in ledger:
                raise IntegrityError("%s: field %s has no ledger entry" % (i.get("accession"), field))
            n += 1
    if os.path.exists(os.path.join(out_dir, "envelope.json")):
        for p in load("envelope.json")["points"]:
            if p["t"] not in tables or not (0 <= p["r"] < tables[p["t"]]):
                raise IntegrityError("a point of the atmosphere map names %s row %s, which does not exist" % (p["t"], p["r"]))
            n += 1

    def walk(o):
        nonlocal n
        if isinstance(o, dict):
            if o.get("kind") == "quote" and o.get("quote_verified"):
                if (o.get("ref") or {}).get("ledger_seq") not in ledger:
                    raise IntegrityError("a quotation marked as checked has no receipt: %s" % str(o.get("quote"))[:60])
                n += 1
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    for name in ("myths.json", "falsify.json", "lessons.json", "gaps.json", "matrix.json", "reported.json"):
        if os.path.exists(os.path.join(out_dir, name)):
            walk(load(name))
    if os.path.exists(os.path.join(out_dir, "matrix.json")):
        n += matrix(load("matrix.json"))
    if os.path.exists(os.path.join(out_dir, "droplets.json")):
        n += droplet(load("droplets.json"), tables)
    if os.path.exists(os.path.join(out_dir, "gaps.json")) and load("gaps.json").get("coverage"):
        n += cover(load("gaps.json")["coverage"], load("envelope.json"), sum(tables.values()))
    if os.path.exists(os.path.join(out_dir, "recorded.json")):
        n += recorded(load("recorded.json"), ledger)
    if os.path.exists(os.path.join(out_dir, "reported.json")):
        n += reported(load("reported.json"), ledger)
    if os.path.exists(os.path.join(out_dir, "inventory.json")):
        n += inventory(load("inventory.json"), ledger, load)
    if os.path.exists(os.path.join(out_dir, "envelope.json")):
        n += standing_sentences(load("envelope.json"))
    if os.path.exists(os.path.join(out_dir, "model", "atmospheres.json")):
        n += model_atmospheres(load("model/atmospheres.json"), load("reported.json") if os.path.exists(os.path.join(out_dir, "reported.json")) else None)
    return {"checks": n, "ok": True}


def inventory(d: dict, ledger: dict, load) -> int:
    """Every cell of the inventory names columns that exist in a stored table, under a pattern that matches the header,
    and every count beside the chart can be counted again from the cells."""
    import re
    pat = {q["id"]: re.compile(q["pattern"], re.I) for q in d["quantities"]}
    n = 0
    for it in d["items"]:
        heads = {}
        for t in it["tables"]:
            if ledger.get(t["ledger_seq"]) != t["sha256"]:
                raise IntegrityError("inventory: the table of %s has no matching ledger entry" % it["accession"])
            heads[t["artifact"]] = [" ".join(str(c).split()) for c in load(t["artifact"])["columns"]]      # as the profiles name a header: runs of spaces as one
        for q, cell in it["cells"].items():
            for c in cell["columns"]:
                if " ".join(c["name"].split()) not in heads.get(c["table"], []):
                    raise IntegrityError("inventory: %s names a column that is not in its table: %s" % (it["accession"], c["name"]))
                if not pat[q].search(c["name"].strip()):
                    raise IntegrityError("inventory: column '%s' sits under %s, whose pattern does not match it" % (c["name"], q))
                if not (0 < c["filled"] <= c["of"]):
                    raise IntegrityError("inventory: column '%s' of %s is counted in more rows than its table has, or in none" % (c["name"], it["accession"]))
                n += 1
    for q, tot in d["totals"].items():
        have = [it for it in d["items"] if q in it["cells"]]
        if tot["records"] != len(have) or tot["rows"] != sum(it["cells"][q]["rows"] for it in have):
            raise IntegrityError("inventory: the total for %s is not the sum of its cells" % q)
        n += 1
    c = d["counts"]
    if c["placed"] + c["set_aside"] + c["not_placed"] != c["columns"] or c["not_placed"] != len(d["not_placed"]):
        raise IntegrityError("inventory: placed, set aside and not placed do not add up to the columns read")
    for w in (d.get("flow_words") or {}).get("tables", []):
        # words about an ending are shown only as the table holds them: same row, same cell, and the word really there
        if ledger.get(w["ledger_seq"]) != w["sha256"]:
            raise IntegrityError("inventory: the table read for words in its flow columns has no matching ledger entry")
        t = load(w["table"])
        heads = [" ".join(str(h).split()) for h in t["columns"]]
        pats = {k["id"]: re.compile(k["pattern"], re.I) for k in w["classes"]}
        for x in w["rows"]:
            row = t["rows"][x["r"]]
            for name, text in x["cells"].items():
                if " ".join(row[heads.index(name)].split()) != text:
                    raise IntegrityError("inventory: a cell quoted from %s row %d is not what the table holds" % (w["accession"], x["r"] + 1))
            if not pats[x["class"]].search(" | ".join(x["cells"].values())):
                raise IntegrityError("inventory: row %d of %s is marked '%s', and its cells do not hold that word" % (x["r"] + 1, w["accession"], x["class"]))
            n += 1
        if sum(k["rows"] for k in w["classes"]) != len(w["rows"]) or len(w["rows"]) + w["silent"] != w["n_rows"] or w["n_rows"] != len(t["rows"]):
            raise IntegrityError("inventory: the rows read for words in %s do not add up to its table" % w["accession"])
        n += 1
    return n + 1


def recorded(d: dict, ledger: dict) -> int:
    """The recording may show only what its file holds: a receipt for the file, series of one length on one clock,
    and every number stated beside the chart found again in the series that the chart draws."""
    src = d["source"]
    if ledger.get(src.get("ledger_seq")) != src.get("sha256"):
        raise IntegrityError("the recording has no matching ledger entry")
    s = d["series"]
    t = s["t"]
    if any(b < a for a, b in zip(t, t[1:])) or any(len(x) != len(t) for x in s["radiometers"] + s["anemometers"]):
        raise IntegrityError("recording: the series are not on one clock")
    lo, hi = d["window"]["from_t"], d["window"]["to_t"]
    if not all(lo <= e["t"] <= hi for e in d["events"]) or not any(e["id"] == "S1" and e["t"] == 0 for e in d["events"]):
        raise IntegrityError("recording: an event lies outside the window, or the clock does not start at the ignition")
    sc, D = d["detector"]["scatter"], d["derived"]
    ev = {e["id"]: e["t"] for e in d["events"]}
    fire, wire = D["scatter"]["fire"], D["scatter"]["wire"]
    if max(v for ti, v in sc if ti >= 0) != fire["peak"] or max(v for ti, v in sc if ev["wire1"] <= ti < ev["S2"]) != wire["peak"]:
        raise IntegrityError("recording: a stated peak of the detector is not the highest reading drawn")
    if not any(ti == fire["peak_s"] and v == fire["peak"] for ti, v in sc):
        raise IntegrityError("recording: the stated time of the detector's peak is not a reading")
    for k, r in enumerate(D["radiometers"]):
        if max(v for ti, v in zip(t, s["radiometers"][k]) if ti >= 0) != r["peak"]:
            raise IntegrityError("recording: the stated peak of %s is not the highest reading drawn" % r["id"])
    if not (D["flame"]["from_t"] >= 0 and D["flame"]["until_t"] <= hi):
        raise IntegrityError("recording: the flame's stated span lies outside the window")
    return 5 + len(D["radiometers"])


def reported(d: dict, ledger: dict) -> int:
    """A reported number needs the document it was read from, and has to pass the cross-checks the build ran on it."""
    n = 0
    refs = [d["saffire"]["refs"][k] for k in d["saffire"]["refs"]] + [r["ref"] for r in d["luci"]["rows"]] + [d["luci"]["spin"]["ref"], d["fm2"]["ref"]]
    for r in refs:
        if ledger.get(r.get("ledger_seq")) != r.get("sha256") or not r.get("loc"):
            raise IntegrityError("a reported number has no document and page behind it")
        n += 1
    for name in ("saffire", "luci", "fm2", "atmospheres"):
        for c in d.get(name, {}).get("checks", []):
            if not c["ok"]:
                raise IntegrityError("reported: %s" % c["what"])
            n += 1
    for r in d["saffire"]["rows"]:
        if abs(r["co2_ppm"] * 1e-6 * r["p_kpa"] * 7.50062 - r["co2_mmhg"]) > 0.03 * r["co2_mmhg"]:
            raise IntegrityError("reported: carbon dioxide of %s does not agree in its two units" % r["id"])
    for r in d["luci"]["rows"]:
        if abs(r["lunar"] / r["earth"] - r["ratio"]) > 0.011:
            raise IntegrityError("reported: the ratio of %s does not follow from its two rates" % r["id"])
    for at in d.get("atmospheres", {}).get("items", []):
        r = at.get("ref")
        if r and (ledger.get(r.get("ledger_seq")) != r.get("sha256") or not at.get("words")):
            raise IntegrityError("the atmosphere %s has a receipt that leads to no stored sentence" % at["id"])
        n += 1
    return n + len(d["saffire"]["rows"]) + len(d["luci"]["rows"])


def standing_sentences(env: dict) -> int:
    """Some sentences of the site state a count of zero in words ("no row was taken in lunar or Martian gravity"). They may stand only while the count is zero."""
    partial = env["gravity_counts"]["partial"]
    if partial != 0:
        raise IntegrityError("sentences of the site say that no PSI row was taken in lunar or Martian gravity; the tables now hold %d" % partial)
    with_p = [s["id"] for s in env["series"] if s["kind"] == "solid" and s["n_with_pressure"]]
    if with_p:
        raise IntegrityError("sentences of the site say that the solid-fuel tables record no pressure; these series now do: %s" % ", ".join(with_p))
    return 2


def model_atmospheres(m: dict, d: dict | None) -> int:
    """The flame-temperature model may only be run at the atmospheres on the checked list, with the same numbers."""
    from .atmospheres import ATMOSPHERES, p_kpa
    built = {a["id"]: a for a in m["presets"] + m["historical"]}
    if set(built) != {a["id"] for a in ATMOSPHERES}:
        raise IntegrityError("the model was built for other atmospheres than the checked list: %s" % ", ".join(sorted(set(built) ^ {a["id"] for a in ATMOSPHERES})))
    for a in ATMOSPHERES:
        b = built[a["id"]]
        if abs(b["x_o2"] - a["x_o2"]) > 1e-9 or abs(b["p_psia"] - a["p_psia"]) > 1e-9 or abs(b["p_kpa"] - round(p_kpa(a), 2)) > 0.006:
            raise IntegrityError("the model's atmosphere %s differs from the checked list" % a["id"])
    if d:
        for at in d.get("atmospheres", {}).get("items", []):
            b = built.get(at["id"])
            if not b or abs(100 * b["x_o2"] - at["o2_pct"]) > 1e-6 or abs(b["p_psia"] - at["p_psia"]) > 1e-9:
                raise IntegrityError("the model's atmosphere %s differs from the one NASA's sentence states" % at["id"])
    return len(ATMOSPHERES)


def cover(c: dict, env: dict, rows_in_all_tables: int) -> int:
    """The coverage chart may not lose or invent a row: its squares add up to the points of the atmosphere map,
    placed and not placed add up to the tables, and the partial-gravity block shows what the map counted."""
    in_cells = sum(x["n"] for k in c["cells"].values() for x in k.values())
    if in_cells != len(env["points"]) or c["placed"] != in_cells:
        raise IntegrityError("the coverage chart holds %d rows, the atmosphere map %d" % (in_cells, len(env["points"])))
    if c["placed"] + sum(x["rows"] for x in c["not_placed"]) != c["total"] or c["total"] > rows_in_all_tables:
        raise IntegrityError("coverage: placed and not placed do not add up to the rows of the tables")
    for k in c["cells"].values():
        for x in k.values():
            if sum(x["records"].values()) != x["n"]:
                raise IntegrityError("coverage: a square counts more rows than its records hold")
    partial = [r for r in c["regimes"] if r["id"] == "partial"]
    if not partial or partial[0]["rows"] != env["gravity_counts"]["partial"]:
        raise IntegrityError("coverage: the partial-gravity block does not match the count on the atmosphere map")
    return 4


def matrix(mx: dict) -> int:
    """The matrix may not claim more than its evidence: a behaviour marked as measured needs a measurement or a checked
    quotation behind it, and a playbook step needs a checked quotation, because steps are documented, never invented."""
    n = 0
    phases, states = {p["id"] for p in mx["phases"]}, set(mx["words"])
    solid = lambda it: (it["kind"] == "quote" and it.get("quote_verified")) or (it["kind"] == "data" and it.get("klass") in ("observed", "derived"))
    ids = set()
    for c in mx["cells"]:
        if c["phase"] not in phases or c["pillar"] not in mx["pillars"] or c["iss"] not in states or c["lunar"] not in states:
            raise IntegrityError("matrix behaviour %s has an unknown phase, pillar or coverage state" % c["id"])
        if not c["items"]:
            raise IntegrityError("matrix behaviour %s has nothing behind it" % c["id"])
        if "evidence" in (c["iss"], c["lunar"]) and not any(solid(it) for it in c["items"]):
            raise IntegrityError("matrix behaviour %s is marked as measured but shows no measurement and no checked quotation" % c["id"])
        ids.add(c["id"])
        n += 1
    for s in mx["playbook"]:
        if not any(it["kind"] == "quote" and it.get("quote_verified") for it in s["documented"]):
            raise IntegrityError("playbook step %s has no checked quotation behind it" % s["id"])
        if any(c not in ids for c in s["cells"]):
            raise IntegrityError("playbook step %s names a behaviour that is not in the matrix" % s["id"])
        if s["lunar"] == "supported":
            raise IntegrityError("playbook step %s is marked as supported in lunar gravity, where no measurement exists" % s["id"])
        n += 1
    return n


def droplet(d: dict, tables: dict) -> int:
    """Every point of the droplet check names a row of NASA's table, and its d-squared time follows from the cells shown."""
    rows = tables.get(d["source"]["artifact"])
    if rows is None:
        raise IntegrityError("the droplet check names a table that is not in the build")
    n = 0
    for p in d["points"]:
        if not (0 <= p["r"] < rows):
            raise IntegrityError("the droplet check names row %s, which does not exist" % p["r"])
        if "td" in p and abs((p["d0"] ** 2 - p["de"] ** 2) / p["k"] - p["td"]) > 0.001:
            raise IntegrityError("droplet row %s: the d-squared time does not follow from its cells" % p["r"])
        n += 1
    if sum(1 for p in d["points"] if "td" in p) != d["n_usable"] or d["n_usable"] + sum(x["rows"] for x in d["not_usable"]) != d["n_rows"]:
        raise IntegrityError("the droplet check's counts do not add up")
    return n
