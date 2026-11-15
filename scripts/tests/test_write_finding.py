import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from scripts.findings import bump_version, load, next_id, save
from scripts.run_calc import run
from scripts.tests.helpers import FIXTURE_TEXT as TEXT, NO_OFFER, NOW, TIERS, fixture_o2_calc, make_fixture_snapshot
from scripts.write_finding import LUNAR_WARNING, build_finding, load_calc, main


CALC = fixture_o2_calc()


class BuildFindingTest(unittest.TestCase):
    def test_valid_finding_saved_as_F001(self):
        f, problems = build_finding(CALC, TEXT, TIERS, "claude-opus-5-5", NOW, "F-001")
        self.assertEqual(problems, [])
        self.assertEqual((f["id"], f["version"], f["tier"], f["chart"]), ("F-001", 1, 1, None))
        self.assertEqual(f["generated_by"], {"agent": "calculator", "model": "claude-opus-5-5", "date": NOW})
        self.assertEqual((f["values"], f["method"], f["evidence"], f["n_tests"]),
                         (CALC["values"], CALC["method"], CALC["evidence"], CALC["n_tests"]))

    def test_typed_number_is_rejected(self):
        t = dict(TEXT, claim="BASS-II peaked near 22% O2.")
        f, problems = build_finding(CALC, t, TIERS, "m", NOW, "F-001")
        self.assertIsNone(f)
        self.assertIn('number "22" in claim is not in the computed values', problems)

    def test_numbers_checked_in_lists_and_offer(self):
        t = dict(TEXT, assumptions=["A 25% margin is assumed."],
                 visual_offer=dict(TEXT["visual_offer"], footnote="I can chart all 99 tests.",
                                   graph={"available": True, "idea": "Graph of 7 links."}))
        _, problems = build_finding(CALC, t, TIERS, "m", NOW, "F-001")
        self.assertIn('number "25" in assumptions[0] is not in the computed values', problems)
        self.assertIn('number "99" in visual_offer.footnote is not in the computed values', problems)
        self.assertIn('number "7" in visual_offer.graph.idea is not in the computed values', problems)

    def test_numbers_from_params_are_allowed(self):
        t = dict(TEXT, question="Did any test reach 30% oxygen?", claim="No BASS-II test reached 30% oxygen.")
        self.assertEqual(build_finding(CALC, t, TIERS, "m", NOW, "F-001")[1], [])

    def test_lunar_warning_added(self):
        f, _ = build_finding(CALC, dict(TEXT, environments=["lunar_base"], warnings=[]), TIERS, "m", NOW, "F-001")
        self.assertIn("PSI has no partial-gravity combustion data.", f["warnings"][0])
        f, _ = build_finding(CALC, dict(TEXT, environments=["mars_base"]), TIERS, "m", NOW, "F-001")
        self.assertEqual(f["warnings"].count(LUNAR_WARNING), 1)
        f, _ = build_finding(CALC, dict(TEXT, environments=["space_station"], warnings=[]), TIERS, "m", NOW, "F-001")
        self.assertEqual(f["warnings"], [])

    def test_reworded_lunar_warning_is_replaced_not_duplicated(self):
        reworded = "PSI has no partial-gravity combustion data. Lunar conclusions are bounded by microgravity results."
        f, _ = build_finding(CALC, dict(TEXT, warnings=["Check units.", reworded]), TIERS, "m", NOW, "F-001")
        self.assertEqual(f["warnings"], ["Check units.", LUNAR_WARNING])

    def test_no_data_finding_is_valid(self):
        empty = {**CALC, "values": {}, "evidence": [], "n_tests": 0}
        t = dict(TEXT, status="no_data", claim="No PSI test answers this question.", summary_student="NASA has no test for this yet.",
                 summary_professional="No matching tests in the snapshot.", environments=[], visual_offer=NO_OFFER)
        f, problems = build_finding(empty, t, TIERS, "m", NOW, "F-002")
        self.assertEqual(problems, [])
        self.assertEqual((f["status"], f["n_tests"], f["tier"]), ("no_data", 0, None))

    def test_status_must_match_n_tests(self):
        self.assertIsNone(build_finding(CALC, dict(TEXT, status="no_data"), TIERS, "m", NOW, "F-001")[0])
        no_evidence = {**CALC, "evidence": []}
        self.assertIsNone(build_finding(no_evidence, TEXT, TIERS, "m", NOW, "F-001")[0])

    def test_text_fields_are_exact(self):
        _, problems = build_finding(CALC, dict(TEXT, values={"x": {"value": 1, "unit": "u"}}), TIERS, "m", NOW, "F-001")
        self.assertIn("unexpected field(s) in text: values", problems)
        short = {k: v for k, v in TEXT.items() if k != "limitations"}
        self.assertIn("missing field(s) in text: limitations", build_finding(CALC, short, TIERS, "m", NOW, "F-001")[1])

    def test_schema_errors_are_reported(self):
        f, problems = build_finding(CALC, dict(TEXT, pillar="fire"), TIERS, "m", NOW, "F-001")
        self.assertIsNone(f)
        self.assertTrue(any("pillar" in p for p in problems), problems)


class FindingFilesTest(unittest.TestCase):
    def test_ids_and_version_history(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            self.assertEqual(next_id(folder), "F-001")
            f, _ = build_finding(CALC, TEXT, TIERS, "m", NOW, "F-001")
            self.assertEqual(save(f, folder), folder / "F-001.json")
            self.assertEqual(next_id(folder), "F-002")
            self.assertEqual(load("F-001", folder), f)
            bumped = bump_version(f, "2026-11-15T09:00:00Z", folder)
            self.assertTrue((folder / "history" / "F-001.v1.json").exists())
            self.assertEqual((bumped["version"], bumped["generated_by"]["date"], f["version"]), (2, "2026-11-15T09:00:00Z", 1))
            self.assertEqual(next_id(folder), "F-002")

    def test_bad_ids_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            for bad in ["../F-001", "F-1", "F-001.json", "f-001"]:
                with self.assertRaises(ValueError, msg=bad):
                    load(bad, Path(d))


class LoadCalcAndCliTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.snap = make_fixture_snapshot(self.root / "snapshot")
        self.calcs = self.root / "calcs"
        self.calc_path = run("o2_range", {"investigations": ["PSI-25", "PSI-69"], "threshold_pct": 30},
                             snapshot_dir=self.snap, user_root=self.root / "user", out_dir=self.calcs)

    def tearDown(self):
        self.tmp.cleanup()

    def test_load_calc_accepts_run_calc_output(self):
        self.assertEqual(load_calc(self.calc_path, self.calcs)["n_tests"], 3)

    def test_load_calc_rejects_edited_or_outside_files(self):
        calc = json.loads(self.calc_path.read_text(encoding="utf-8"))
        calc["values"]["psi25_o2_max"]["value"] = 40.0
        self.calc_path.write_text(json.dumps(calc), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "does not match its content"):
            load_calc(self.calc_path, self.calcs)
        outside = self.root / "C-000000000000.json"
        outside.write_text("{}", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "must be a calc file in"):
            load_calc(outside, self.calcs)

    def test_cli_saves_finding_and_reports_problems(self):
        text_path = self.root / "text.json"
        text_path.write_text(json.dumps(TEXT), encoding="utf-8")
        findings = self.root / "findings"
        args = ["--calc", str(self.calc_path), "--text", str(text_path), "--model", "claude-opus-5-5"]
        dirs = dict(findings_dir=findings, calcs_dir=self.calcs, snapshot_dir=self.snap)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(args, **dirs), 0)
        self.assertIn("F-001.json", out.getvalue())
        self.assertEqual(load("F-001", findings)["tier"], 1)
        text_path.write_text(json.dumps(dict(TEXT, claim="About 23% at most.")), encoding="utf-8")
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(args, **dirs), 1)
        self.assertIn('number "23" in claim', out.getvalue())
        self.assertFalse((findings / "F-002.json").exists())

    def test_cli_replace_saves_a_new_version_of_the_same_id(self):
        text_path = self.root / "text.json"
        text_path.write_text(json.dumps(TEXT), encoding="utf-8")
        findings = self.root / "findings"
        args = ["--calc", str(self.calc_path), "--text", str(text_path), "--model", "claude-opus-5-5"]
        dirs = dict(findings_dir=findings, calcs_dir=self.calcs, snapshot_dir=self.snap)
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(args, **dirs), 0)
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(args + ["--replace", "F-001"], **dirs), 0)
            self.assertEqual(main(args + ["--replace", "F-009"], **dirs), 1)
        self.assertIn("saved F-001", out.getvalue())
        self.assertIn("F-009 not found", out.getvalue())
        self.assertEqual(load("F-001", findings)["version"], 2)
        self.assertTrue((findings / "history" / "F-001.v1.json").exists())
        self.assertFalse((findings / "F-002.json").exists())


if __name__ == "__main__":
    unittest.main()
