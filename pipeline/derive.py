#!/usr/bin/env python3
"""
Derive the site's artifacts from the raw NASA cache.

    python pipeline/derive.py --raw nasa_raw

Stops with an error if the ledger chain is broken or a file no longer matches its hash.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zgf import canonical, claims, derive_core, derive_evidence, falsify, index, lessons, rank, reconcile, validate

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser()
ap.add_argument("--raw", default=os.path.join(ROOT, "nasa_raw"))
ap.add_argument("--out", default=os.path.join(ROOT, "web", "public", "data", "v1"))
a = ap.parse_args()
res = derive_core.run(a.raw, a.out)
res["evidence"] = derive_evidence.run(a.out)
res["exports"] = canonical.build(a.out)
res["rank"] = rank.build(a.out)
res["claims"] = claims.build(a.raw, a.out)
res["falsify"] = falsify.build(a.raw, a.out)
res["lessons"] = lessons.build(a.raw, a.out)
res["index"] = index.build(a.raw, a.out)
res["research_area"] = reconcile.build(a.raw, a.out)
res["integrity"] = validate.check(a.out)          # raises, and so stops the build, if anything can no longer be traced
print(json.dumps(res, indent=1, default=str))
