"""K03: a signed release verifies, and a changed artifact or signature fails."""
import base64
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, "..", "..", "tools", "release", "sign_release.py")
spec = importlib.util.spec_from_file_location("sign_release", SCRIPT)
sr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sr)


class Release(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.out = os.path.join(self.tmp, "v1")
        os.makedirs(self.out)
        a = b'{"x":1}'
        import hashlib
        open(os.path.join(self.out, "a.json"), "wb").write(a)
        json.dump({"brand": "Zero-G Firewall", "artifacts": {"a.json": {"sha256": hashlib.sha256(a).hexdigest(), "bytes": len(a), "klass": "derived"}}}, open(os.path.join(self.out, "manifest.json"), "w"))
        self.key = os.path.join(self.tmp, "keys", "k.pem")

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def sign(self):
        return subprocess.run([sys.executable, SCRIPT, "--key", self.key, "--out", self.out], capture_output=True, text=True)

    def test_sign_and_verify(self):
        r = self.sign()
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(sr.verify(self.out), [])
        pk = json.load(open(os.path.join(self.out, "release", "pubkey.json")))
        self.assertNotIn("PRIVATE", json.dumps(pk))

    def test_changed_artifact_fails(self):
        self.sign()
        open(os.path.join(self.out, "a.json"), "wb").write(b'{"x":2}')
        self.assertIn("changed: a.json", sr.verify(self.out))

    def test_changed_signature_fails(self):
        self.sign()
        p = os.path.join(self.out, "release", "release.sig")
        sig = bytearray(base64.b64decode(open(p).read()))
        sig[0] ^= 1
        open(p, "w").write(base64.b64encode(bytes(sig)).decode())
        self.assertIn("signature does not verify over release.json", sr.verify(self.out))

    def test_refuses_key_inside_repo(self):
        r = subprocess.run([sys.executable, SCRIPT, "--key", os.path.join(HERE, "k.pem"), "--out", self.out], capture_output=True, text=True)
        self.assertEqual(r.returncode, 2)
        self.assertFalse(os.path.exists(os.path.join(HERE, "k.pem")))


if __name__ == "__main__":
    unittest.main()
