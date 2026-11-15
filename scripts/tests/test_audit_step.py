import contextlib
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
from scripts.audit_step import auditor_command, run_audit, split_command
from scripts.findings import save
from scripts.paths import ROOT
from scripts.tests.helpers import NO_OFFER, fixture_finding

FIXTURES = Path(__file__).parent / "fixtures"
FINDING = fixture_finding()
PY = f'"{sys.executable}"'


class AuditStepTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name) / "dir with spaces"
        self.finding_path = save(FINDING, self.dir)
        self.verdict_path = self.dir / "F-001.v1.audit.json"

    def tearDown(self):
        self.tmp.cleanup()

    def test_pending_without_auditor(self):
        v = run_audit(self.finding_path, None)
        self.assertEqual(v, {"finding": "F-001", "version": 1, "status": "pending audit"})
        self.assertTrue(self.verdict_path.exists())
        self.assertEqual(run_audit(self.finding_path, "")["status"], "pending audit")

    def test_fake_auditor_in_path_with_spaces(self):
        cmd = f'{PY} "{FIXTURES / "fake_auditor.py"}"'
        self.assertEqual(run_audit(self.finding_path, cmd)["grade"], "B")
        self.assertEqual(json.loads(self.verdict_path.read_text(encoding="utf-8"))["grade"], "B")

    def test_failing_auditor_is_reported(self):
        v = run_audit(self.finding_path, f'{PY} -c "import sys; sys.exit(3)"')
        self.assertEqual(v["status"], "audit failed to run")
        self.assertNotIn("grade", v)
        self.assertEqual(json.loads(self.verdict_path.read_text(encoding="utf-8"))["status"], "audit failed to run")

    def test_auditor_that_writes_nothing_failed(self):
        self.assertEqual(run_audit(self.finding_path, f'{PY} -c "print(1)"')["status"], "audit failed to run")

    def test_stale_verdict_is_not_reused(self):
        self.verdict_path.write_text(json.dumps({"finding": "F-001", "version": 1, "grade": "A"}), encoding="utf-8")
        v = run_audit(self.finding_path, f'{PY} -c "print(1)"')
        self.assertEqual(v["status"], "audit failed to run")
        self.assertNotIn("grade", v)

    def test_stderr_tail_is_kept(self):
        v = run_audit(self.finding_path, f'{PY} -c "import sys; sys.stderr.write(\'x\' * 600 + \'END\'); sys.exit(1)"')
        self.assertTrue(v["detail"].endswith("END"))
        self.assertLessEqual(len(v["detail"]), 500)

    def test_missing_program_and_timeout(self):
        self.assertEqual(run_audit(self.finding_path, '"C:/no/such/auditor.exe"')["status"], "audit failed to run")
        v = run_audit(self.finding_path, f'{PY} -c "import time; time.sleep(5)"', timeout=1)
        self.assertEqual(v["status"], "audit failed to run")
        self.assertIn("timed out", v["detail"])

    def test_bad_verdict_json(self):
        cmd = f'{PY} -c "import pathlib, sys; pathlib.Path(sys.argv[1]).with_name(\'F-001.v1.audit.json\').write_text(\'not json\')"'
        self.assertEqual(run_audit(self.finding_path, cmd)["status"], "audit failed to run")

    def test_auditor_command_from_environment_then_dotenv(self):
        env_file = Path(self.tmp.name) / ".env"
        env_file.write_text("# comment\nSUPABASE_URL=x\nAUDITOR_CMD = python audit.py --strict\n", encoding="utf-8")
        self.assertEqual(auditor_command({}, env_file), "python audit.py --strict")
        self.assertEqual(auditor_command({"AUDITOR_CMD": "other"}, env_file), "other")
        env_file.write_text("AUDITOR_CMD=\n", encoding="utf-8")
        self.assertIsNone(auditor_command({}, env_file))
        self.assertIsNone(auditor_command({}, Path(self.tmp.name) / "missing.env"))

    @unittest.skipUnless(os.name == "nt", "Windows path rules")
    def test_split_command_keeps_windows_paths(self):
        self.assertEqual(split_command(r"C:\tools\audit.exe --x"), [r"C:\tools\audit.exe", "--x"])
        self.assertEqual(split_command(r'"C:\Program Files\a.exe" "b c"'), [r"C:\Program Files\a.exe", "b c"])


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

    def test_answer_cli_reads_the_audit_of_the_current_version(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            save(FINDING, folder)
            (folder / "F-001.v1.audit.json").write_text(json.dumps({"finding": "F-001", "version": 1, "grade": "A"}), encoding="utf-8")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(answer_main(["F-001"], findings_dir=folder), 0)
            self.assertIn("Grade: A", out.getvalue())


class Utf8OutputTest(unittest.TestCase):
    def test_cli_prints_text_outside_cp1252(self):
        env = {k: v for k, v in os.environ.items() if k not in ("PYTHONIOENCODING", "PYTHONUTF8")}
        r = subprocess.run([sys.executable, "-m", "scripts.query", "SELECT '≥ 30%' AS x"], cwd=ROOT, env=env,
                           capture_output=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))
        self.assertIn("≥ 30%", r.stdout.decode("utf-8"))


if __name__ == "__main__":
    unittest.main()
