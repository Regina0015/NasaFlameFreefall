import contextlib
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts.answer import format_answer
from scripts.answer import main as answer_main
from scripts.audit_step import GRADES, PSI_DIR, auditor_command, read_verdict, run_audit
from scripts.findings import save
from scripts.paths import ROOT
from scripts.tests.helpers import NO_OFFER, fixture_finding

FIXTURES = Path(__file__).parent / "fixtures"
FINDING = fixture_finding()
PY = sys.executable
FAKE = str(FIXTURES / "fake_auditor.py")


class AuditStepTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "dir with spaces"
        self.finding_path = save(FINDING, self.dir)
        self.out = Path(self.tmp.name) / "out"
        self.verdict_path = self.out / "audits" / "F-001.json"

    def tearDown(self):
        self.tmp.cleanup()

    def fake(self):
        return [PY, FAKE, "--only", "F-001", "--findings", str(self.dir), "--out", str(self.out)]

    def verdict(self, **changes):
        data = self.finding_path.read_bytes()
        v = {"finding_id": "F-001", "finding_version": 1, "finding_sha256": hashlib.sha256(data).hexdigest(), "grade": "A"}
        self.verdict_path.parent.mkdir(parents=True, exist_ok=True)
        self.verdict_path.write_text(json.dumps({**v, **changes}), encoding="utf-8")

    def test_command_audits_one_finding_with_the_psi_files(self):
        cmd = auditor_command("F-001", self.dir, self.out)
        self.assertEqual(cmd[:2], [sys.executable, str(ROOT / "scripts" / "auditar.py")])
        for flag, value in (("--only", "F-001"), ("--findings", str(self.dir)), ("--tables", str(PSI_DIR)),
                            ("--fiches", str(PSI_DIR)), ("--out", str(self.out))):
            self.assertEqual(cmd[cmd.index(flag) + 1], value)

    def test_verdict_of_the_auditor_is_returned(self):
        v = run_audit(self.finding_path, self.fake(), self.out)
        self.assertEqual(v["grade"], "B")
        self.assertFalse((self.dir / "F-001.v1.audit.json").exists())

    def test_verdict_must_match_id_version_hash_and_grade(self):
        self.verdict()
        self.assertEqual(read_verdict(self.finding_path, self.out / "audits")["grade"], "A")
        for changes in ({"finding_id": "F-002"}, {"finding_version": 2}, {"finding_sha256": "0" * 64}, {"grade": "A+"}):
            self.verdict(**changes)
            self.assertIsNone(read_verdict(self.finding_path, self.out / "audits"), changes)
        self.verdict_path.write_text("not json", encoding="utf-8")
        self.assertIsNone(read_verdict(self.finding_path, self.out / "audits"))
        self.assertIsNone(read_verdict(self.finding_path, self.out / "missing"))

    def test_failing_auditor_is_reported(self):
        v = run_audit(self.finding_path, [PY, "-c", "import sys; sys.exit(3)"], self.out)
        self.assertEqual(v, {"finding": "F-001", "version": 1, "status": "audit failed to run", "detail": "exit code 3"})

    def test_old_verdict_is_not_reused(self):
        self.verdict()
        v = run_audit(self.finding_path, [PY, "-c", "print(1)"], self.out)
        self.assertEqual(v["status"], "audit failed to run")
        self.assertNotIn("grade", v)

    def test_stderr_tail_is_kept(self):
        v = run_audit(self.finding_path, [PY, "-c", "import sys; sys.stderr.write('x' * 600 + 'END'); sys.exit(1)"], self.out)
        self.assertTrue(v["detail"].endswith("END"))
        self.assertLessEqual(len(v["detail"]), 500)

    def test_missing_program_and_timeout(self):
        self.assertEqual(run_audit(self.finding_path, ["C:/no/such/auditor.exe"], self.out)["status"], "audit failed to run")
        v = run_audit(self.finding_path, [PY, "-c", "import time; time.sleep(5)"], self.out, timeout=1)
        self.assertIn("timed out", v["detail"])

    def test_real_auditor_reads_our_finding(self):
        v = run_audit(self.finding_path, auditor_command("F-001", self.dir, self.out) + ["--no-model"], self.out, timeout=120)
        self.assertIn(v.get("grade"), GRADES, v)


class AnswerTest(unittest.TestCase):
    def test_answer_shows_pending_and_footnote(self):
        out = format_answer(FINDING, {"status": "pending audit"})
        self.assertIn("Grade: pending audit", out)
        self.assertIn("Want a visual?", out)

    def test_answer_line_order(self):
        lines = format_answer(FINDING, {"status": "pending audit"}).splitlines()
        self.assertEqual(lines[:2], ["F-001 v1", FINDING["claim"]])
        self.assertEqual(lines[2], "Student: " + FINDING["summary_student"])
        self.assertEqual(lines[3], "Professional: " + FINDING["summary_professional"])
        self.assertEqual(lines[4], "Grade: pending audit")
        self.assertTrue(lines[5].startswith("Warning: PSI has no partial-gravity"))
        self.assertEqual(lines[6], "Sources: 10.60555/4qc4-de67, 10.60555/mbq8-0451")
        self.assertEqual(lines[7], FINDING["visual_offer"]["footnote"])

    def test_grade_is_never_invented(self):
        self.assertIn("Grade: B", format_answer(FINDING, {"status": "audited", "grade": "B"}))
        self.assertIn("Grade: audit failed to run", format_answer(FINDING, {"status": "audit failed to run"}))
        self.assertIn("Grade: pending audit", format_answer(FINDING, {}))

    def test_control_characters_are_removed(self):
        out = format_answer(dict(FINDING, claim="Red \x1b[31malert\x1b[0m done"), {})
        self.assertNotIn("\x1b", out)
        self.assertIn("Red [31malert[0m done", out)

    def test_no_footnote_and_no_sources(self):
        quiet = dict(FINDING, visual_offer=NO_OFFER, evidence=[], warnings=[])
        lines = format_answer(quiet, {}).splitlines()
        self.assertEqual(lines[-1], "Sources: none")

    def test_failed_checks_are_listed_with_the_grade(self):
        audit = {"grade": "rejected", "checks": [{"id": "C3", "result": "fail"}, {"id": "C5", "result": "pass"},
                                                 {"id": "C8", "result": "fail"}]}
        self.assertIn("Grade: rejected (failed: C3, C8)", format_answer(FINDING, audit).splitlines())

    def test_answer_cli_reads_the_auditor_verdict_for_this_file(self):
        with tempfile.TemporaryDirectory() as d:
            folder, audits = Path(d) / "findings", Path(d) / "audits"
            data = save(FINDING, folder).read_bytes()
            audits.mkdir()
            verdict = {"finding_id": "F-001", "finding_version": 1, "finding_sha256": hashlib.sha256(data).hexdigest(), "grade": "A"}
            for sha, shown in ((verdict["finding_sha256"], "Grade: A"), ("0" * 64, "Grade: pending audit")):
                (audits / "F-001.json").write_text(json.dumps(dict(verdict, finding_sha256=sha)), encoding="utf-8")
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    self.assertEqual(answer_main(["F-001"], findings_dir=folder, audits_dir=audits), 0)
                self.assertIn(shown, out.getvalue().splitlines())


class Utf8OutputTest(unittest.TestCase):
    def test_cli_prints_text_outside_cp1252(self):
        env = {k: v for k, v in os.environ.items() if k not in ("PYTHONIOENCODING", "PYTHONUTF8")}
        r = subprocess.run([sys.executable, "-m", "scripts.query", "SELECT '≥ 30%' AS x"], cwd=ROOT, env=env,
                           capture_output=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        self.assertIn("≥ 30%", r.stdout.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
