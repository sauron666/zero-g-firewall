#!/usr/bin/env python3
"""
Derive the site's artifacts from the raw NASA cache.

    python pipeline/derive.py --raw nasa_raw

Stops with an error if the ledger chain is broken or a file no longer matches its hash.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zgf import briefs, canonical, claims, derive_core, derive_evidence, droplets, falsify, index, inventory, lessons, matrix, rank, reconcile, recorded, reported, validate

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--raw", default=os.path.join(ROOT, "nasa_raw"))
ap.add_argument("--out", default=os.path.join(ROOT, "web", "public", "data", "v1"))
a = ap.parse_args()
res = derive_core.run(a.raw, a.out)
res["evidence"] = derive_evidence.run(a.out)
res["exports"] = canonical.build(a.out)
res["rank"] = rank.build(a.out)
res["inventory"] = inventory.build(a.out)          # what each table states, quantity by quantity, and what PSI lists as files
res["recorded"] = recorded.build(a.raw, a.out)      # one raw data file: a fire as the vehicle's own sensors recorded it
res["reported"] = reported.build(a.raw, a.out)      # numbers NASA reported outside PSI, read from the stored documents
res["claims"] = claims.build(a.raw, a.out)
res["falsify"] = falsify.build(a.raw, a.out)
res["lessons"] = lessons.build(a.raw, a.out)
res["matrix"] = matrix.build(a.raw, a.out)
res["briefs"] = briefs.build(a.out)
res["droplets"] = droplets.build(a.out)
res["index"] = index.build(a.raw, a.out)
res["research_area"] = reconcile.build(a.raw, a.out)
res["integrity"] = validate.check(a.out)          # raises, and so stops the build, if anything can no longer be traced
print(json.dumps(res, indent=1, default=str))
