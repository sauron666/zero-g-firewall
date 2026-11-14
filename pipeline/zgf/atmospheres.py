"""
The cabin atmospheres the site marks on its charts and counts tests near.

Each is a pair of numbers (oxygen fraction, total pressure) that a model or a count takes as an
input, so it is written here once and every other module reads it from here. It is not taken on
trust: `stated()` finds, in a stored NASA document, the sentence that gives the same pair, and the
derivation stops if the sentence is gone or gives other numbers. An atmosphere with no such
sentence in the ledger is not on this list.

Standard library only, so the model builder can import it before the NASA sync.
"""
from __future__ import annotations

import re

PSI_TO_KPA = 6.894757
ATM_KPA = 101.325

OLSON = "ntrs:text:20130010991:20130010991.txt"
SLIDES = "ntrs:text:20260001966:Ferkul-Lunar and Planetary Science Conf 2026 v2.pdf.txt"
BOARD = "doc:apollo_204_review_board_summary"

# `pattern` must match the stored text of `doc`; its groups o2 (percent) and p (psia) must equal the pair written here.
# `rounded`: NASA's sentence gives the pair to fewer digits than the standard value used by the model.
# `pure`: the sentence says "pure oxygen" in words and gives only the pressure.
ATMOSPHERES = [
    {"id": "iss", "kind": "habitat", "label": "ISS cabin", "name": "Sea level and ISS cabin", "x_o2": 0.2095, "p_psia": 14.696,
     "doc": OLSON, "pattern": r"normal sea-level conditions \(air, (?P<o2>\d+)% oxygen and \d+% nitrogen by volume at (?P<p>[\d.]+) psia total pressure\)",
     "rounded": True, "short": "Olson and Ferkul, NTRS 20130010991",
     "note": "Standard sea-level air, 20.95% oxygen at 14.696 psia. NASA's sentence gives it as 21% at 14.7 psia."},
    {"id": "challenge_limit", "kind": "habitat", "label": "30% oxygen at 10.2 psia", "name": "Before a spacewalk", "x_o2": 0.30, "p_psia": 10.2,
     "doc": OLSON, "pattern": r"currently (?P<o2>\d+)% oxygen at (?P<p>[\d.]+) psia which is the pre-breath environment on the ISS for spacewalks",
     "also": (SLIDES, r"historically been (?P<o2>\d+)% O2, (?P<p>[\d.]+) psia \(shuttle pre-EVA atm\)"), "short": "Olson and Ferkul, NTRS 20130010991",
     "note": "On the normoxic curve, and the worst case NASA's flammability test has been run at. The challenge statement names 30% oxygen or more at 10.2 psi or less for lunar habitats."},
    {"id": "exploration", "kind": "habitat", "label": "34% oxygen at 8.2 psia", "name": "Lunar habitat, lander and rover", "x_o2": 0.34, "p_psia": 8.2,
     "doc": SLIDES, "pattern": r"HLS, Lunar habitat and pressurized rover will nominally use (?P<p>[\d.]+) psia / (?P<o2>\d+)% O2", "short": "Ferkul et al., slides, NTRS 20260001966",
     "band": r"Control bands are expected to allow up to (?P<o2>\d+)%", "note": "Nominal value."},
    {"id": "suit", "kind": "habitat", "label": "Suit, pure oxygen at 4.3 psia", "name": "Spacesuit", "x_o2": 1.0, "p_psia": 4.3,
     "doc": SLIDES, "pattern": r"(?P<o2>\d+)% O2, (?P<p>[\d.]+) psia \(to bend fingers, arms\)", "short": "Ferkul et al., slides, NTRS 20260001966", "note": ""},
    {"id": "apollo_pad", "kind": "historical", "label": "Pure oxygen at 16.7 psi", "name": "Pure oxygen at 16.7 psi, as NASA tested spacecraft before the Apollo 1 fire", "x_o2": 1.0, "p_psia": 16.7,
     "doc": BOARD, "pattern": r"testing and launching space vehicles with pure oxygen environments at (?P<p>[\d.]+) p\.s\.i\.", "pure": True, "short": "Apollo 204 Review Board summary",
     "note": "The pressure is quoted from the Review Board page, the only stored page that states it."},
]
BY_ID = {a["id"]: a for a in ATMOSPHERES}


def p_kpa(a: dict) -> float:
    """Total pressure in kPa; sea level is the standard atmosphere, not 14.696 psia converted."""
    return ATM_KPA if a["p_psia"] == 14.696 else round(a["p_psia"] * PSI_TO_KPA, 2)


def habitat() -> list[tuple[str, str, float, float]]:
    """(id, label, oxygen fraction, kPa) of the atmospheres a crew breathes: what the map counts tests near."""
    return [(a["id"], a["label"], a["x_o2"], p_kpa(a)) for a in ATMOSPHERES if a["kind"] == "habitat"]


def words(aid: str) -> str:
    """The pair in words, as sentences of the site name it: '30% oxygen at 10.2 psia', 'pure oxygen at 4.3 psia'."""
    a = BY_ID[aid]
    return ("pure oxygen at %g psia" % a["p_psia"]) if a["x_o2"] == 1.0 else "%g%% oxygen at %g psia" % (100 * a["x_o2"], a["p_psia"])


def short(aid: str) -> str:
    """'34% at 8.2 psia', for the second atmosphere of a sentence that has already said 'oxygen'."""
    a = BY_ID[aid]
    return "%g%% at %g psia" % (100 * a["x_o2"], a["p_psia"])


def pct(aid: str) -> str:
    return "%g%%" % (100 * BY_ID[aid]["x_o2"])


def lens(aid: str, label: str | None = None) -> list:
    a = BY_ID[aid]
    return [label or a["label"], a["x_o2"], p_kpa(a)]


def _agrees(a: dict, m: re.Match) -> bool:
    d = m.groupdict()
    p = float(d["p"])
    o2 = 100.0 if a.get("pure") else float(d["o2"])
    if a.get("rounded"):
        return round(100 * a["x_o2"]) == o2 and round(a["p_psia"], 1) == p
    return abs(100 * a["x_o2"] - o2) < 1e-9 and abs(a["p_psia"] - p) < 1e-9


def stated(a: dict, pages: list[tuple[dict, str]], also: list[tuple[dict, str]] | None = None) -> dict:
    """
    Find NASA's sentence for one atmosphere. `pages` are (unit, flattened text) of its document.
    Returns {"unit", "words", "ok", "why"}; `ok` is False when the sentence is absent or gives another pair.
    """
    for unit, text in pages:
        m = re.search(a["pattern"], text)
        if not m:
            continue
        out = {"unit": unit, "words": m.group(0), "ok": _agrees(a, m), "why": ""}
        if not out["ok"]:
            out["why"] = "the document gives %s" % m.group(0)
        if out["ok"] and a.get("band"):
            b = re.search(a["band"], text)
            if b:
                out["band_pct"] = float(b.group("o2"))
                out["band_words"] = b.group(0)
        if out["ok"] and a.get("also"):
            hit = next((mm for _, t in (also or []) for mm in [re.search(a["also"][1], t)] if mm), None)
            out["also_ok"] = bool(hit and _agrees(a, hit))
            out["also_words"] = hit.group(0) if hit else None
        return out
    return {"unit": None, "words": None, "ok": False, "why": "no page of the document holds the sentence"}
