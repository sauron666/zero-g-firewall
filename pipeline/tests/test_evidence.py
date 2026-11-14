"""Second derivation stage: profiles, curator rules, atmosphere points. Synthetic tables only; no NASA data is needed to run this."""
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from zgf import derive_evidence as E


def table(cols, rows, acc="PSI-0", file="t.csv", **extra):
    return {"accession": acc, "file": file, "encoding": "utf-8", "n_rows": len(rows), "n_cols": len(cols), "columns": cols, "rows": rows, **extra}


class Profiles(unittest.TestCase):
    def test_roles(self):
        t = table(["Test #", "Fuel", "Pressure", "O2", "Notes"], [["1", "Heptane", "1 atm", "0.21", ""], ["2", "Heptane", "1 atm", "0.18", "x"], ["3", "Heptane", "1 atm", "-", ""]])
        p = {c["name"]: c for c in E.profile_table(t)["columns"]}
        self.assertEqual(p["Test #"]["role"], "identifier")
        self.assertEqual(p["Fuel"]["role"], "constant")
        self.assertEqual((p["Pressure"]["kind"], p["Pressure"]["units"]), ("quantity", ["atm"]))
        self.assertEqual((p["O2"]["role"], p["O2"]["missing"], p["O2"]["min"], p["O2"]["max"]), ("varied", 1, 0.18, 0.21))
        self.assertEqual(p["Notes"]["role"], "notes")

    def test_a_dash_or_an_error_is_never_a_number(self):
        self.assertTrue(E.is_missing("–") and E.is_missing("#DIV/0!") and E.is_missing(" n/a "))
        self.assertIsNone(E.to_num("1 atm"))
        self.assertEqual(E.to_num(" .33"), 0.33)


class Curator(unittest.TestCase):
    def rules(self, t):
        return {f["rule"]: f for f in E.findings_for_table(t, "tables/x.json")}

    def test_fill_series_needs_a_number_written_against_a_letter(self):
        t = table(["Fuel Bottle"], [["100% C2H4"], ["100% C2H5"], ["100% C2H6"], ["50% CH4"]])
        self.assertEqual(self.rules(t)["fill_series"]["rows"], [1, 2])
        ok = table(["Fuel Sample Material"], [["PMMA 1 mm thick"], ["PMMA 2 mm thick"], ["PMMA 3 mm thick"]])
        self.assertNotIn("fill_series", self.rules(ok))

    def test_errors_dashes_percentages_and_spelling(self):
        t = table(["Tad (K)", "Color", "Oxygen Conc (percent)", "Initial CO (ppm)"],
                  [["#DIV/0!", "Blue", "21%", "-2"], ["1800", "blue", "2100%", "0"], ["–", "Yellow", "34%", "1"]])
        r = self.rules(t)
        self.assertEqual(r["spreadsheet_error"]["rows"], [0])
        self.assertEqual(r["dash_as_missing"]["rows"], [2])
        self.assertEqual(r["percent_over_100"]["rows"], [1])
        self.assertEqual(r["negative_concentration"]["rows"], [0])
        self.assertIn("'Blue' = 'blue'", r["spelling_variants"]["detail"])

    def test_spacing_alone_is_not_a_spelling_variant(self):
        self.assertNotIn("spelling_variants", self.rules(table(["Air display"], [["5   2"], ["5  2"], ["7"]])))

    def test_composition_closure_and_empty_lines(self):
        h = ["O initial ambient composition; mole fraction", "N initial ambient composition; mole fraction", "CO initial ambient composition; mole fraction"]
        r = self.rules(table(h, [["0.21", "0.79", "0"], ["0.3", "0.5", "0.2"], ["0.3", "0.5", "0.5"]], n_empty_lines=4))
        self.assertEqual(r["composition_closure"]["rows"], [2])
        self.assertIn("2 of 3 rows", r["composition_closure"]["detail"])
        self.assertIn("4 lines", r["empty_lines"]["detail"])

    def test_hand_notes_disappear_when_their_cells_change(self):
        t = {"a": table(["Samle Thickness"], [["037 mm"]], acc="PSI-99")}
        self.assertEqual([n["rule"] for n in E.hand_notes(t)], ["header_typo"])
        t["a"]["rows"][0][0] = "0.37 mm"
        self.assertEqual(E.hand_notes(t), [])

    def test_two_records_with_the_same_dates(self):
        items = [{"accession": "PSI-1", "acronym": "A", "start": "2001-03-02", "end": "2008-02-28", "scope": {"in_scope": True}, "gravity": "micro", "hardware": "x"},
                 {"accession": "PSI-2", "acronym": "B", "start": "2001-03-02", "end": "2008-02-28", "scope": {"in_scope": True}, "gravity": "micro", "hardware": "x"}]
        f = E.findings_for_records(items, {})
        self.assertEqual([x["rule"] for x in f], ["same_dates_in_two_records"])


class Envelope(unittest.TestCase):
    def test_units_missing_pressure_and_nearness(self):
        flex = table(["Fuel", "Ambient pressure; mmHg", "O initial ambient composition; mole fraction", "Test end"],
                     [["Heptane", "527.5", "0.30", "Extinction"], ["Heptane", "0", "0.21", "Completion"], ["Heptane", "760", "–", ""]], acc="PSI-69", file="FLEX.csv")
        bass = table(["Fuel Sample Material", "Calibrated initial O2 % by vol"], [["PMMA", "21.5"]], acc="PSI-25", file="BASS-II.csv")
        env = E.envelope({"tables/flex.json": flex, "tables/bass.json": bass})
        pts = {(p["a"], p["r"]): p for p in env["points"]}
        self.assertAlmostEqual(pts[("PSI-69", 0)]["p"], 70.33, places=1)
        self.assertEqual(pts[("PSI-69", 0)]["o"], "Extinction")
        self.assertIsNone(pts[("PSI-69", 1)]["p"])                 # a pressure of 0 is not a pressure
        self.assertNotIn(("PSI-69", 2), pts)                       # a dash is not an oxygen value
        self.assertIsNone(pts[("PSI-25", 0)]["p"])                 # never placed at an assumed pressure
        self.assertAlmostEqual(pts[("PSI-25", 0)]["x"], 0.215)
        near = {n["id"]: n["n_near"] for n in env["near_presets"]}
        self.assertEqual((near["challenge_limit"], near["iss"], near["suit"]), (1, 0, 0))
        self.assertEqual(env["gravity_counts"]["partial"], 0)

    def test_zst_against_a_hand_value(self):
        self.assertAlmostEqual(E.zst("C4H10", 0.031, 0.389), 0.654, places=3)


class Quotations(unittest.TestCase):
    def test_a_quotation_is_found_only_if_the_document_holds_it(self):
        from zgf.literature import Library, norm
        lib = Library("", {})
        lib._cache["d"] = [{"loc": "p. 34", "page": 34, "text": "34\nfire safety. 2. A fire will self-extin-\nguish if ventila"}, {"loc": "p. 35", "page": 35, "text": "35\ntion is shut off. 3. B ecause the gravity"}]
        self.assertEqual(lib.find("d", "A fire will self-extinguish if")["loc"], "p. 34")                       # line-end hyphenation is undone
        self.assertEqual(lib.find("d", "Because the gravity")["match"], "ignoring spaces")                        # a word split by the PDF
        self.assertIsNone(lib.find("d", "A fire will always self-extinguish"))                                    # a changed word is not a quotation
        self.assertEqual(norm("“It’s  20–30 cm”"), '"it\'s 20-30 cm"')


class Canonical(unittest.TestCase):
    def test_names_and_units_from_headers(self):
        from zgf.canonical import canonical, cell_number
        self.assertEqual(canonical("Air Flow (cm/s)"), ("air_flow", "cm/s"))
        self.assertEqual(canonical("Ambient pressure; mmHg"), ("ambient_pressure", "mmHg"))
        self.assertEqual(canonical("XO2 (init)"), ("xo2_init", None))                      # "init" is not a unit
        self.assertEqual(canonical("Radiometer gain (1000 250 50 10)"), ("radiometer_gain_1000_250_50_10", None))
        self.assertEqual(canonical("Calibrated  initial O2 % by vol "), ("calibrated_initial_o2_percent_by_vol", None))
        self.assertEqual(cell_number("0.5 atm"), (0.5, "atm"))
        self.assertEqual(cell_number("–"), (None, None))                                     # a dash is not a number
        self.assertEqual(cell_number("#DIV/0!"), (None, None))
        self.assertEqual(cell_number("Completion"), (None, None))

    def test_units_are_normalised_where_the_table_states_them(self):
        flex = table(["Fuel", "Ambient pressure; mmHg", "O initial ambient composition; mole fraction"], [["Heptane", "760", "0.21"]], acc="PSI-69", file="FLEX.csv")
        cfi = table(["Fuel", "Pressure", "Oxygen"], [["C12H26", "0.5 atm", "0.17"]], acc="PSI-39", file="CFI.csv")
        cfig = table(["Fuel", "approx p (bar)", "XO2 before test"], [["ethane", "2.0266", "0.39"]], acc="PSI-159", file="CFI-G_Normal Flames.csv")
        pts = {p["a"]: p for p in E.envelope({"a": flex, "b": cfi, "c": cfig})["points"]}
        self.assertAlmostEqual(pts["PSI-69"]["p"], 101.33, places=1)       # mmHg
        self.assertAlmostEqual(pts["PSI-39"]["p"], 50.66, places=1)        # atm, written in the cell
        self.assertAlmostEqual(pts["PSI-159"]["p"], 202.66, places=1)      # bar


class Matrix(unittest.TestCase):
    """The matrix may not claim more than its evidence, and a playbook step must be documented."""

    def doc(self):
        from zgf import validate as V
        quote = {"kind": "quote", "quote": "x", "quote_verified": True, "ref": {"ledger_seq": 1}}
        return V, {"phases": [{"id": "spread"}], "pillars": ["suppression"], "words": {"evidence": "", "bounded": "", "gap": "", "na": ""},
                   "cells": [{"id": "a", "phase": "spread", "pillar": "suppression", "iss": "evidence", "lunar": "gap", "items": [quote]}],
                   "playbook": [{"id": "s", "documented": [quote], "cells": ["a"], "iss": "supported", "lunar": "gap"}]}

    def test_a_sound_matrix_passes(self):
        V, mx = self.doc()
        self.assertEqual(V.matrix(mx), 2)

    def test_measured_needs_a_measurement_or_a_checked_quotation(self):
        V, mx = self.doc()
        mx["cells"][0]["items"] = [{"kind": "reading", "text": "we think so"}]
        with self.assertRaises(V.IntegrityError):
            V.matrix(mx)
        mx["cells"][0]["items"] = [{"kind": "quote", "quote": "x", "quote_verified": False, "ref": {}}]
        with self.assertRaises(V.IntegrityError):
            V.matrix(mx)

    def test_an_invented_step_stops_the_build(self):
        V, mx = self.doc()
        mx["playbook"][0]["documented"] = [{"kind": "reading", "text": "a step we made up"}]
        with self.assertRaises(V.IntegrityError):
            V.matrix(mx)

    def test_no_step_is_supported_in_lunar_gravity_and_no_step_names_a_missing_behaviour(self):
        V, mx = self.doc()
        mx["playbook"][0]["lunar"] = "supported"
        with self.assertRaises(V.IntegrityError):
            V.matrix(mx)
        V, mx = self.doc()
        mx["playbook"][0]["cells"] = ["nowhere"]
        with self.assertRaises(V.IntegrityError):
            V.matrix(mx)

    def test_the_built_matrix(self):
        import json
        p = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web", "public", "data", "v1", "matrix.json")
        if not os.path.exists(p):
            self.skipTest("no derived data in this checkout")
        mx = json.load(open(p, encoding="utf-8"))
        self.assertEqual(mx["coverage"]["lunar"]["evidence"], 0)          # PSI holds no partial-gravity rows
        self.assertEqual(mx["playbook_coverage"]["lunar"]["supported"], 0)
        self.assertTrue(all(s["lunar_basis"] for s in mx["playbook"]))    # every lunar badge says where its evidence was taken
        self.assertEqual({c["phase"] for c in mx["cells"]}, {p["id"] for p in mx["phases"]})


class Briefs(unittest.TestCase):
    """An AI brief may not bring in a number the record does not hold, nor a verdict."""

    def setUp(self):
        from zgf import briefs as B
        self.B = B
        self.inv = {"accession": "PSI-0", "title": "Burning of solids", "acronym": "X", "objective": "Burn rods at 17 percent oxygen.", "approach": "", "hypothesis": "",
                    "impacts": "", "hardware": "Glovebox", "platform": "ISS", "scope": {"in_scope": True, "reason": ""}, "tables": [{"artifact": "t", "rows": 129}]}
        self.prof = {"t": {"columns": [{"name": "Flow (cm/s)", "role": "varied"}]}}

    def test_a_brief_that_stays_inside_the_record_passes(self):
        ok = {"what": "Rods burned at 17 percent oxygen.", "why": "Its 129 rows record flow."}
        self.assertEqual(self.B.check("PSI-0", ok, self.inv, self.prof, set()), [])

    def test_a_number_the_record_does_not_hold_is_caught(self):
        bad = {"what": "Rods burned at 21 percent oxygen.", "why": "Its 129 rows record flow."}
        self.assertIn("holds a number the record does not hold: 21", self.B.check("PSI-0", bad, self.inv, self.prof, set()))

    def test_a_verdict_is_caught(self):
        bad = {"what": "Rods burned at 17 percent oxygen.", "why": "The material is safe in a cabin."}
        self.assertTrue(any("verdict" in p for p in self.B.check("PSI-0", bad, self.inv, self.prof, set())))

    def test_unknown_or_excluded_records_and_invented_curator_notes_are_caught(self):
        ok = {"what": "Rods burned.", "why": "The curator report flags its dates."}
        self.assertEqual(self.B.check("PSI-9", ok, None, self.prof, set()), ["no such record"])
        self.assertIn("leans on a curator note that does not exist for this record", self.B.check("PSI-0", ok, self.inv, self.prof, set()))
        self.assertEqual(self.B.check("PSI-0", ok, self.inv, self.prof, {"PSI-0"}), [])
        out = dict(self.inv, scope={"in_scope": False, "reason": ""})
        self.assertEqual(self.B.check("PSI-0", ok, out, self.prof, set()), ["the record is set aside as not combustion science"])


class Facets(unittest.TestCase):
    """The pillar marks follow written rules on what a record set out to do, not on passing mentions."""

    def setUp(self):
        from zgf import rank as R
        self.of = R.pillars_of

    def test_a_smoke_point_is_a_soot_property_not_detection(self):
        self.assertEqual(self.of("Smoke Point In Co-flow Experiment", "Find the smoke point of gas jet flames."), [])
        self.assertEqual(self.of("Smoke Aerosol Measurement Experiment", "Measure smoke particles."), ["detection"])

    def test_suppression_needs_the_title_or_named_suppressants(self):
        self.assertEqual(self.of("Flame Extinguishment Experiment", "Burn droplets."), ["suppression"])
        self.assertEqual(self.of("Cool Flames Investigation", "Study how droplets burn and reach extinction."), [])
        self.assertEqual(self.of("Droplet burning", "Rate the effectiveness of fire suppressants."), ["suppression"])

    def test_a_record_may_serve_two_pillars_or_none(self):
        self.assertEqual(self.of("Burning and Suppression of Solids", "Study flammability and flame spread."), ["prevention", "suppression"])
        self.assertEqual(self.of("Flame Design", "Study soot inception in spherical flames."), [])


class OxygenCoverage(unittest.TestCase):
    """The coverage chart counts every placed row once and accounts for every row it cannot place."""

    def setUp(self):
        from zgf import lessons as Ls
        self.Ls = Ls
        pt = lambda s, a, t, r, x, p=None: {"s": s, "a": a, "t": t, "r": r, "x": x, "p": p, "f": ""}
        self.env = {"series": [{"id": "S", "kind": "solid"}, {"id": "D", "kind": "droplet"}],
                    "points": [pt("S", "PSI-1", "t1", 0, 0.175), pt("S", "PSI-1", "t1", 1, 0.2095), pt("D", "PSI-2", "t2", 0, 0.30, 70.0)],
                    "near_presets": [{"id": "iss", "label": "ISS cabin", "x_o2": 0.2095, "p_kpa": 101.325}],
                    "gravity_counts": {"micro": 3, "partial": 0}}
        tb = lambda acc, art, file, cols, n: {"accession": acc, "artifact": art, "file": file, "columns": cols, "rows": [[""] * len(cols)] * n}
        self.tables = [tb("PSI-1", "t1", "solids.csv", ["Percent O2"], 3), tb("PSI-2", "t2", "drops.csv", ["Oxygen"], 1),
                       tb("PSI-3", "t3", "x_Inverse Flame.csv", ["XO2"], 5), tb("PSI-4", "t4", "matrix.csv", ["Oxygen Conc (percent)"], 2),
                       tb("PSI-5", "t5", "jets.csv", ["Fuel", "CO2 ppm"], 4)]

    def test_halves_go_upward_and_every_row_is_accounted_for(self):
        c = self.Ls.coverage(self.env, self.tables)
        self.assertEqual({k: {p: x["n"] for p, x in v.items()} for k, v in c["cells"].items()}, {"solid": {"18": 1, "21": 1}, "droplet": {"30": 1}, "gas": {}})
        self.assertEqual((c["placed"], c["total"]), (3, 15))
        self.assertEqual({x["id"]: x["rows"] for x in c["not_placed"]}, {"none": 4, "inverse": 5, "listed": 2, "empty": 1})
        self.assertEqual([r["rows"] for r in c["regimes"]], [3, 0])
        self.assertEqual(c["kinds"][0]["with_pressure"], 0)

    def test_a_row_that_is_neither_placed_nor_explained_stops_the_build(self):
        self.env["points"].append({"s": "S", "a": "PSI-9", "t": "t9", "r": 0, "x": 0.21, "p": None, "f": ""})
        with self.assertRaises(ValueError):
            self.Ls.coverage(self.env, self.tables)

    def test_the_integrity_check_catches_a_square_that_gains_a_row(self):
        from zgf import validate as V
        c = self.Ls.coverage(self.env, self.tables)
        self.assertEqual(V.cover(c, self.env, 15), 4)
        c["cells"]["solid"]["18"]["n"] += 1
        with self.assertRaises(V.IntegrityError):
            V.cover(c, self.env, 15)


class Droplets(unittest.TestCase):
    """Four cells of a row go in, one ratio comes out; a row that lacks a cell is counted with its reason."""

    def setUp(self):
        from zgf import droplets as D
        self.D = D
        cols = list(D.COLS.values())
        mk = lambda **kw: [str(kw.get(k, "")) for k in D.COLS]
        self.table = {"columns": cols, "rows": [
            mk(fuel="Methanol", x=0.21, p=760, he=0, co2=0, d0=2.0, de=1.0, k=0.5, tb=6.0, end="Extinction"),      # (4 - 1) / 0.5 = 6 s
            mk(fuel="Methanol", x=0.21, p=760, he=0, co2=0, d0=2.0, de=1.0, k=0.5, tb=7.5, end="Extinction"),      # ratio 0.8
            mk(fuel="Heptane", x=0.30, p=380, he=0.3, co2=0, d0=3.0, de="", k=0.6, tb=5.0, end="Disruption"),      # no extinction diameter
            mk(fuel="Heptane", x=0.18, p=760, he=0, co2=0.2, d0=3.0, de=3.0, k=0.6, tb=1.0, end="Extinction"),     # went out at once
        ]}

    def test_the_law_reproduces_a_row_that_obeys_it(self):
        self.assertAlmostEqual(self.D.d2_time(2.0, 1.0, 0.5), 6.0)
        res = self.D.check(self.D.read(self.table))
        self.assertEqual((res["n_rows"], res["n_usable"]), (4, 2))
        self.assertEqual(res["within"], {"10": 1, "20": 2, "30": 2})
        self.assertEqual({x["why"]: x["rows"] for x in res["not_usable"]},
                         {"no diameter at which the visible flame went out": 1, "the flame went out at the initial diameter or above it": 1})

    def test_rates_are_grouped_by_fuel_and_whole_percent_for_nitrogen_only(self):
        res = self.D.check(self.D.read(self.table))
        self.assertEqual(res["rate_by_oxygen"], [{"fuel": "Methanol", "pct": 21, "n": 2, "median": 0.5, "min": 0.5, "max": 0.5}])

    def test_pressure_is_converted_and_the_diluent_named(self):
        rows = self.D.read(self.table)
        self.assertAlmostEqual(rows[0]["p"], 101.33, places=1)
        self.assertEqual([r["dil"] for r in rows], ["", "", "helium", "carbon dioxide"])

    def test_a_missing_column_stops_the_build(self):
        with self.assertRaises(ValueError):
            self.D.read({"columns": ["Fuel"], "rows": []})


if __name__ == "__main__":
    unittest.main()


class Recording(unittest.TestCase):
    """A two-stream file like NASA's: the experiment writes each second, the vehicle now and then, and each leaves the other's columns at a fixed value."""

    def file(self, fire_peak=1.8):
        from zgf import recorded as R
        head = [R.TIME, "SaffireTimestamp"] + R.RADIOMETERS + R.ANEMOMETERS + [R.WIRE, R.IGNITER["S1"], R.IGNITER["S2"], R.SCATTER, R.OBSCURATION] + R.OTHER_DETECTOR + list(R.CABIN.values())
        off = {**{r: -4000.0 for r in R.RADIOMETERS}, **{a: -76.0 for a in R.ANEMOMETERS}, R.WIRE: -3.0, R.IGNITER["S1"]: -3.0, R.IGNITER["S2"]: -3.0}
        rows = []
        t0 = 1496691300000
        for s in range(0, 1300):
            own = dict(off)
            if s >= 100:                                            # the experiment is powered from 100 s
                flame = max(0.0, 150.0 - abs(s - 800) * 1.5) if s >= 700 else 0.0
                own.update({r: -17.0 + flame for r in R.RADIOMETERS})
                own.update({a: 24.0 for a in R.ANEMOMETERS})
                own[R.WIRE] = 0.5 if 300 <= s < 310 else 0.0
                own[R.IGNITER["S2"]] = 0.9 if 500 <= s < 507 else 0.0
                own[R.IGNITER["S1"]] = 0.9 if 700 <= s < 707 else 0.0
            rows.append([t0 + 1000 * s, 0] + [own[h] for h in head[2:11]] + [0] * (len(head) - 11))
            if s % 10 == 5:                                         # a vehicle row: the experiment's columns hold their power-off values
                sc = 0.02
                if 320 <= s < 340: sc = 1.6
                if 760 <= s: sc = min(fire_peak, 0.1 + (s - 760) * 0.01) if s < 1000 else 0.4
                veh = {R.SCATTER: sc, R.OBSCURATION: 3.8, R.CABIN["pressure"]: 14.0, R.CABIN["temperature"]: 20.0, R.CABIN["fan"]: 100.0}
                rows.append([t0 + 1000 * s + 400, 0] + [off[h] for h in head[2:11]] + [veh.get(h, 0) for h in head[11:]])
        rows.append([-62135597038000, 0] + [0] * (len(head) - 2))  # NASA's file ends with a row dated year 1
        return ("\n".join(",".join(str(x) for x in r) for r in [head] + rows)).encode("utf-8")

    def test_events_peaks_and_the_two_streams(self):
        from zgf import recorded as R
        d = R.read(self.file())
        self.assertEqual(len(d["aside"]), 1)
        a = R.analyse(d)
        ev = {e["id"]: e["t"] for e in a["events"]}
        self.assertEqual((ev["S1"], ev["S2"], ev["wire1"]), (0.0, -200.0, -400.0))
        self.assertEqual({r["baseline"] for r in a["radiometers"]}, {-17.0})                    # the vehicle's rows do not drag the baseline to -4000
        self.assertEqual({(r["peak"], r["peak_t"]) for r in a["radiometers"]}, {(133.0, 100.0)})
        s = a["scatter"]
        self.assertEqual((s["quiet"]["max"], s["wire"]["peak"], s["fire"]["peak"]), (0.02, 1.6, 1.8))
        self.assertEqual(s["wire"]["above_mark_s"], 20.0)
        self.assertGreater(s["fire"]["above_mark_s"], 5 * s["wire"]["above_mark_s"])
        self.assertEqual(s["typical_step_s"], 10.0)

    def test_two_firings_of_one_igniter_stop_the_build(self):
        from zgf import recorded as R
        d = R.read(self.file())
        col = d["cols"][R.IGNITER["S1"]]
        for i, t in enumerate(d["t"]):
            if 900 <= t < 905 and col[i] == 0.0:
                col[i] = 0.9
        with self.assertRaises(ValueError):
            R.analyse(d)


class Reported(unittest.TestCase):
    class Lib:
        def __init__(self, pages): self.pages = pages
        def units(self, key): return [{"loc": "p. %d" % (i + 1), "text": t} for i, t in enumerate(self.pages.get(key, []))]
        def ref(self, key, where=None): return {"ledger_seq": 1, "sha256": "x", "url": "u", "loc": (where or {}).get("loc")}

    T1 = ("Table 1. Saffire IV-VI Sample Test Conditions considered in this paper.\nFlight/Sample IV-1 V-2 VI-2 VI-3 VI-4\nMaterial SIBAL Cloth\nLength (cm) 50  50 50 18 18\n"
          "Air Flow Rate (cm/s) 20 20 20 20 20\nFlow Direction Concurrent Concurrent Concurrent Concurrent Concurrent\nAmbient Pressure (kPa) 100.0 70.7 54.1 54.6 55.2\n"
          "Oxygen Concentration (mol %)\n22.0 26.2 31.0 30.3 28.8\nFree volume (m3) 17.9 19.0 16.7 16.7 16.7\n")
    T2 = ("Table 2. Saffire IV-VI Heat release and increase of carbon oxides*.\nMax Temp\nat SFU outlet (°C)\nMax Temp at FFD or nearest location\n(°C)\nFFD inlet CO2\nincrease (ppm)\n"
          "CO2 partial pressure increase (mmHg)\nFFD inlet CO increase (ppm)\nIV-1 SIBAL 130\n3,150 409 45 25 1390 1.03 80\nV-2 Cotton Jersey\n2,800 560 46 23 2360 1.26 83\n"
          "VI-2 SIBAL 112 3217 580 3,650 409 48 20 2800 1.15 120\nVI-3 2-sided PMMA\n780 3080 1280\n77 21 8539 3.51 308\nVI-4 1-sided PMMA\n1200 1507 830\n57 21 %s 3.37 320\n*Empty fields were cases where the data were not available.")
    T3 = ("For carbon monoxide, NASA establishes a Spacecraft Maximum Allowed Concentration (SMAC) value based on the exposure duration. For carbon monoxide, the 1-hour SMAC is 425 ppm, and the 24-hour SMAC is 100 ppm7. "
          "NASA-STD-30018 which limits the 1-hour average CO2 partial pressure to no more than 3 mm Hg. Selecting 1 mg/m3 as a relatively tight alarm threshold, the FFD detector reached that threshold at 981 seconds. "
          "The flow was changed from 20 cm/s to 5 cm/s at 1120 s and terminated at 1420 s.")

    def lib(self, co2="8117"):
        from zgf import reported as P
        return self.Lib({P.SAFFIRE: [self.T1, self.T2 % co2, self.T3]})

    def test_the_tables_are_read_from_the_text(self):
        from zgf import reported as P
        s = P.saffire(self.lib())
        self.assertEqual([r["id"] for r in s["rows"]], ["IV-1", "V-2", "VI-2", "VI-3", "VI-4"])
        self.assertEqual([r["material"] for r in s["rows"]], ["SIBAL", "Cotton Jersey", "SIBAL", "2-sided PMMA", "1-sided PMMA"])
        self.assertEqual([(r["o2_pct"], r["p_kpa"], r["co_ppm"], r["co2_mmhg"], r["t_outlet_c"]) for r in s["rows"]][3], (30.3, 54.6, 308.0, 3.51, 77.0))
        self.assertEqual((s["limits"]["co_1h_ppm"], s["limits"]["co2_1h_mmhg"], s["alarm"]["t_s"], s["alarm"]["flow_reduced_s"]), (425.0, 3.0, 981.0, 1120.0))
        self.assertTrue(all(c["ok"] for c in s["checks"]))

    def test_a_number_that_disagrees_with_its_own_row_fails_its_check(self):
        from zgf import reported as P
        s = P.saffire(self.lib(co2="9917"))                          # parts per million no longer match the millimetres of mercury beside them
        self.assertFalse(all(c["ok"] for c in s["checks"]))

    def test_a_missing_table_stops_the_build(self):
        from zgf import reported as P
        with self.assertRaises(P.ReportedError):
            P.saffire(self.Lib({P.SAFFIRE: [self.T1.replace("Ambient Pressure (kPa) 100.0", "Ambient Pressure (kPa) n/a"), self.T2 % "8117", self.T3]}))

    def test_spin_gives_lunar_gravity(self):
        from zgf import reported as P
        pages = {P.LUCI: ["SIBAL Flame Spread Fit Comparison\nFlame Spread Rates (from linear fits):\nPartial- G (mm/s)\n1-G (mm/s)\nRatio\nFlame Base\n.9 1.5 .6\nFlame Tip\n1.1 2.8 .39",
                          "PMMA Flame Tip Comparison\nPartial-G (cm/s)\n1-G (cm/s)\nRatio\n.15 .40 .38\nFlame Tip Spread (from linear fits):",
                          "A steady vehicle rotation of 11 RPM is established, with an effective radius of rotation of 1.22 m at the experiment location."],
                 P.LUNAR_SLIDES: ["Upward Spread\nLunar-g = 0.165 gE\n2-cm-wide SIBAL fabric"]}
        d = P.luci(self.Lib(pages))
        self.assertEqual([(r["lunar"], r["earth"], r["ratio"]) for r in d["rows"]], [(0.9, 1.5, 0.6), (1.1, 2.8, 0.39), (1.5, 4.0, 0.38)])
        self.assertEqual(d["spin"]["g"], 0.165)
        self.assertTrue(all(c["ok"] for c in d["checks"]))

    def test_the_four_planned_tests(self):
        from zgf import reported as P
        page = ("Initial Chamber Conditions\nTest 1: 8.2 psia (+/- 0.3 psi), 37% O2 , balance nitrogen) Test 2: 8.2 psia (+/- 0.3 psi), 33% O2 , balance nitrogen) "
                "Test 3: 8.2 psia (+/- 0.3 psi), 29% O2 , balance nitrogen) Test 4: 8.2 psia (+/- 0.3 psi), 25% O2 , balance nitrogen)")
        d = P.fm2(self.Lib({P.LUNAR_SLIDES: [page]}))
        self.assertEqual([(t["o2_pct"], t["p_psia"]) for t in d["tests"]], [(37.0, 8.2), (33.0, 8.2), (29.0, 8.2), (25.0, 8.2)])
        with self.assertRaises(P.ReportedError):
            P.fm2(self.Lib({P.LUNAR_SLIDES: [page.replace("Test 4: 8.2 psia (+/- 0.3 psi), 25% O2", "Test 4: to be decided")]}))


class Holdings(unittest.TestCase):
    def test_folders_and_documents_of_a_record(self):
        from zgf import derive_core as C
        mk = lambda n, name, role="supporting_file", size=10: {"kind": "psi_file", "accession": "PSI-9", "key": "psi:file:PSI-9:" + name, "file_name": name, "role": role, "size": size,
                                                                "seq": n, "sha256": "h%d" % n, "url": "u"}
        es = [mk(1, "PSI-9_Experimental table_T.csv", "experimental_table"), mk(2, "PSI-9_Raw Data_a.txt"), mk(3, "PSI-9_Raw Data_b.txt"), mk(4, "PSI-9_Reports_Final Report.pdf", size=500),
              {**mk(5, "PSI-8_Reports_other.pdf"), "accession": "PSI-8"}]
        docs, held = C.held(es, {e["key"]: e for e in es}, "PSI-9")
        self.assertEqual([d["file"] for d in docs], ["PSI-9_Reports_Final Report.pdf"])
        self.assertEqual((held["files"], held["bytes"], held["folders"]["Raw Data"]["files"], held["documents"]), (4, 530, 2, 1))
        self.assertEqual(C.folder_of("PSI-9", "PSI-9_Science Documents_BASS-II_ReadMe.docx"), "Science Documents")


class PagedText(unittest.TestCase):
    def test_a_report_stored_page_by_page_is_addressed_by_page(self):
        from zgf.literature import tika_pages
        x = '<html><body><div class="page"><p>First page,\n</p><p>two lines.</p></div>\n<div class="page"><p>Second &amp; last.</p></div></body></html>'
        self.assertEqual(tika_pages(x), ["First page,\ntwo lines.", "Second & last."])
        self.assertEqual(tika_pages("plain text of an older report"), [])
