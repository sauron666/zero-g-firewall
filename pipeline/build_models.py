#!/usr/bin/env python3
"""Build the model artifacts and the golden vectors for the browser solver."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zgf import models, BRAND, TEAM, MASCOT, SCHEMA
import datetime as dt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "data", "v1")
index = models.build(OUT, os.path.join(ROOT, "web", "src", "physics", "golden", "transport.json"))
mpath = os.path.join(OUT, "manifest.json")
manifest = json.load(open(mpath)) if os.path.exists(mpath) else {"schema": SCHEMA, "nasa": None, "artifacts": {}}
manifest.update({"schema": SCHEMA, "brand": BRAND, "team": TEAM, "mascot": MASCOT,
                 "built_at_utc": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")})
manifest.setdefault("nasa", None)
manifest.setdefault("artifacts", {}).update(index)
json.dump(manifest, open(mpath, "w"), indent=1)
print("built:", ", ".join(index))
