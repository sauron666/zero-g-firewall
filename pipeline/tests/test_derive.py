"""
Plumbing tests for the ledger and the first derivation stage.
They build a throw-away raw cache in a temporary folder. Its contents are labelled test fixtures:
they are not NASA data and never leave the temporary folder.
"""
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from zgf import ledger as L, derive_core


def make_cache(root: str):
    entries = []

    def add(key, kind, relpath, body: bytes, **meta):
        path = os.path.join(root, relpath)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(body)
        e = {"key": key, "kind": kind, "url": "https://example.invalid/" + relpath, "final_url": "", "status": 200,
             "sha256": L.sha256(body), "size": len(body), "content_type": "", "http_date": "", "last_modified": "", "etag": "",
             "retrieved_at_utc": "2026-11-14T10:00:00Z", "local_path": relpath, **meta}
        prev = entries[-1]["entry_hash"] if entries else "0" * 64
        e["seq"] = len(entries); e["prev_hash"] = prev
        s = json.dumps(e, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        e["entry_hash"] = L.sha256((prev + s).encode("utf-8"))
        entries.append(e)

    search = {"hits": {"total": 2, "hits": [
        {"_source": {"Accession": "PSI-9001", "Title": "TEST FIXTURE A", "Research Area": "Combustion Science", "Project Type": "Microgravity Investigation"}},
        {"_source": {"Thumbnail": "/geode-py/ws/investigations/PSI-9002/image", "Title": "TEST FIXTURE B"}}]}}
    add("psi:search:combustion", "psi_search", "psi/search_combustion.json", json.dumps(search).encode(), term="combustion")
    meta_a = {"accession": "PSI-9001", "title": "TEST FIXTURE A", "investigationAcronym": "FIX-A", "researchArea": "Combustion Science",
              "projectType": "Microgravity Investigation", "experimentHardware": "Test rig with ACME insert", "version": 3,
              "investigationStartDate": "08-01-2007", "doi": "10.0000/fixture", "licenseIdentifier": "CC0-1.0",
              "contacts": [{"firstName": "Test", "lastName": "Person", "email": "do-not-publish@example.invalid", "roles": [{"annotationValue": "Principal Investigator (PI)"}]}],
              "publications": [{"title": "A fixture paper", "authorList": "T Person", "doi": ""}], "related_glds": "PSI-9002",
              "experimentalTable": [{"file_name": "PSI-9001_Experimental table_FIX.csv", "file_size": 60, "version": 1}],
              "added": [{"file_name": "a.mp4", "file_size": 5e6, "remote_path": "/Home/psi-data/PSI-9001/Raw Data/a.mp4"},
                        {"file_name": "b.csv", "file_size": 100.0, "remote_path": "/Home/psi-data/PSI-9001/Analyzed Data/b.csv"}], "totalFileSize": 5000100.0}
    add("psi:meta:PSI-9001", "psi_meta", "psi/investigations/PSI-9001.json", json.dumps(meta_a).encode(), accession="PSI-9001")
    meta_b = {"accession": "PSI-9002", "title": "TEST FIXTURE B", "researchArea": "Materials Science", "projectType": "Ground Investigation"}
    add("psi:meta:PSI-9002", "psi_meta", "psi/investigations/PSI-9002.json", json.dumps(meta_b).encode(), accession="PSI-9002")
    # byte 0x96 is the Windows-1252 en dash that the FLEX table uses for "no value"
    table = b"Test #,O initial ambient composition; mole frac,Note\r\n1,0.21,\x96\r\n2,0.18,ok\r\n,,\r\n"
    add("psi:file:PSI-9001:t", "psi_file", "psi/files/PSI-9001/PSI-9001_Experimental table_FIX.csv", table,
        accession="PSI-9001", file_name="PSI-9001_Experimental table_FIX.csv", role="experimental_table", psi_file_version=1)
    add("doc:researchers_guide", "official", "official/researchers_guide.pdf", b"%PDF fixture", resource_id="R4", doc_id="researchers_guide")
    os.makedirs(os.path.join(root, "ledger"), exist_ok=True)
    with open(os.path.join(root, "ledger", "ledger.jsonl"), "w", encoding="utf-8") as fh:
        for e in entries:
            fh.write(json.dumps(e, sort_keys=True, ensure_ascii=False) + "\n")
    return entries


class Derive(unittest.TestCase):
    def test_end_to_end_on_a_fixture_cache(self):
        with tempfile.TemporaryDirectory() as raw, tempfile.TemporaryDirectory() as out:
            make_cache(raw)
            res = derive_core.run(raw, out)
            inv = json.load(open(os.path.join(out, "investigations.json"), encoding="utf-8"))["items"]
            a = next(i for i in inv if i["accession"] == "PSI-9001")
            b = next(i for i in inv if i["accession"] == "PSI-9002")
            self.assertTrue(a["scope"]["in_scope"]); self.assertFalse(b["scope"]["in_scope"])
            self.assertEqual(a["start"], "2007-08-01"); self.assertEqual(a["hardware_family"], "CIR_ACME"); self.assertEqual(b["hardware_family"], "GROUND")
            self.assertEqual(a["files"]["count"], 2); self.assertIn("Raw Data", a["files"]["by_folder"])
            self.assertNotIn("email", json.dumps(a))                       # contact e-mail addresses are not republished
            self.assertEqual(a["refs"]["objective"]["field"], "objective")
            t = json.load(open(os.path.join(out, a["tables"][0]["artifact"]), encoding="utf-8"))
            self.assertEqual((t["n_rows"], t["n_cols"], t["encoding"]), (2, 3, "windows-1252"))
            self.assertEqual(t["rows"][0][2], "–")                    # the 'no value' dash stays a dash, never a zero
            self.assertTrue(any(f["kind"] == "encoding" for f in t["findings"]))
            idx = json.load(open(os.path.join(out, "ledger_index.json"), encoding="utf-8"))
            self.assertEqual(idx["entries"], len(open(os.path.join(out, "ledger.jsonl"), encoding="utf-8").read().splitlines()))
            self.assertIn(a["tables"][0]["ledger_seq"], idx["used"])           # the build records which files it read
            from zgf import derive_evidence
            ev = derive_evidence.run(out)                                       # the second stage runs on the first stage's output
            self.assertIn("encoding", ev["findings"])
            self.assertTrue(os.path.exists(os.path.join(out, "profiles.json")) and os.path.exists(os.path.join(out, "envelope.json")))
            self.assertEqual(res["nasa"]["table_rows"], 2); self.assertEqual(res["nasa"]["investigations_excluded"], 1)
            r = json.load(open(os.path.join(out, "official_resources.json"), encoding="utf-8"))["items"]
            self.assertTrue(r[3]["in_ledger"]); self.assertFalse(r[4]["in_ledger"])
            self.assertEqual(res["nasa"]["official_resources_used"], 1)   # only R1 has a use so far

    def test_a_changed_byte_stops_the_build(self):
        with tempfile.TemporaryDirectory() as raw, tempfile.TemporaryDirectory() as out:
            make_cache(raw)
            p = os.path.join(raw, "psi/files/PSI-9001/PSI-9001_Experimental table_FIX.csv")
            b = bytearray(open(p, "rb").read()); b[10] ^= 1; open(p, "wb").write(bytes(b))
            with self.assertRaises(L.LedgerError):
                derive_core.run(raw, out)

    def test_an_edited_ledger_line_is_detected(self):
        with tempfile.TemporaryDirectory() as raw:
            entries = make_cache(raw)
            entries[1]["size"] += 1
            with self.assertRaises(L.LedgerError):
                L.verify_chain(entries)


if __name__ == "__main__":
    unittest.main()


class Integrity(unittest.TestCase):
    def test_a_planted_untraceable_row_fails_the_build(self):
        from zgf import derive_evidence, validate
        with tempfile.TemporaryDirectory() as raw, tempfile.TemporaryDirectory() as out:
            make_cache(raw)
            derive_core.run(raw, out)
            derive_evidence.run(out)
            self.assertTrue(validate.check(out)["ok"])
            p = os.path.join(out, "envelope.json")
            env = json.load(open(p, encoding="utf-8"))
            env["points"].append({"s": "planted", "a": "PSI-9001", "t": "tables/none.json", "r": 0, "x": 0.21, "p": 101.3, "f": "x"})
            json.dump(env, open(p, "w", encoding="utf-8"))
            with self.assertRaises(validate.IntegrityError):         # first because the file no longer matches the manifest
                validate.check(out)
            m = os.path.join(out, "manifest.json")
            man = json.load(open(m, encoding="utf-8"))
            import hashlib
            man["artifacts"]["envelope.json"]["sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
            json.dump(man, open(m, "w", encoding="utf-8"))
            with self.assertRaisesRegex(validate.IntegrityError, "does not exist"):   # and then because the row cannot be traced
                validate.check(out)

    def test_a_table_without_a_ledger_entry_fails_the_build(self):
        from zgf import validate
        with tempfile.TemporaryDirectory() as raw, tempfile.TemporaryDirectory() as out:
            make_cache(raw)
            derive_core.run(raw, out)
            p = os.path.join(out, "tables", "index.json")
            idx = json.load(open(p, encoding="utf-8"))
            idx["items"][0]["ledger_seq"] = 99999
            json.dump(idx, open(p, "w", encoding="utf-8"))
            m = os.path.join(out, "manifest.json")
            man = json.load(open(m, encoding="utf-8"))
            import hashlib
            man["artifacts"]["tables/index.json"]["sha256"] = hashlib.sha256(open(p, "rb").read()).hexdigest()
            json.dump(man, open(m, "w", encoding="utf-8"))
            with self.assertRaisesRegex(validate.IntegrityError, "no matching ledger entry"):
                validate.check(out)
