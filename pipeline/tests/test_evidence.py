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


if __name__ == "__main__":
    unittest.main()


class Quotations(unittest.TestCase):
    def test_a_quotation_is_found_only_if_the_document_holds_it(self):
        from zgf.literature import Library, norm
        lib = Library("", {})
        lib._cache["d"] = [{"loc": "p. 34", "page": 34, "text": "34\nfire safety. 2. A fire will self-extin-\nguish if ventila"}, {"loc": "p. 35", "page": 35, "text": "35\ntion is shut off. 3. B ecause the gravity"}]
        self.assertEqual(lib.find("d", "A fire will self-extinguish if")["loc"], "p. 34")                       # line-end hyphenation is undone
        self.assertEqual(lib.find("d", "Because the gravity")["match"], "ignoring spaces")                        # a word split by the PDF
        self.assertIsNone(lib.find("d", "A fire will always self-extinguish"))                                    # a changed word is not a quotation
        self.assertEqual(norm("“It’s  20–30 cm”"), '"it\'s 20-30 cm"')
