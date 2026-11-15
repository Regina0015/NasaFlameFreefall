import contextlib
import copy
import hashlib
import io
import json
import re
import tempfile
import unittest
from pathlib import Path

from scripts import push_findings as push
from scripts.paths import FINDINGS_DIR, ROOT

FINDING = json.loads((FINDINGS_DIR / "F-001.json").read_text(encoding="utf-8"))


def _write(dir_: Path, fid: str, grade: str | None, sha_ok: bool = True) -> dict:
    """A finding file and, unless grade is None, an Auditor verdict for it."""
    finding = copy.deepcopy(FINDING)
    finding["id"] = fid
    path = dir_ / "findings" / f"{fid}.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(finding, indent=2) + "\n", encoding="utf-8", newline="\n")
    if grade is not None:
        sha = hashlib.sha256(path.read_bytes()).hexdigest() if sha_ok else "0" * 64
        verdict = {"finding_id": fid, "finding_version": finding["version"], "finding_sha256": sha, "grade": grade,
                   "reasons": [f"{grade} because"], "checks": [], "audited_by": {"date": "2026-11-15T09:29:14Z"}}
        audits = dir_ / "audits"
        audits.mkdir(exist_ok=True)
        (audits / f"{fid}.json").write_text(json.dumps(verdict), encoding="utf-8")
    return finding


class RowsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def rows(self):
        return push.rows(self.dir / "findings", self.dir / "audits")

    def test_only_audited_findings_that_are_not_rejected_are_published(self):
        _write(self.dir, "F-001", "C")
        _write(self.dir, "F-002", "rejected")
        _write(self.dir, "F-003", None)
        rows, left_out = self.rows()
        self.assertEqual([r["id"] for r in rows], ["F-001"])
        self.assertEqual(len(left_out), 2)
        self.assertIn("F-002", left_out[0])
        self.assertIn("rejected", left_out[0])
        self.assertIn("F-003", left_out[1])

    def test_a_verdict_for_other_bytes_is_not_published(self):
        _write(self.dir, "F-001", "B", sha_ok=False)
        rows, left_out = self.rows()
        self.assertEqual(rows, [])
        self.assertIn("F-001", left_out[0])

    def test_row_is_the_finding_plus_its_grade(self):
        finding = _write(self.dir, "F-001", "A")
        (row,), _ = self.rows()
        for column in push.FINDING_COLUMNS:
            self.assertEqual(row[column], finding[column], column)
        self.assertEqual(row["grade"], "A")
        self.assertEqual(row["grade_reasons"], ["A because"])
        self.assertEqual(row["audited_at"], "2026-11-15T09:29:14Z")
        self.assertEqual(row["audit"]["finding_sha256"], row["finding_sha256"])

    def test_a_broken_finding_file_stops_with_a_message_before_any_request(self):
        (self.dir / "findings").mkdir()
        (self.dir / "findings" / "F-001.json").write_text("{not json", encoding="utf-8")
        err = io.StringIO()
        with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
            code = push.main([], self.dir / "findings", self.dir / "audits")
        self.assertEqual(code, 1)
        self.assertIn("stopped", err.getvalue())
        self.assertIn("F-001.json", err.getvalue())

    def test_columns_are_the_findings_table_of_schema_sql(self):
        sql = (ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8")
        body = re.search(r"create table if not exists findings \((.*?)\n\);", sql, re.S).group(1)
        columns = [m.group(1).strip('"') for m in re.finditer(r"^\s+(\"?\w+\"?)\s+\w", body, re.M)
                   if m.group(1) != "primary"]
        self.assertEqual(columns, list(push.FINDING_COLUMNS + push.AUDIT_COLUMNS))


def _row(fid="F-001", version=2, grade="C", sha="s1"):
    return {"id": fid, "version": version, "grade": grade, "finding_sha256": sha, "audit": {"grade": grade}}


class ChangesTest(unittest.TestCase):
    def test_same_file_and_audit_means_nothing_to_send(self):
        self.assertEqual(push.changes([_row()], [_row()]), ([], []))

    def test_new_row_or_new_grade_is_sent(self):
        upsert, delete = push.changes([_row(grade="C")], [_row(grade="B"), _row("F-004")])
        self.assertEqual([(r["id"], r["grade"]) for r in upsert], [("F-001", "B"), ("F-004", "C")])
        self.assertEqual(delete, [])

    def test_rows_no_longer_published_are_deleted(self):
        upsert, delete = push.changes([_row(), _row("F-015", 1), _row(version=1)], [_row()])
        self.assertEqual(upsert, [])
        self.assertEqual(delete, [("F-001", 1), ("F-015", 1)])

    def test_apply_sends_rows_then_deletes(self):
        calls = []
        push.apply([_row()], [("F-015", 1)], lambda rows: calls.append(("upsert", rows)),
                   lambda fid, version: calls.append(("delete", fid, version)))
        self.assertEqual(calls, [("upsert", [_row()]), ("delete", "F-015", 1)])

    def test_apply_with_nothing_to_send_makes_no_request(self):
        calls = []
        push.apply([], [], calls.append, lambda *a: calls.append(a))
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
