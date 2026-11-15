"""
Train and check the FLEX burning-rate regressor in one command:

    PYTHONPATH=pipeline python pipeline/train_flex.py            # writes web/public/data/v1/ml/*.json and docs/MODEL_CARD_FLEX.md

Reads the FLEX table artifact that the derivation wrote from NASA's file, after checking it against the manifest
and the ledger (so no edited copy can be trained on), and adds the two ML artifacts to the manifest with their hashes.
Pinned versions: pipeline/requirements-ml.txt.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from zgf import ml_flex  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "web", "public", "data", "v1"))
    ap.add_argument("--card", default=os.path.join(os.path.dirname(__file__), "..", "docs", "MODEL_CARD_FLEX.md"))
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    load = lambda n: json.load(open(os.path.join(out, n), encoding="utf-8"))
    manifest = load("manifest.json")
    meta = [t for t in load("tables/index.json")["items"] if t["accession"] == ml_flex.ACC]
    if not meta:
        print("no FLEX table in this build", file=sys.stderr)
        return 2
    meta = meta[0]
    path = os.path.join(out, meta["artifact"])
    raw = open(path, "rb").read()
    if hashlib.sha256(raw).hexdigest() != manifest["artifacts"][meta["artifact"]]["sha256"]:
        print("the FLEX artifact differs from its hash in the manifest", file=sys.stderr)
        return 3
    ledger = {}
    for line in open(os.path.join(out, "ledger.jsonl"), encoding="utf-8"):
        if line.strip():
            e = json.loads(line)
            ledger[e["seq"]] = e["sha256"]
    if ledger.get(meta["ledger_seq"]) != meta["sha256"]:
        print("the FLEX table has no matching ledger entry", file=sys.stderr)
        return 4
    mdoc, edoc = ml_flex.build(json.loads(raw), meta)
    os.makedirs(os.path.join(out, "ml"), exist_ok=True)
    for name, doc in (("ml/flex_k_model.json", mdoc), ("ml/flex_k_eval.json", edoc)):
        b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        open(os.path.join(out, name), "wb").write(b)
        manifest["artifacts"][name] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "model"}
    manifest.setdefault("ml", {})["flex_k"] = {"model_id": mdoc["model_id"], "dataset_sha256": mdoc["dataset_sha256"], "rows": edoc["n_rows"], "groups": edoc["n_groups"],
                                             "mae_selected": edoc["metrics"]["selected"]["mae"], "mae_fuel_median": edoc["metrics"]["fuel_median"]["mae"]}
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    card = ml_flex.model_card(mdoc, edoc)
    open(a.card, "w", encoding="utf-8").write(card)
    cb = card.encode("utf-8")
    open(os.path.join(out, "ml", "MODEL_CARD_FLEX.md"), "wb").write(cb)
    manifest["artifacts"]["ml/MODEL_CARD_FLEX.md"] = {"sha256": hashlib.sha256(cb).hexdigest(), "bytes": len(cb), "klass": "model"}
    with open(os.path.join(out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    m = edoc["metrics"]
    print(json.dumps({"model_id": mdoc["model_id"], "rows": edoc["n_rows"], "groups": edoc["n_groups"], "folds": edoc["n_folds"], "winner": edoc["winner"],
                      "mae": {k: m[k]["mae"] for k in m}, "r2": {k: m[k]["r2"] for k in m}}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
