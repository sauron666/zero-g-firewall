"""
The evidence ledger written by sync_nasa.py: one JSON line per file fetched from NASA,
chained by hash. Nothing in the NASA namespace may be derived from a file that is not here.
"""
from __future__ import annotations

import hashlib
import json
import os


class LedgerError(RuntimeError):
    pass


def sha256(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def load(raw_dir: str) -> list[dict]:
    path = os.path.join(raw_dir, "ledger", "ledger.jsonl")
    if not os.path.exists(path):
        raise LedgerError("no ledger at %s; run pipeline/sync_nasa.py first" % path)
    with open(path, encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def verify_chain(entries: list[dict]) -> None:
    """Raises LedgerError at the first entry whose hash or link does not hold."""
    prev = "0" * 64
    for e in entries:
        body = {k: v for k, v in e.items() if k != "entry_hash"}
        if body.get("prev_hash") != prev:
            raise LedgerError("ledger chain broken before entry %s" % e.get("seq"))
        s = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        if sha256((prev + s).encode("utf-8")) != e.get("entry_hash"):
            raise LedgerError("ledger entry %s was altered" % e.get("seq"))
        prev = e["entry_hash"]


def latest(entries: list[dict]) -> dict[str, dict]:
    """Newest entry per key (a refreshed file supersedes the older fetch; both stay in the chain)."""
    return {e["key"]: e for e in entries}


def read(raw_dir: str, entry: dict) -> bytes:
    """Bytes of a stored file, checked against the hash recorded when it was fetched."""
    path = os.path.join(raw_dir, entry["local_path"])
    if not os.path.exists(path):
        raise LedgerError("file missing from the raw cache: %s" % entry["local_path"])
    with open(path, "rb") as fh:
        b = fh.read()
    if sha256(b) != entry["sha256"]:
        raise LedgerError("file differs from its ledger entry: %s" % entry["local_path"])
    return b


PUBLIC_FIELDS = ("seq", "kind", "url", "sha256", "size", "content_type", "http_date", "last_modified",
                 "retrieved_at_utc", "accession", "file_name", "role", "psi_file_version", "psi_study_version",
                 "doi", "resource_id", "doc_id", "ntrs_id", "term", "entry_hash", "prev_hash")


def public_view(entries: list[dict]) -> list[dict]:
    """What the site shows on the ledger page and in receipts."""
    return [{k: e[k] for k in PUBLIC_FIELDS if k in e and e[k] not in ("", None)} for e in entries]


def ref(entry: dict, **extra) -> dict:
    """A source reference that a field, a row or a sentence carries to its receipt."""
    r = {"ledger_seq": entry["seq"], "sha256": entry["sha256"], "url": entry["url"]}
    for k in ("accession", "file_name", "doc_id", "ntrs_id"):
        if entry.get(k):
            r[k] = entry[k]
    r.update(extra)
    return r
