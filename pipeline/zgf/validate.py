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

    for name in ("myths.json", "falsify.json", "lessons.json", "gaps.json"):
        if os.path.exists(os.path.join(out_dir, name)):
            walk(load(name))
    return {"checks": n, "ok": True}
