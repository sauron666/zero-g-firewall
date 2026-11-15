"""
A regressor for the measured burning-rate constant K of FLEX droplets (PSI-69), with a grouped, honest check.

Scope, stated once and enforced by the support gate in the browser (web/src/ml/support.ts):
  * target: K as NASA's FLEX table states it (header "Burning rate; mm", read as mm²/s; see droplets.py),
  * fuels: methanol and n-heptane droplets only, free fall only, quiescent atmospheres only,
  * inputs: what is known before ignition: fuel, initial O2, N2, CO2 and He mole fractions, pressure, initial diameter.
It is a numerical research model for droplets. It is not a probability of fire, not a model of a PMMA panel and
not an assessment of the safety of any habitat.

Leakage rules (tested in pipeline/tests/test_ml_flex.py):
  * forbidden as features: K itself, burn time, extinction diameter, test end and anything derived from them;
  * test number, identifier, date and row are provenance only;
  * every preprocessing step (scaling) is fitted inside the training fold through a sklearn Pipeline;
  * groups are physical test regimes (fuel, nominal pressure band, gas composition) fixed from the conditions
    before any target is looked at; no group appears in both the training and the test side of a fold.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import statistics

ACC = "PSI-69"
MMHG_TO_KPA = 0.1333224
SEED = 20261115
COLS = {"id": "FLEX Test #", "ident": "FLEX Identifier", "fuel": "Fuel", "p": "Ambient pressure; mmHg",
        "o2": "O initial ambient composition; mole fraction", "n2": "N initial ambient composition; mole fraction",
        "co2": "CO initial ambient composition; mole fraction", "he": "He initial ambient composition; mole fraction",
        "d0": "Droplet initial diameter; mm", "k": "Burning rate; mm"}
FORBIDDEN = ["Burning rate; mm", "Burn time; s", "Visible flame extinction diameter; mm", "Test end"]
PROVENANCE_ONLY = ["FLEX Test #", "FLEX Identifier", "Test Date", "Test GMT"]
FUELS = ["Methanol", "Heptane"]
# the allow-list, in this order, is the input of every model and of the browser
FEATURES = ["fuel_heptane", "x_o2", "p_kpa", "x_n2", "x_co2", "x_he", "d0_mm"]
PHYS_FEATURES = ["fuel_heptane", "x_o2", "ln_p_kpa", "x_co2", "x_he", "d0_mm", "heptane_x_o2", "heptane_x_co2", "heptane_x_he"]
PHYS_WHY = {"ln_p_kpa": "pressure enters droplet burning through gas properties that change slowly with pressure; a logarithm lets one coefficient span 0.7 to 3 atm",
            "heptane_x_o2": "the two fuels need different amounts of oxygen per unit of fuel, so their response to ambient oxygen may differ",
            "heptane_x_co2": "a diluent may act differently on a sooting and a non-sooting fuel",
            "heptane_x_he": "helium raises thermal diffusivity; its effect may differ by fuel"}
PRESSURE_BANDS_ATM = [0.5, 0.7, 1.0, 1.5, 2.0, 2.5, 3.0]


def _num(s: str):
    s = (s or "").strip().replace("–", "").replace("—", "")
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def pressure_band(p_kpa: float) -> float:
    """Nominal pressure regime: the nearest of a fixed list of levels in atm. Repeats at 0.69 and 0.71 atm stay together."""
    atm = p_kpa / 101.325
    return min(PRESSURE_BANDS_ATM, key=lambda b: (abs(b - atm), b))


def diluent(x_co2: float, x_he: float) -> str:
    return "He" if x_he > 0 else ("CO2" if x_co2 > 0 else "N2")


def regime(fuel: str, p_kpa: float, x_o2: float, x_co2: float, x_he: float) -> str:
    """The grouping key, from conditions only: fuel, nominal pressure band, gas composition to 0.01."""
    return "%s|%.1fatm|%s|O2=%.2f|CO2=%.2f|He=%.2f" % (fuel, pressure_band(p_kpa), diluent(x_co2, x_he), x_o2, x_co2, x_he)


def atmosphere_regime(fuel: str, p_kpa: float, x_co2: float, x_he: float) -> str:
    """Coarser key for the stress test: diluent and pressure band, both fuels pooled."""
    return "%s @ %.1f atm" % (diluent(x_co2, x_he), pressure_band(p_kpa))


def features(r: dict) -> list[float]:
    return [1.0 if r["fuel"] == "Heptane" else 0.0, r["x_o2"], r["p_kpa"], r["x_n2"], r["x_co2"], r["x_he"], r["d0_mm"]]


def phys_features(r: dict) -> list[float]:
    h = 1.0 if r["fuel"] == "Heptane" else 0.0
    return [h, r["x_o2"], math.log(r["p_kpa"]), r["x_co2"], r["x_he"], r["d0_mm"], h * r["x_o2"], h * r["x_co2"], h * r["x_he"]]


def load_rows(table: dict) -> tuple[list[dict], list[dict]]:
    """Every row of NASA's FLEX table, included or excluded with a reason fixed before evaluation."""
    cols = [c.strip() for c in table["columns"]]
    for c in COLS.values():
        if c not in cols:
            raise ValueError("ml_flex: expected column not found: %s" % c)
    j = {k: cols.index(c) for k, c in COLS.items()}
    inc, exc = [], []
    for i, row in enumerate(table["rows"]):
        cell = lambda k: row[j[k]] if j[k] < len(row) else ""
        r = {"row": i, "test": cell("id").strip(), "ident": cell("ident").strip(), "fuel": cell("fuel").strip()}
        vals = {k: _num(cell(k)) for k in ("p", "o2", "n2", "co2", "he", "d0", "k")}
        why = None
        if r["fuel"] not in FUELS:
            why = "fuel not methanol or heptane"
        elif vals["k"] is None:
            why = "no burning rate stated (the target)"
        elif vals["k"] <= 0:
            why = "burning rate of zero or below"
        elif vals["p"] is None or vals["p"] <= 0:
            why = "no ambient pressure stated"
        elif any(vals[k] is None for k in ("o2", "n2", "co2", "he")):
            why = "gas composition incomplete"
        elif vals["d0"] is None or vals["d0"] <= 0:
            why = "no initial diameter stated"
        else:
            s = vals["o2"] + vals["n2"] + vals["co2"] + vals["he"]
            if not (0.98 <= s <= 1.02) or min(vals["o2"], vals["n2"], vals["co2"], vals["he"]) < 0:
                why = "mole fractions do not add up to 1 within 0.02"
        if why:
            exc.append({**r, "why": why, "k_as_written": cell("k").strip()})
            continue
        r.update({"p_kpa": round(vals["p"] * MMHG_TO_KPA, 3), "x_o2": vals["o2"], "x_n2": vals["n2"], "x_co2": vals["co2"], "x_he": vals["he"],
                  "d0_mm": vals["d0"], "k": vals["k"]})
        r["group"] = regime(r["fuel"], r["p_kpa"], r["x_o2"], r["x_co2"], r["x_he"])
        r["atmos"] = atmosphere_regime(r["fuel"], r["p_kpa"], r["x_co2"], r["x_he"])
        inc.append(r)
    return inc, exc


def dataset_hash(rows: list[dict]) -> str:
    keep = [{k: r[k] for k in ("row", "fuel", "x_o2", "p_kpa", "x_n2", "x_co2", "x_he", "d0_mm", "k", "group")} for r in rows]
    return hashlib.sha256(json.dumps(keep, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def audit(inc: list[dict], exc: list[dict], n_total: int) -> dict:
    ks = sorted(r["k"] for r in inc)
    dup = {}
    for r in inc:
        key = (r["fuel"], r["x_o2"], r["p_kpa"], r["x_co2"], r["x_he"], r["d0_mm"], r["k"])
        dup.setdefault(key, []).append(r["row"])
    reasons = {}
    for e in exc:
        reasons.setdefault(e["why"], []).append(e["row"])
    rng = lambda key: {f: [min(r[key] for r in inc if r["fuel"] == f), max(r[key] for r in inc if r["fuel"] == f)] for f in FUELS}
    q = lambda f: ks[int(f * (len(ks) - 1))]
    return {"n_table_rows": n_total, "n_included": len(inc), "n_excluded": len(exc),
            "excluded": [{"why": w, "n": len(v), "rows": v} for w, v in sorted(reasons.items(), key=lambda kv: -len(kv[1]))],
            "by_fuel": {f: sum(1 for r in inc if r["fuel"] == f) for f in FUELS},
            "groups": len({r["group"] for r in inc}),
            "target": {"unit": "mm²/s", "n": len(ks), "min": ks[0], "p10": q(0.1), "median": statistics.median(ks), "p90": q(0.9), "max": ks[-1],
                       "mean": round(statistics.mean(ks), 4)},
            "exact_duplicates": [v for v in dup.values() if len(v) > 1],
            "ranges": {"x_o2": rng("x_o2"), "p_kpa": rng("p_kpa"), "x_co2": rng("x_co2"), "x_he": rng("x_he"), "d0_mm": rng("d0_mm")},
            "missing_in_included": 0}


def _metrics(y, p) -> dict:
    import numpy as np
    y, p = np.asarray(y, float), np.asarray(p, float)
    e = p - y
    ss = float(((y - y.mean()) ** 2).sum())
    return {"n": int(len(y)), "mae": round(float(np.abs(e).mean()), 4), "rmse": round(float(math.sqrt((e ** 2).mean())), 4),
            "r2": round(1 - float((e ** 2).sum()) / ss, 3) if ss > 0 else None, "bias": round(float(e.mean()), 4)}


def _candidates():
    from sklearn.ensemble import ExtraTreesRegressor
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    ridge = lambda a: Pipeline([("scale", StandardScaler()), ("ridge", Ridge(alpha=a))])
    # fixed before evaluation; alpha of each ridge is chosen by inner grouped CV
    return {
        "ridge": {"feat": features, "names": FEATURES, "grid": [ridge(a) for a in (0.1, 1.0, 10.0)], "alphas": [0.1, 1.0, 10.0], "export": True},
        "ridge_phys": {"feat": phys_features, "names": PHYS_FEATURES, "grid": [ridge(a) for a in (0.1, 1.0, 10.0)], "alphas": [0.1, 1.0, 10.0], "export": True},
        "extra_trees": {"feat": features, "names": FEATURES, "grid": [ExtraTreesRegressor(n_estimators=300, min_samples_leaf=3, random_state=SEED)], "alphas": [None], "export": False},
    }


def _inner_pick(cand, X, y, g, n_inner: int):
    """Index of the grid entry with the lowest grouped inner-CV MAE. Training rows only."""
    import numpy as np
    from sklearn.base import clone
    from sklearn.model_selection import GroupKFold
    if len(cand["grid"]) == 1:
        return 0
    k = min(n_inner, len(set(g)))
    scores = []
    for est in cand["grid"]:
        err = []
        for tr, te in GroupKFold(n_splits=k).split(X, y, g):
            m = clone(est).fit(X[tr], y[tr])
            err.extend(np.abs(m.predict(X[te]) - y[te]))
        scores.append(float(np.mean(err)))
    return int(np.argmin(scores))


def evaluate(rows: list[dict], n_splits: int = 5) -> dict:
    """Outer GroupKFold by regime; the same out-of-fold rows for every model; selection and scaling inside each fold."""
    import numpy as np
    from sklearn.base import clone
    from sklearn.model_selection import GroupKFold
    y = np.array([r["k"] for r in rows])
    g = np.array([r["group"] for r in rows])
    fuel = np.array([r["fuel"] for r in rows])
    n_groups = len(set(g))
    k = min(n_splits, n_groups)
    folds = list(GroupKFold(n_splits=k).split(np.zeros(len(y)), y, g))
    fold_of = np.zeros(len(y), int)
    for i, (_, te) in enumerate(folds):
        fold_of[te] = i
    cands = _candidates()
    oof = {"global_median": np.zeros(len(y)), "fuel_median": np.zeros(len(y))}
    picks = {}
    for name, c in cands.items():
        X = np.array([c["feat"](r) for r in rows])
        oof[name] = np.zeros(len(y))
        picks[name] = []
        for tr, te in folds:
            j = _inner_pick(c, X[tr], y[tr], g[tr], 4)
            picks[name].append(c["alphas"][j])
            m = clone(c["grid"][j]).fit(X[tr], y[tr])
            oof[name][te] = m.predict(X[te])
    for tr, te in folds:
        if set(g[tr]) & set(g[te]):
            raise AssertionError("a group is on both sides of a fold")
        oof["global_median"][te] = np.median(y[tr])
        for f in FUELS:
            mt, ms = fuel[te] == f, fuel[tr] == f
            oof["fuel_median"][te[mt]] = np.median(y[tr][ms]) if ms.any() else np.median(y[tr])
    # nested selection among the exportable models: choose inside each outer fold by inner CV
    exportable = [n for n, c in cands.items() if c["export"]]
    oof["selected"] = np.zeros(len(y))
    selected_by_fold = []
    for tr, te in folds:
        best, best_err = None, None
        for name in exportable:
            c = cands[name]
            X = np.array([c["feat"](r) for r in rows])
            j = _inner_pick(c, X[tr], y[tr], g[tr], 4)
            err = []
            for itr, ite in GroupKFold(n_splits=min(4, len(set(g[tr])))).split(X[tr], y[tr], g[tr]):
                m = clone(c["grid"][j]).fit(X[tr][itr], y[tr][itr])
                err.extend(np.abs(m.predict(X[tr][ite]) - y[tr][ite]))
            e = float(np.mean(err))
            if best_err is None or e < best_err:
                best, best_err, best_j = name, e, j
        c = cands[best]
        X = np.array([c["feat"](r) for r in rows])
        oof["selected"][te] = clone(c["grid"][best_j]).fit(X[tr], y[tr]).predict(X[te])
        selected_by_fold.append({"model": best, "alpha": c["alphas"][best_j]})
    metrics = {}
    for name, p in oof.items():
        m = _metrics(y, p)
        m["by_fuel"] = {f: _metrics(y[fuel == f], p[fuel == f]) for f in FUELS}
        metrics[name] = m
    # leave one atmosphere regime out, for the exported winner's family
    atm = np.array([r["atmos"] for r in rows])
    stress = []
    for a in sorted(set(atm)):
        te = np.where(atm == a)[0]
        tr = np.where(atm != a)[0]
        if len(te) < 3:
            continue
        line = {"held_out": a, "n": int(len(te))}
        for name in ("fuel_median", "ridge", "ridge_phys"):
            if name == "fuel_median":
                p = np.array([np.median(y[tr][fuel[tr] == fuel[i]]) for i in te])
            else:
                c = cands[name]
                X = np.array([c["feat"](r) for r in rows])
                p = clone(c["grid"][1]).fit(X[tr], y[tr]).predict(X[te])
            line[name] = _metrics(y[te], p)["mae"]
        stress.append(line)
    abs_err = {n: np.abs(oof[n] - y) for n in oof}
    return {"n_rows": int(len(y)), "n_groups": n_groups, "n_folds": k, "fold_of": fold_of.tolist(), "oof": {n: [round(float(v), 4) for v in p] for n, p in oof.items()},
            "metrics": metrics, "inner_alpha_by_fold": picks, "selected_by_fold": selected_by_fold, "stress_leave_one_atmosphere_out": stress,
            "abs_err_quantiles": {n: {"p50": round(float(np.quantile(e, 0.5)), 4), "p80": round(float(np.quantile(e, 0.8)), 4), "p95": round(float(np.quantile(e, 0.95)), 4)} for n, e in abs_err.items()},
            "groups_disjoint": True}


def fit_final(rows: list[dict], name: str) -> dict:
    """The model shipped to the browser: one ridge pipeline, alpha by grouped CV on all rows, exported as numbers."""
    import numpy as np
    from sklearn.base import clone
    c = _candidates()[name]
    X = np.array([c["feat"](r) for r in rows])
    y = np.array([r["k"] for r in rows])
    g = np.array([r["group"] for r in rows])
    j = _inner_pick(c, X, y, g, 5)
    m = clone(c["grid"][j]).fit(X, y)
    sc, rg = m.named_steps["scale"], m.named_steps["ridge"]
    return {"name": name, "features": c["names"], "alpha": c["alphas"][j],
            "mean": [float(v) for v in sc.mean_], "scale": [float(v) for v in sc.scale_],
            "coef": [float(v) for v in rg.coef_], "intercept": float(rg.intercept_), "_pipe": m}


def predict_exported(model: dict, r: dict) -> float:
    """The exact arithmetic the browser runs (web/src/ml/inference.ts): standardise, dot product, intercept."""
    x = (phys_features if model["name"] == "ridge_phys" else features)(r)
    return model["intercept"] + sum(cf * (xi - mu) / s for cf, xi, mu, s in zip(model["coef"], x, model["mean"], model["scale"]))


def support_stats(rows: list[dict]) -> dict:
    """What the support gate needs: ranges per fuel, known (fuel, diluent, band) combinations, and a distance scale."""
    names = ["x_o2", "p_kpa", "x_co2", "x_he", "d0_mm"]
    out = {"fuels": {}, "regimes": sorted({"%s|%s|%.1f" % (r["fuel"], diluent(r["x_co2"], r["x_he"]), pressure_band(r["p_kpa"])) for r in rows}),
           "distance_features": names, "gravity_g": 0.0, "airflow_m_s": 0.0, "form": "droplet",
           "pressure_bands_atm": PRESSURE_BANDS_ATM}
    for f in FUELS:
        mine = [r for r in rows if r["fuel"] == f]
        span = {k: [min(r[k] for r in mine), max(r[k] for r in mine)] for k in names}
        scale = {k: max(1e-6, statistics.pstdev([r[k] for r in mine])) for k in names}
        pts = [[r[k] / scale[k] for k in names] for r in mine]
        nn = []
        for i, a in enumerate(pts):
            nn.append(min(math.dist(a, b) for j, b in enumerate(pts) if j != i))
        nn.sort()
        p95 = nn[int(0.95 * (len(nn) - 1))]
        out["fuels"][f] = {"n": len(mine), "range": span, "scale": scale, "nn_p95": round(p95, 4), "max_distance": round(1.5 * p95, 4)}
    return out


def nearest(rows: list[dict], q: dict, sup: dict, k: int = 3) -> list[dict]:
    names = sup["distance_features"]
    sc = sup["fuels"][q["fuel"]]["scale"]
    mine = [r for r in rows if r["fuel"] == q["fuel"]]
    d = sorted(((math.dist([q[n] / sc[n] for n in names], [r[n] / sc[n] for n in names]), r) for r in mine), key=lambda t: (t[0], t[1]["row"]))
    return [{"row": r["row"], "test": r["test"], "d": round(dd, 4)} for dd, r in d[:k]]


GOLDEN_INPUTS = [
    {"fuel": "Methanol", "x_o2": 0.21, "p_kpa": 101.325, "x_n2": 0.79, "x_co2": 0.0, "x_he": 0.0, "d0_mm": 2.0},
    {"fuel": "Heptane", "x_o2": 0.21, "p_kpa": 101.325, "x_n2": 0.79, "x_co2": 0.0, "x_he": 0.0, "d0_mm": 3.5},
    {"fuel": "Methanol", "x_o2": 0.30, "p_kpa": 70.9, "x_n2": 0.70, "x_co2": 0.0, "x_he": 0.0, "d0_mm": 2.5},
    {"fuel": "Heptane", "x_o2": 0.18, "p_kpa": 101.3, "x_n2": 0.67, "x_co2": 0.15, "x_he": 0.0, "d0_mm": 3.0},
    {"fuel": "Methanol", "x_o2": 0.17, "p_kpa": 101.3, "x_n2": 0.63, "x_co2": 0.0, "x_he": 0.20, "d0_mm": 2.2},
    {"fuel": "Heptane", "x_o2": 0.24, "p_kpa": 70.9, "x_n2": 0.56, "x_co2": 0.20, "x_he": 0.0, "d0_mm": 3.2},
]


def build(table: dict, table_meta: dict) -> tuple[dict, dict]:
    """Returns (model document for the browser, evaluation document). Pure apart from sklearn's determinism under a seed."""
    import numpy as np
    import sklearn
    inc, exc = load_rows(table)
    au = audit(inc, exc, len(table["rows"]))
    ev = evaluate(inc)
    exportable = ["ridge", "ridge_phys"]
    winner = min(exportable, key=lambda n: (ev["metrics"][n]["mae"], n))
    model = fit_final(inc, winner)
    pipe = model.pop("_pipe")
    sup = support_stats(inc)
    golden = []
    for q in GOLDEN_INPUTS:
        x = (phys_features if winner == "ridge_phys" else features)(q)
        golden.append({"input": q, "k_python": round(float(pipe.predict(np.array([x]))[0]), 10), "k_exported": round(predict_exported(model, q), 10)})
    for gv in golden:
        if abs(gv["k_python"] - gv["k_exported"]) > 1e-9:
            raise AssertionError("exported arithmetic differs from the sklearn pipeline")
    dhash = dataset_hash(inc)
    versions = {"python": "%d.%d" % tuple(__import__("sys").version_info[:2]), "numpy": np.__version__, "scikit-learn": sklearn.__version__}
    model_id = "flex-k-%s-%s" % (winner, dhash[:10])
    source = {k: table_meta[k] for k in ("accession", "file", "artifact", "sha256", "ledger_seq")}
    train = [{"row": r["row"], "test": r["test"], "ident": r["ident"], "fuel": r["fuel"], "x_o2": r["x_o2"], "p_kpa": r["p_kpa"], "x_n2": r["x_n2"],
              "x_co2": r["x_co2"], "x_he": r["x_he"], "d0_mm": r["d0_mm"], "k": r["k"], "group": r["group"]} for r in inc]
    mdoc = {"klass": "model", "schema": "zgf-ml/1", "model_id": model_id, "task": "regression",
            "target": {"name": "burning-rate constant K", "unit": "mm²/s", "header_as_written": "Burning rate; mm",
                       "read_as": "mm²/s", "why": "an area per time; read so, the rate agrees with initial diameter, extinction diameter and burn time of the same row (see droplets.json)"},
            "model": model, "feature_why": PHYS_WHY if winner == "ridge_phys" else {},
            "support": sup, "train": train, "golden": golden, "seed": SEED, "versions": versions,
            "dataset_sha256": dhash, "source": source,
            "forbidden_features": FORBIDDEN, "provenance_only": PROVENANCE_ONLY,
            "uncertainty": {"kind": "empirical out-of-fold error of the selected family, not a calibrated interval",
                            "abs_err": ev["abs_err_quantiles"][winner], "by_fuel_mae": {f: ev["metrics"][winner]["by_fuel"][f]["mae"] for f in FUELS}},
            "scope": "Methanol and n-heptane droplets in free fall in quiescent O2/N2/CO2/He atmospheres, 0.7 to 3 atm, as in NASA's FLEX table. Not a probability of fire; not for solid materials such as PMMA; not for any gravity but free fall.",
            "command": "PYTHONPATH=pipeline python pipeline/train_flex.py"}
    edoc = {"klass": "model", "schema": "zgf-ml-eval/1", "model_id": model_id, "dataset_sha256": dhash, "source": source, "audit": au, "excluded_rows": exc,
            "grouping_rule": "fuel | nominal pressure band (nearest of %s atm) | diluent | O2, CO2 and He mole fractions to 0.01; fixed from conditions before any target was read" % PRESSURE_BANDS_ATM,
            "candidates": {"global_median": "median K of the training fold", "fuel_median": "median K of the training fold for the same fuel, else the global median",
                           "ridge": "standardised ridge on the seven allowed inputs; alpha from {0.1, 1, 10} by inner grouped CV",
                           "ridge_phys": "ridge on physics-informed inputs (ln p, fuel interactions); alpha by inner grouped CV",
                           "extra_trees": "300 extremely randomised trees, min 3 rows per leaf; evaluated, not exported (size)",
                           "selected": "nested: inside each outer fold, ridge or ridge_phys is chosen by inner grouped CV on the training rows only"},
            "winner": winner, "rows": [{"row": r["row"], "test": r["test"], "fuel": r["fuel"], "group": r["group"], "atmos": r["atmos"], "k": r["k"],
                                       "fold": ev["fold_of"][i], **{n: ev["oof"][n][i] for n in ev["oof"]}} for i, r in enumerate(inc)],
            **{k: v for k, v in ev.items() if k not in ("oof", "fold_of")}, "versions": versions, "seed": SEED,
            "limits": ["Out-of-fold errors are for unseen regimes of the same two fuels in the same facility; they say nothing about other fuels, gravity or forced flow.",
                       "The candidate families were fixed after a first exploratory run that also tried gradient boosting; no number on the page comes from that run.",
                       "K is read as mm²/s from a header that says mm."]}
    return mdoc, edoc


def model_card(mdoc: dict, edoc: dict) -> str:
    m = edoc["metrics"]
    rowsfmt = lambda n: "| %s | %s | %s | %s | %s |" % (n, m[n]["mae"], m[n]["rmse"], m[n]["r2"], m[n]["n"])
    a = edoc["audit"]
    lines = [
        "# Model card: FLEX droplet burning-rate constant (K)", "",
        "Generated by `pipeline/train_flex.py`; do not edit by hand.", "",
        "- **Model ID:** `%s`" % mdoc["model_id"],
        "- **Task:** regression of NASA's measured K (mm²/s) for FLEX droplets (PSI-69). Numerical research model, not a fire probability, not for PMMA or any solid.",
        "- **Source table:** `%s`, SHA-256 `%s`, ledger entry %s." % (mdoc["source"]["file"], mdoc["source"]["sha256"], mdoc["source"]["ledger_seq"]),
        "- **Dataset hash (training rows):** `%s`" % mdoc["dataset_sha256"],
        "- **Rows:** %d in the table, %d used, %d excluded (reasons below). %d regimes (groups)." % (a["n_table_rows"], a["n_included"], a["n_excluded"], a["groups"]),
        "- **Inputs (allow-list):** %s." % ", ".join(mdoc["model"]["features"]),
        "- **Forbidden inputs:** %s." % ", ".join(mdoc["forbidden_features"]),
        "- **Selected model:** `%s`, alpha %s, exported as standardisation plus %d coefficients." % (mdoc["model"]["name"], mdoc["model"]["alpha"], len(mdoc["model"]["coef"])),
        "- **Versions:** %s. Seed %s." % (", ".join("%s %s" % kv for kv in mdoc["versions"].items()), mdoc["seed"]),
        "- **Reproduce:** `%s`" % mdoc["command"], "",
        "## Grouped out-of-fold evaluation", "",
        "%d-fold GroupKFold over %d regimes. Grouping rule: %s." % (edoc["n_folds"], edoc["n_groups"], edoc["grouping_rule"]), "",
        "| Model | MAE mm²/s | RMSE mm²/s | R² | N |", "|---|---|---|---|---|",
        *[rowsfmt(n) for n in ("global_median", "fuel_median", "ridge", "ridge_phys", "extra_trees", "selected")], "",
        "`selected` is the nested estimate: the choice between the two ridge families was made inside every outer fold. It is the honest number for the shipped procedure.", "",
        "## Leave one atmosphere regime out (stress test)", "",
        "| Held out | N | fuel median | ridge | ridge_phys |", "|---|---|---|---|---|",
        *["| %s | %d | %s | %s | %s |" % (s["held_out"], s["n"], s["fuel_median"], s["ridge"], s["ridge_phys"]) for s in edoc["stress_leave_one_atmosphere_out"]], "",
        "## Excluded rows", "",
        *["- %s: %d rows (%s)" % (e["why"], e["n"], ", ".join(str(x + 1) for x in e["rows"])) for e in a["excluded"]], "",
        "## Uncertainty", "",
        "The page shows the empirical distribution of out-of-fold absolute errors (median %s, 80th percentile %s mm²/s). That is not a calibrated prediction interval." % (mdoc["uncertainty"]["abs_err"]["p50"], mdoc["uncertainty"]["abs_err"]["p80"]), "",
        "## Support gate (browser)", "",
        "A prediction is given only for methanol or heptane, droplet form, free fall (0 g), no forced flow, every input inside the training range of that fuel, a known fuel-diluent-pressure regime, and a scaled distance to the nearest training row of at most 1.5 times the 95th percentile of nearest-neighbour distances within the training set. Anything else abstains with the reason; no fallback number is shown.", "",
        "## Limits", "", *["- " + l for l in edoc["limits"]], "",
    ]
    return "\n".join(lines)
