"""
A fire in a spacecraft, as its own sensors recorded it.

NASA's record PSI-100 (Saffire-III) holds one raw data file: the housekeeping of the experiment and
part of the telemetry of the Cygnus cargo vehicle it flew in, for the two hours around the burn.
Among the vehicle's channels are the readings of its own smoke detector.

This module reads that file and keeps the part around the two ignitions. Nothing is smoothed or
filled. Times of events are read from the igniter and smoke-wire currents. The few numbers under
"derived" are computed by rules that are stated beside them.

NASA's file names its columns and gives no units, so no unit is stated here either.
"""
from __future__ import annotations

import csv
import datetime
import hashlib
import io
import json
import os
import statistics

from . import ledger as L

KEY = "psi:file:PSI-100:PSI-100_Raw Data_Saffire_Data_Table2017.161.00.42.03-EU.csv"
TABLE = "tables/PSI-100__PSI_100_Experimental_table_SAFFIRE_3.json"

TIME = "CygnusTimestamp"
RADIOMETERS = ["P@sfsHk.Radiometer%dvalue" % k for k in (1, 2, 3, 4)]
ANEMOMETERS = ["P@sfsHk.Anemometer1", "P@sfsHk.Anemometer2"]
WIRE = "P@sfsHk.SmokeWireCurrent"
IGNITER = {"S1": "P@sfsHk.Sample1IgniterCurrent", "S2": "P@sfsHk.Sample2IgniterCurrent"}
SCATTER = "P@CDH_F2PCM_SMK_DET_SCAT_SENS_P"
OBSCURATION = "P@CDH_F2PCM_SMK_DET_OBS_SENS_P"
OTHER_DETECTOR = ["P@CDH_F1PCM_SMK_DET_SCAT_SENS_P", "P@CDH_F1PCM_SMK_DET_OBS_SENS_P"]
CABIN = {"pressure": "P@F2PCM_AIR_PRES_EPS2_SIG_POS", "temperature": "P@PCM_ETS_TEMP_SIG", "fan": "P@CDH_F2PCM_ECLS_FAN_PRESSURE_P"}

LEAD = 450          # seconds kept before the concurrent-flow ignition
FRACTION = 0.1      # a signal "has risen" or "is back" at this fraction of its rise


def _f(x: str):
    try:
        return float(x)
    except (TypeError, ValueError):
        return None


def read(b: bytes) -> dict:
    """Columns of the file as lists, on the vehicle's clock in seconds from the first row. Rows whose clock is before 2001 are set aside."""
    rows = list(csv.reader(io.StringIO(b.decode("utf-8-sig"))))
    header = [h.strip() for h in rows[0]]
    it = header.index(TIME)
    kept, aside = [], []
    for r in rows[1:]:
        ms = _f(r[it]) if len(r) > it else None
        (kept if ms is not None and ms >= 978307200000 else aside).append(r)       # 1 January 2001
    t0 = _f(kept[0][it])
    cols = {h: [_f(r[i]) if i < len(r) else None for r in kept] for i, h in enumerate(header)}
    return {"header": header, "n_lines": len(rows) - 1, "aside": [r[it] for r in aside], "t0_ms": t0,
            "t": [(x - t0) / 1000.0 for x in cols[TIME]], "cols": cols}


def runs(t: list[float], v: list, level: float, gap: float = 5.0) -> list[tuple[float, float]]:
    """Stretches of time where v is above level; a pause shorter than gap does not end a stretch."""
    out, start, last = [], None, None
    for ti, x in zip(t, v):
        if x is not None and x > level:
            if start is None:
                start = ti
            last = ti
        elif start is not None and ti - last > gap:
            out.append((start, last))
            start = None
    if start is not None:
        out.append((start, last))
    return out


def sampled(t: list[float], v: list) -> list[tuple[float, float]]:
    """The rows in which a vehicle channel carries a reading. Between readings the file holds 0."""
    return [(ti, x) for ti, x in zip(t, v) if x]


def above(samples: list[tuple[float, float]], level: float) -> float:
    """Seconds spent above a level, each reading holding until the next one."""
    return round(sum(b[0] - a[0] for a, b in zip(samples, samples[1:]) if a[1] > level), 1)


def analyse(d: dict) -> dict:
    t, c = d["t"], d["cols"]
    on = lambda name: runs(t, c[name], 0.5 * max(x for x in c[name] if x is not None))
    wires, s1, s2 = on(WIRE), on(IGNITER["S1"]), on(IGNITER["S2"])
    if len(s1) != 1 or len(s2) != 1 or not wires:
        raise ValueError("the Saffire-III recording no longer shows one firing of each igniter")
    t1, t2 = s1[0][0], s2[0][0]
    # The file interleaves two streams. In the rows of the vehicle's stream, and while the experiment is unpowered,
    # the experiment's columns hold fixed values: the ones in the first row of the file.
    off = c[RADIOMETERS[0]][0]
    own = [i for i, x in enumerate(c[RADIOMETERS[0]]) if x is not None and x != off]
    live = t[own[0]]
    lo = max(live, t1 - LEAD)
    win = [i for i in own if t[i] >= lo]
    rel = lambda ti: round(ti - t1, 1)

    quiet_until = min(a for a, _ in wires)                              # before the first smoke wire nothing was burning or smoking
    rad = []
    for k, r in enumerate(RADIOMETERS):
        base = statistics.median(c[r][i] for i in win if t[i] < quiet_until)
        after = [(t[i], c[r][i]) for i in win if t[i] >= t1]
        pt, pv = max(after, key=lambda p: p[1])
        level = base + FRACTION * (pv - base)
        opposed = max(((t[i], c[r][i]) for i in win if t2 <= t[i] < t1), key=lambda p: p[1])
        rad.append({"id": "r%d" % (k + 1), "column": r, "baseline": round(base, 1), "peak": round(pv, 1), "peak_t": rel(pt),
                    "rise_t": rel(next(ti for ti, x in after if x > level)), "back_t": rel(max(ti for ti, x in after if x > level)),
                    "opposed_rise": round(opposed[1] - base, 1), "opposed_t": rel(opposed[0])})
    flame = {"from_t": min(r["rise_t"] for r in rad), "until_t": max(r["back_t"] for r in rad),
             "first_peak_t": min(r["peak_t"] for r in rad), "last_peak_t": max(r["peak_t"] for r in rad)}
    flame["ended_in_file"] = flame["until_t"] < rel(t[win[-1]]) - 30

    sc = sampled(t, c[SCATTER])
    quiet = [x for ti, x in sc if ti < quiet_until]
    quiet_max = max(quiet)
    wire = [(ti, x) for ti, x in sc if quiet_until <= ti < t2]
    wire_first = next((ti for ti, x in wire if x > quiet_max), None)
    wire_peak = max(wire, key=lambda p: p[1])
    between = [x for ti, x in sc if t2 <= ti < t1]
    level0 = max(x for ti, x in sc if t1 - 60 <= ti < t1)             # the highest reading in the minute before the concurrent-flow ignition
    burn = [(ti, x) for ti, x in sc if ti >= t1]
    peak_t, peak_v = max(burn, key=lambda p: p[1])
    first_above = next((ti for ti, x in burn if x > level0), None)
    half = level0 + 0.5 * (peak_v - level0)
    mark = 0.5 * wire_peak[1]                                           # one level for both sources: half the smoke wire's peak
    new_values = [a for a, b in zip(sc, sc[1:]) if a[1] != b[1]]
    steps = sorted(b[0] - a[0] for a, b in zip(new_values, new_values[1:]))

    again = None
    if len(wires) > 1:
        w2 = wires[1][0]
        prior = [x for ti, x in sc if w2 - 60 <= ti < w2]
        later = [(ti, x) for ti, x in sc if w2 <= ti < w2 + 180]
        if prior and later:
            top = max(later, key=lambda p: p[1])
            again = {"t": rel(w2), "before": max(prior), "peak": top[1], "peak_after_s": round(top[0] - w2, 1), "rise": round(top[1] - max(prior), 3)}

    ob = [x for ti, x in sampled(t, c[OBSCURATION]) if ti >= lo]
    cabin = {}
    for name, col in CABIN.items():
        vals = [x for ti, x in sampled(t, c[col]) if ti >= lo]
        cabin[name] = {"column": col, "n": len(vals), "min": min(vals), "max": max(vals), "first": vals[0], "last": vals[-1]}

    return {
        "t1": t1, "t2": t2, "lo": lo, "win": win, "live": live,
        "events": [{"id": "wire%d" % (n + 1), "kind": "smoke_wire", "t": rel(a), "to": rel(b), "label": "Smoke wire powered", "column": WIRE} for n, (a, b) in enumerate(wires) if a >= lo]
                  + [{"id": "S2", "kind": "igniter", "t": rel(s2[0][0]), "to": rel(s2[0][1]), "label": "Igniter of sample S2", "column": IGNITER["S2"]},
                     {"id": "S1", "kind": "igniter", "t": 0.0, "to": rel(s1[0][1]), "label": "Igniter of sample S1", "column": IGNITER["S1"]}],
        "radiometers": rad, "flame": flame,
        "scatter": {
            "column": SCATTER, "n": len(sc), "typical_step_s": round(steps[len(steps) // 2], 1),
            "quiet": {"n": len(quiet), "max": quiet_max, "minutes": round(quiet_until / 60.0)},
            "wire": {"t": rel(quiet_until), "first_above_quiet_after_s": round(wire_first - quiet_until, 1) if wire_first is not None else None,
                     "peak": wire_peak[1], "peak_t": rel(wire_peak[0]), "peak_after_s": round(wire_peak[0] - quiet_until, 1), "above_mark_s": above(wire, mark)},
            "wire_again": again,
            "between": {"max": max(between), "min": min(between)},
            "fire": {"before": level0, "first_above_before_s": rel(first_above) if first_above is not None else None,
                     "half": round(half, 3), "half_s": rel(next(ti for ti, x in burn if x >= half)),
                     "peak": peak_v, "peak_s": rel(peak_t), "above_mark_s": above(burn, mark), "last": sc[-1][1], "last_s": rel(sc[-1][0])},
            "mark": round(mark, 4),
        },
        "obscuration": {"column": OBSCURATION, "n": len(ob), "min": min(ob), "max": max(ob), "distinct": len(set(ob))},
        "cabin": cabin,
    }


def build(raw_dir: str, out_dir: str) -> dict:
    by_key = L.latest(L.load(raw_dir))
    e = by_key.get(KEY)
    dst = os.path.join(out_dir, "recorded.json")
    if not e:
        if os.path.exists(dst):
            os.remove(dst)
        return {"written": False, "why": "the Saffire-III raw data file is not in this ledger"}
    d = read(L.read(raw_dir, e))
    a = analyse(d)
    t, c, t1, win = d["t"], d["cols"], a["t1"], a["win"]
    rel = lambda ti: round(ti - t1, 1)
    start = datetime.datetime.fromtimestamp(d["t0_ms"] / 1000.0, datetime.timezone.utc)
    ign = start + datetime.timedelta(seconds=t1)

    with open(os.path.join(out_dir, TABLE), encoding="utf-8") as fh:
        tab = json.load(fh)
    cols = [h.strip() for h in tab["columns"]]
    samples = [{"row": n, **{h: v.strip() for h, v in zip(cols, r) if v.strip()}} for n, r in enumerate(tab["rows"])]

    keep = win                                                          # every reading of the experiment in the window, about one a second
    series = {
        "t": [rel(t[i]) for i in keep],
        "radiometers": [[round(c[r][i], 1) for i in keep] for r in RADIOMETERS],
        "anemometers": [[round(c[r][i], 1) for i in keep] for r in ANEMOMETERS],
    }
    pick = lambda col: [[rel(ti), x] for ti, x in sampled(t, c[col]) if ti >= a["lo"]]
    other = {col: len(set(x for x in c[col] if x)) for col in OTHER_DETECTOR}

    doc = {
        "klass": "observed",
        "title": "Saffire-III, as recorded aboard the Cygnus cargo vehicle",
        "source": {**L.ref(e), "file": e["file_name"], "bytes": e["size"], "lines": d["n_lines"], "columns": len(d["header"]),
                   "starts_utc": start.strftime("%Y-%m-%dT%H:%M:%SZ"), "ends_utc": (start + datetime.timedelta(seconds=t[-1])).strftime("%Y-%m-%dT%H:%M:%SZ"),
                   "table": {"artifact": TABLE, "sha256": tab["sha256"], "ledger_seq": tab["ledger_seq"], "file": tab["file"]}},
        "samples": samples,
        "zero": {"what": "the first reading of the igniter current of sample S1 above half its maximum", "utc": ign.strftime("%Y-%m-%dT%H:%M:%SZ"), "file_s": round(t1, 1)},
        "window": {"from_t": rel(a["lo"]), "to_t": rel(t[-1]), "rule": "from %d s before that ignition, or from the first live reading of the experiment if that is later, to the end of the file" % LEAD},
        "events": a["events"],
        "series": series,
        "detector": {"scatter": pick(SCATTER), "obscuration": pick(OBSCURATION)},
        "units": "NASA's file names its columns and gives no units. Readings are shown as recorded.",
        "derived": {
            "klass": "derived",
            "rules": [
                "An igniter or the smoke wire is on while its current is above half the largest current in its column.",
                "The experiment's columns carry a reading in the rows where radiometer 1 differs from the value it holds in the first row, when the experiment was unpowered.",
                "A radiometer's baseline is its median before the first smoke wire. It has risen, or is back, where it crosses %d%% of the way from baseline to peak." % round(100 * FRACTION),
                "A vehicle channel carries a reading in the rows where it is not 0.",
                "The detector's quiet level is its highest reading before the first smoke wire. Time above a level counts each reading until the next one.",
                "The level used to compare the smoke wire with the fire is half the smoke wire's peak.",
            ],
            "radiometers": a["radiometers"], "flame": a["flame"], "scatter": a["scatter"], "obscuration": a["obscuration"], "cabin": a["cabin"],
        },
        "findings": [
            {"kind": "timestamp_out_of_range", "detail": "%d row has a vehicle timestamp before 2001 (%s ms); it is set aside." % (len(d["aside"]), ", ".join(d["aside"][:3]))} if d["aside"] else None,
            {"kind": "two_streams", "detail": "The file interleaves the experiment's readings (about one a second) with the vehicle's. Each vehicle reading is written twice; a new detector value arrives about every %s s, and between readings the column holds 0." % a["scatter"]["typical_step_s"]},
            {"kind": "second_detector_silent", "detail": "The columns of the other detector string (%s) hold %s distinct non-zero values in the whole file." % (", ".join(OTHER_DETECTOR), " and ".join(str(n) for n in other.values()))},
            {"kind": "no_units", "detail": "The file gives no units, and the readme of the record does not describe these columns."},
        ],
        "limits": [
            "One flight, one sample material, one flow speed. The flame burned in a duct whose exhaust entered the cabin.",
            "The alarm level of the vehicle's detector is not in the file, so no alarm time is stated.",
            "Smoke from the smoke wire and from the opposed-flow test was still in the cabin when the concurrent-flow sample was lit.",
        ],
    }
    doc["findings"] = [f for f in doc["findings"] if f]
    b = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(dst, "wb") as fh:
        fh.write(b)
    mpath = os.path.join(out_dir, "manifest.json")
    manifest = json.load(open(mpath, encoding="utf-8"))
    manifest["artifacts"]["recorded.json"] = {"sha256": hashlib.sha256(b).hexdigest(), "bytes": len(b), "klass": "observed"}
    manifest["nasa"]["recorded_readings"] = len(keep) * (len(RADIOMETERS) + len(ANEMOMETERS)) + sum(len(v) for v in doc["detector"].values())
    manifest["nasa"]["files_read"] = len(L.READ)
    with open(mpath, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    return {"written": True, "bytes": len(b), "rows": len(keep), "detector_readings": len(doc["detector"]["scatter"]), "zero_utc": doc["zero"]["utc"],
            "wire_peak": a["scatter"]["wire"]["peak"], "fire_peak": a["scatter"]["fire"]["peak"], "fire_peak_s": a["scatter"]["fire"]["peak_s"], "flame_until_s": a["flame"]["until_t"]}
