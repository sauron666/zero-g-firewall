"""
The literature layer: text of the NASA documents in the ledger, addressed by page or section,
and a check that every quotation the site shows is really in the stored document.

A quotation that is not found is never shown in quotation marks. It is kept as a labelled
paraphrase with quote_verified false, and the build prints it.
"""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser

from . import ledger as L

_SKIP = {"script", "style", "noscript", "svg", "nav", "header", "footer", "button", "aside", "iframe", "select", "option"}   # not "form": some NASA sites wrap the whole page in one
_BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "br", "tr", "section", "article", "figcaption", "blockquote", "td"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP:
            self.skip += 1
        elif tag in _BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP and self.skip:
            self.skip -= 1
        elif tag in _BLOCK:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_text(b: bytes) -> str:
    p = _Text()
    p.feed(b.decode("utf-8", errors="replace"))
    text = "".join(p.out)
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t\r\f\v]+", " ", text)).strip()


def norm(s: str) -> str:
    """Comparison form: straight quotes, plain hyphens, no line-end hyphenation, single spaces, lower case."""
    for a, b in (("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'), ("–", "-"), ("—", "-"), ("−", "-"),
                 ("ﬁ", "fi"), ("ﬂ", "fl"), ("­", ""), (" ", " ")):
        s = s.replace(a, b)
    s = re.sub(r"-\s*\n\s*", "", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def units(raw_dir: str, entry: dict) -> list[dict]:
    """The document as addressable units: one per PDF page, or one for a web page, an abstract or a text file."""
    b = L.read(raw_dir, entry)
    ctype = str(entry.get("content_type", "")).split(";")[0].strip().lower()
    if ctype == "application/pdf" or b[:5] == b"%PDF-":
        import io
        import pypdf
        out = []
        for i, page in enumerate(pypdf.PdfReader(io.BytesIO(b)).pages):
            text = page.extract_text() or ""
            m = re.match(r"\s*(\d{1,3})\s*\n", text)
            out.append({"loc": "p. %s" % (m.group(1) if m else i + 1), "page_pdf": i + 1, "page": int(m.group(1)) if m else None, "text": text})
        return out
    if ctype == "application/json":
        d = json.loads(b.decode("utf-8"))
        if isinstance(d, dict) and "abstract" in d:
            return [{"loc": "abstract", "text": d.get("abstract") or "", "title": d.get("title")}]
        return [{"loc": "record", "text": json.dumps(d, ensure_ascii=False)}]
    if ctype.startswith("text/html"):
        return [{"loc": "page text", "text": html_text(b)}]
    return [{"loc": "full text", "text": b.decode("utf-8", errors="replace")}]


class Library:
    """Documents by ledger key, loaded on demand; every read is hash-checked by the ledger."""

    def __init__(self, raw_dir: str, by_key: dict[str, dict]):
        self.raw_dir, self.by_key, self._cache = raw_dir, by_key, {}

    def units(self, key: str) -> list[dict] | None:
        if key not in self._cache:
            e = self.by_key.get(key)
            self._cache[key] = units(self.raw_dir, e) if e else None
        return self._cache[key]

    def find(self, key: str, quote: str) -> dict | None:
        """Where a quotation sits in a stored document. Looks inside each unit, then across two adjacent pages."""
        us = self.units(key)
        if not us:
            return None
        q = norm(quote)
        texts = [norm(u["text"]) for u in us]
        for u, t in zip(us, texts):
            if q in t:
                return {k: v for k, v in u.items() if k != "text"}
        for i in range(len(us) - 1):
            if q in texts[i] + " " + texts[i + 1]:
                a, b = us[i], us[i + 1]
                return {"loc": "%s to %s" % (a["loc"], b["loc"].replace("p. ", "")), "page": a.get("page"), "page_pdf": a.get("page_pdf")}
        tight = q.replace(" ", "")              # text taken from a PDF sometimes splits a word ("B ecause"); same characters, same order
        for u, t in zip(us, texts):
            if tight in t.replace(" ", ""):
                return {**{k: v for k, v in u.items() if k != "text"}, "match": "ignoring spaces"}
        return None

    def sentences(self, key: str, pattern: str, limit: int = 6) -> list[tuple[str, str]]:
        """Sentences matching a pattern, with their location. A tool for people choosing what to quote."""
        out = []
        for u in self.units(key) or []:
            t = re.sub(r"\s+", " ", re.sub(r"-\s*\n\s*", "", u["text"]))
            for s in re.split(r"(?<=[.!?])\s+(?=[A-Z(\"“])", t):
                if re.search(pattern, s, re.I) and 30 < len(s) < 600:
                    out.append((u["loc"], s.strip()))
        return out[:limit]

    def ref(self, key: str, where: dict | None = None) -> dict:
        r = L.ref(self.by_key[key], kind="document")
        if where:
            r.update({k: v for k, v in where.items() if k in ("loc", "page", "page_pdf", "match") and v is not None})
        return r
