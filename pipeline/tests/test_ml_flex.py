"""Leakage, grouping, exclusion and export checks for the FLEX regressor (pipeline/zgf/ml_flex.py)."""
import json
import os
import unittest

from zgf import ml_flex

V1 = os.path.join(os.path.dirname(__file__), "..", "..", "web", "public", "data", "v1")


def _synthetic_table():
    cols = ["FLEX Test #", "FLEX Identifier", "Test Date", "Test GMT", "Fuel", "Ambient pressure; mmHg",
            "O initial ambient composition; mole fraction", "N initial ambient composition; mole fraction",
            "CO initial ambient composition; mole fraction", "He initial ambient composition; mole fraction",
            "Droplet initial diameter; mm", "Visible flame extinction diameter; mm", "Burning rate; mm", "Burn time; s", "Test end"]
    rows = []
    n = 0
    for fuel in ("Methanol", "Heptane"):
        for o2 in (0.15, 0.18, 0.21, 0.24, 0.27, 0.30):
            for p in (532.0, 760.0):
                for rep in range(3):
                    n += 1
                    k = 0.3 + 1.2 * o2 + (0.1 if fuel == "Heptane" else 0) + 0.01 * rep
                    rows.append([str(n), "X%d" % n, "", "", fuel, str(p), str(o2), str(round(1 - o2, 2)), "0", "0", str(2 + 0.1 * rep), "0.5", str(round(k, 3)), "9", "Extinction"])
    rows.append(["999", "BAD", "", "", "Methanol", "760", "0.21", "0.79", "0", "0", "2", "0.5", "–", "9", "Extinction"])
    rows.append(["998", "BAD2", "", "", "Methanol", "", "0.21", "0.79", "0", "0", "2", "0.5", "0.5", "9", "Extinction"])
    rows.append(["997", "BAD3", "", "", "Methanol", "760", "0.21", "0.70", "0", "0", "2", "0.5", "0.5", "9", "Extinction"])
    return {"columns": cols, "rows": rows}


class Rows(unittest.TestCase):
    def test_exclusions_have_reasons_and_add_up(self):
        t = _synthetic_table()
        inc, exc = ml_flex.load_rows(t)
        self.assertEqual(len(inc) + len(exc), len(t["rows"]))
        whys = sorted(e["why"] for e in exc)
        self.assertEqual(whys, ["mole fractions do not add up to 1 within 0.02", "no ambient pressure stated", "no burning rate stated (the target)"])

    def test_forbidden_columns_never_reach_features(self):
        for name in ml_flex.FEATURES + ml_flex.PHYS_FEATURES:
            low = name.lower()
            for bad in ("burn", "time", "extinction", "end", "rate", "k_"):
                self.assertNotIn(bad, low)
        inc, _ = ml_flex.load_rows(_synthetic_table())
        r = dict(inc[0])
        a = ml_flex.features(r)
        r["k"] = 99.0                                  # changing the target must not change the inputs
        self.assertEqual(a, ml_flex.features(r))

    def test_grouping_is_from_conditions_and_keeps_noisy_pressure_together(self):
        a = ml_flex.regime("Methanol", 0.69 * 101.325, 0.30, 0, 0)
        b = ml_flex.regime("Methanol", 0.71 * 101.325, 0.30, 0, 0)
        c = ml_flex.regime("Methanol", 1.00 * 101.325, 0.30, 0, 0)
        self.assertEqual(a, b)
        self.assertNotEqual(a, c)
        self.assertNotEqual(ml_flex.regime("Heptane", 101.3, 0.2, 0, 0), ml_flex.regime("Methanol", 101.3, 0.2, 0, 0))


class Evaluation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.inc, _ = ml_flex.load_rows(_synthetic_table())
        cls.ev = ml_flex.evaluate(cls.inc, n_splits=4)

    def test_groups_never_cross_folds(self):
        fold_of = {}
        for r, f in zip(self.inc, self.ev["fold_of"]):
            fold_of.setdefault(r["group"], set()).add(f)
        self.assertTrue(all(len(s) == 1 for s in fold_of.values()))

    def test_same_oof_rows_for_every_model(self):
        n = len(self.inc)
        for name, m in self.ev["metrics"].items():
            self.assertEqual(m["n"], n, name)

    def test_scaler_lives_inside_the_pipeline(self):
        for name, c in ml_flex._candidates().items():
            for est in c["grid"]:
                if name.startswith("ridge"):
                    self.assertEqual([s for s, _ in est.steps], ["scale", "ridge"])

    def test_linear_truth_is_learned_better_than_the_medians(self):
        m = self.ev["metrics"]
        self.assertLess(m["ridge"]["mae"], m["fuel_median"]["mae"])


class Shipped(unittest.TestCase):
    """Checks on the artifacts the site ships, when they exist."""

    def setUp(self):
        p = os.path.join(V1, "ml", "flex_k_model.json")
        if not os.path.exists(p):
            self.skipTest("run pipeline/train_flex.py first")
        self.m = json.load(open(p, encoding="utf-8"))
        self.e = json.load(open(os.path.join(V1, "ml", "flex_k_eval.json"), encoding="utf-8"))

    def test_golden_vectors_reproduce(self):
        for g in self.m["golden"]:
            self.assertAlmostEqual(g["k_python"], ml_flex.predict_exported(self.m["model"], g["input"]), places=9)

    def test_dataset_hash_matches_rows(self):
        rows = [dict(r) for r in self.m["train"]]
        self.assertEqual(ml_flex.dataset_hash(rows), self.m["dataset_sha256"])

    def test_metrics_are_recomputable_from_published_oof(self):
        rows = self.e["rows"]
        mae = sum(abs(r["selected"] - r["k"]) for r in rows) / len(rows)
        self.assertAlmostEqual(mae, self.e["metrics"]["selected"]["mae"], places=3)
        groups = {}
        for r in rows:
            groups.setdefault(r["group"], set()).add(r["fold"])
        self.assertTrue(all(len(s) == 1 for s in groups.values()))

    def test_audit_counts_add_up(self):
        a = self.e["audit"]
        self.assertEqual(a["n_included"] + a["n_excluded"], a["n_table_rows"])
        self.assertEqual(sum(x["n"] for x in a["excluded"]), a["n_excluded"])


if __name__ == "__main__":
    unittest.main()
