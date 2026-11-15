"""
Sign a release of the site's data (K03).

    python tools/release/sign_release.py [--key ~/.zgf/release_ed25519.pem] [--new-key] [--out web/public/data/v1]

What is signed: release/release.json, the canonical release manifest. It lists every artifact of manifest.json and
manifest.json itself, each with the SHA-256 of its bytes as they are on disk now (re-hashed here, not copied).
Canonicalisation: JSON with sorted keys, separators "," and ":", UTF-8, no trailing newline. The signature is
Ed25519 over exactly those bytes, stored base64 in release/release.sig. The public key (raw 32 bytes, base64), its
key ID (first 16 hex digits of SHA-256 of the raw key) and the trust model go to release/pubkey.json.

The private key never enters the repository: it is read from --key (default ~/.zgf/release_ed25519.pem, outside the
repo) and the script refuses a key path inside the repository. The public key vouches for a release of this project,
under the trust model written in pubkey.json. It is not a NASA signature and says nothing about the truth of a measurement.
"""
from __future__ import annotations

import argparse
import base64
import datetime
import hashlib
import json
import os
import sys

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def build_release(out_dir: str, built_at: str | None = None) -> dict:
    manifest_path = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8"))
    items = []
    for name in sorted(list(manifest["artifacts"]) + ["manifest.json"]):
        b = open(os.path.join(out_dir, name), "rb").read()
        h = hashlib.sha256(b).hexdigest()
        if name != "manifest.json" and h != manifest["artifacts"][name]["sha256"]:
            raise SystemExit("%s differs from its hash in the manifest; run the validation first" % name)
        items.append({"path": name, "sha256": h, "bytes": len(b)})
    return {"schema": "zgf-release/1", "project": manifest.get("brand", "Zero-G Firewall"), "team": manifest.get("team"),
            "built_at_utc": built_at or datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "data_root": "data/v1/", "ledger_head": (manifest.get("nasa") or {}).get("ledger_head"),
            "canonicalization": "JSON, keys sorted, separators ',' and ':', UTF-8, no trailing newline",
            "artifacts": items}


def key_id(pub: Ed25519PublicKey) -> str:
    raw = pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return hashlib.sha256(raw).hexdigest()[:16]


def verify(out_dir: str) -> list[str]:
    """Re-check a release on disk: signature over release.json, then every artifact's bytes. Returns problems."""
    rel_dir = os.path.join(out_dir, "release")
    body = open(os.path.join(rel_dir, "release.json"), "rb").read()
    sig = base64.b64decode(open(os.path.join(rel_dir, "release.sig"), encoding="ascii").read().strip())
    pk = json.load(open(os.path.join(rel_dir, "pubkey.json"), encoding="utf-8"))
    pub = Ed25519PublicKey.from_public_bytes(base64.b64decode(pk["public_key_raw_b64"]))
    problems = []
    try:
        pub.verify(sig, body)
    except Exception:
        problems.append("signature does not verify over release.json")
    if key_id(pub) != pk["key_id"]:
        problems.append("key ID does not match the public key")
    rel = json.loads(body)
    if canonical(rel) != body:
        problems.append("release.json is not in canonical form")
    for it in rel["artifacts"]:
        p = os.path.join(out_dir, it["path"])
        if not os.path.exists(p):
            problems.append("missing: " + it["path"])
        elif hashlib.sha256(open(p, "rb").read()).hexdigest() != it["sha256"]:
            problems.append("changed: " + it["path"])
    return problems


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=os.path.expanduser("~/.zgf/release_ed25519.pem"))
    ap.add_argument("--new-key", action="store_true")
    ap.add_argument("--out", default=os.path.join(ROOT, "web", "public", "data", "v1"))
    ap.add_argument("--verify-only", action="store_true")
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    if a.verify_only:
        pr = verify(out)
        print(json.dumps({"ok": not pr, "problems": pr}))
        return 1 if pr else 0
    key_path = os.path.abspath(a.key)
    if key_path.startswith(ROOT + os.sep):
        print("refusing a private key inside the repository: %s" % key_path, file=sys.stderr)
        return 2
    if a.new_key or not os.path.exists(key_path):
        os.makedirs(os.path.dirname(key_path), exist_ok=True)
        k = Ed25519PrivateKey.generate()
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    k = serialization.load_pem_private_key(open(key_path, "rb").read(), password=None)
    pub = k.public_key()
    rel = build_release(out)
    body = canonical(rel)
    rel_dir = os.path.join(out, "release")
    os.makedirs(rel_dir, exist_ok=True)
    open(os.path.join(rel_dir, "release.json"), "wb").write(body)
    open(os.path.join(rel_dir, "release.sig"), "w", encoding="ascii").write(base64.b64encode(k.sign(body)).decode())
    raw = pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    json.dump({"alg": "Ed25519", "key_id": key_id(pub), "public_key_raw_b64": base64.b64encode(raw).decode(),
               "signs": "release/release.json, byte for byte",
               "trust_model": "This key is held by the Zero-G Firewall team, outside the repository. A valid signature shows that the listed files are the ones this team released. It is not a NASA signature and does not show that any measurement is true."},
              open(os.path.join(rel_dir, "pubkey.json"), "w", encoding="utf-8"), indent=1)
    pr = verify(out)
    print(json.dumps({"artifacts": len(rel["artifacts"]), "key_id": key_id(pub), "verified": not pr, "problems": pr}))
    return 1 if pr else 0


if __name__ == "__main__":
    raise SystemExit(main())
