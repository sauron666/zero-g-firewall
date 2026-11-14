#!/usr/bin/env python3
"""Update docs/COVERAGE.md: python tools/cov.py "E02=done:note text" "H01=partial:what is missing" ...  (recounts the summary)."""
import re, subprocess, sys
p = "docs/COVERAGE.md"
lines = open(p, encoding="utf-8").read().split("\n")
for arg in sys.argv[1:]:
    fid, rest = arg.split("=", 1)
    state, _, note = rest.partition(":")
    for i, ln in enumerate(lines):
        m = re.match(r"^\| %s \| (P\d) \| [^|]* \| ([^|]*) \| [^|]* \|$" % re.escape(fid), ln)
        if m:
            lines[i] = "| %s | %s | %s | %s | %s |" % (fid, m.group(1), state if state == "done" else "**%s**" % state, m.group(2).strip(), note)
            break
    else:
        raise SystemExit("no row for " + fid)
count = {}
for ln in lines:
    m = re.match(r"^\| [A-N]\d+ \| (P\d) \| \**(done|partial|not built)\**", ln)
    if m:
        count.setdefault(m.group(1), {"done": 0, "partial": 0, "not built": 0})[m.group(2)] += 1
for i, ln in enumerate(lines):
    m = re.match(r"^\| (P\d|All) \| \d+ \|", ln)
    if m:
        c = count[m.group(1)] if m.group(1) != "All" else {k: sum(v[k] for v in count.values()) for k in ("done", "partial", "not built")}
        lines[i] = "| %s | %d | %d | %d | %d |" % (m.group(1), sum(c.values()), c["done"], c["partial"], c["not built"])
    if ln.startswith("Checked on 14 November 2026 at"):
        now = subprocess.check_output(["date", "+%d %B %Y at %H:%M"]).decode().strip()
        lines[i] = re.sub(r"Checked on .*? Sofia time", "Checked on %s Sofia time" % now, ln)
open(p, "w", encoding="utf-8").write("\n".join(lines))
print({k: v for k, v in count.items()})
