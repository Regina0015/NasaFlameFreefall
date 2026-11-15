import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts import findings
from scripts.audit_client import save_verdict
from scripts.audit_step import read_verdict


def finding() -> dict:
    return {"id": "F-001", "version": 2, "claim": "x"}


class SaveVerdictTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.path = findings.save(finding(), root / "findings")
        self.audits = root / "audits"
        self.sha = hashlib.sha256(self.path.read_bytes()).hexdigest()

    def tearDown(self):
        self.tmp.cleanup()

    def verdict(self, sha):
        return {"finding_id": "F-001", "finding_version": 2, "finding_sha256": sha, "grade": "C", "checks": []}

    def test_remote_verdict_is_saved_where_answer_reads_it(self):
        # /ask prints the grade with scripts.answer, which reads the local audit file.
        save_verdict(self.verdict(self.sha), self.path, self.audits)
        self.assertEqual(read_verdict(self.path, self.audits)["grade"], "C")

    def test_verdict_for_other_bytes_is_refused(self):
        with self.assertRaisesRegex(ValueError, "other bytes"):
            save_verdict(self.verdict("0" * 64), self.path, self.audits)
        self.assertFalse((self.audits / "F-001.json").exists())


if __name__ == "__main__":
    unittest.main()
