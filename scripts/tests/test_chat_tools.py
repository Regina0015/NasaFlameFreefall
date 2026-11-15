import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts import chat_tools
from scripts.query import open_snapshot
from scripts.tests.helpers import BASS2_TABLE, fixture_test, make_fixture_snapshot
from scripts.write_finding import LUNAR_WARNING

GAS = fixture_test("PSI-159", "PSI-159_Experimental table_CFI-G_Normal Flames.csv", 1, "gas", 40.0)  # no pressure


class ChatToolsCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.snap = make_fixture_snapshot(self.root / "snapshot", extra_tests=[GAS])
        self.con = open_snapshot(self.snap, user_root=self.root / "user")

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()


class QueryTestsTest(ChatToolsCase):
    def test_none_match_is_a_result_not_no_data(self):
        r = chat_tools.query_tests(self.con, {"phase": "solid", "o2_min_pct": 30})
        self.assertEqual(r["n_tests"], 0)
        self.assertTrue(r["none_match"])
        self.assertFalse(r["no_data"])
        self.assertEqual(r["before_numeric_filters"]["n_tests"], 2)
        self.assertEqual(r["before_numeric_filters"]["o2_pct_tested"], {"min": 21.0, "max": 22.2})
        self.assertEqual(r["summary"], "0 of 2 tests meet the numeric conditions.")

    def test_no_tests_in_scope_is_no_data(self):
        r = chat_tools.query_tests(self.con, {"phase": "smoke", "o2_min_pct": 30})
        self.assertTrue(r["no_data"])
        self.assertFalse(r["none_match"])

    def test_group_by_phase(self):
        r = chat_tools.query_tests(self.con, {"group_by": "phase"})
        self.assertEqual({g["group"]: g["n_tests"] for g in r["groups"]}, {"solid": 2, "droplet": 1, "gas": 1})

    def test_pressure_in_psi_and_missing_pressure_counted_apart(self):
        r = chat_tools.query_tests(self.con, {"o2_min_pct": 30, "pressure_max_psi": 10.2})
        self.assertEqual(r["n_tests"], 1)  # FLEX at 0.5 atm = 7.35 psi; the CFI-G row has no pressure
        self.assertEqual(r["groups"][0]["pressure_psi"], {"min": 7.35, "max": 7.35})
        self.assertEqual(r["before_numeric_filters"]["excluded_no_pressure_value"], 3)

    def test_acronym_resolves_and_unknown_matches_nothing(self):
        self.assertEqual(chat_tools.query_tests(self.con, {"investigation": "bass ii"})["filters"]["investigation"], "PSI-25")
        self.assertEqual(chat_tools.resolve_investigation(self.con, "psi 69"), "PSI-69")
        r = chat_tools.query_tests(self.con, {"investigation": "NOPE"})
        self.assertEqual(r["n_tests"], 0)
        self.assertTrue(r["warnings"])

    def test_bad_arguments_are_rejected(self):
        for args in ({"phase": "plasma"}, {"o2_min_pct": "30"}, {"group_by": "source_row; DROP"}):
            with self.assertRaises(ValueError):
                chat_tools.query_tests(self.con, args)


class CheckEnvironmentTest(ChatToolsCase):
    def test_lunar_base_counts_o2_and_pressure_together(self):
        r = chat_tools.check_environment(self.con, {"environment": "lunar_base"})
        by = {p["phase"]: p for p in r["by_phase"]}
        self.assertEqual((by["droplet"]["reach_o2"], by["droplet"]["reach_o2_and_pressure"]), (1, 1))
        self.assertEqual((by["gas"]["reach_o2"], by["gas"]["reach_o2_pressure_unknown"]), (1, 1))
        self.assertEqual(by["solid"]["reach_o2"], 0)
        self.assertIn("No solid test reached 30% O2.", r["gaps"])
        self.assertEqual(r["warnings"], [LUNAR_WARNING])
        self.assertEqual(r["method"]["function"], "coverage_by_environment")

    def test_phase_with_tests_lacking_o2_is_no_data_not_zero(self):
        self.con.close()
        smoke = fixture_test("PSI-102", "smoke.csv", 1, "smoke", None)
        self.snap = make_fixture_snapshot(self.root / "snap2", extra_tests=[GAS, smoke])
        self.con = open_snapshot(self.snap, user_root=self.root / "user")
        r = chat_tools.check_environment(self.con, {"environment": "lunar_base"})
        by = {p["phase"]: p for p in r["by_phase"]}
        self.assertIsNone(by["smoke"]["reach_o2"])
        self.assertTrue(by["smoke"]["no_data"])
        self.assertIn("No data for smoke: some of its tests report no oxygen.", r["gaps"])
        self.assertNotIn("No smoke test reached 30% O2.", r["gaps"])
        self.assertIn("No solid test reached 30% O2.", r["gaps"])  # every fixture solid has O2: a real zero

    def test_unsourced_and_reference_environments_are_not_evaluated(self):
        self.assertEqual(chat_tools.check_environment(self.con, {"environment": "mars_base"})["status"], "no_source")
        self.assertEqual(chat_tools.check_environment(self.con, {"environment": "space_station"})["status"], "no_source")
        self.assertEqual(chat_tools.check_environment(self.con, {"environment": "spacesuit"})["status"], "reference_point")


class GetFindingsTest(ChatToolsCase):
    def _finding(self, fid, claim, version=1):
        f = {"id": fid, "version": version, "status": "has_data", "question": "q", "claim": claim,
             "summary_student": "s", "summary_professional": "p", "n_tests": 2, "environments": ["lunar_base"],
             "evidence": [{"investigation": "PSI-25", "doi": "10.60555/4qc4-de67", "table": BASS2_TABLE, "rows": [1, 2]}],
             "limitations": [], "warnings": []}
        path = self.findings / f"{fid}.json"
        path.write_text(json.dumps(f), encoding="utf-8")
        return path

    def _audit(self, path, grade, version=1, sha=None):
        data = path.read_bytes()
        audit = {"finding_id": path.stem, "finding_version": version, "grade": grade,
                 "finding_sha256": sha or hashlib.sha256(data).hexdigest(),
                 "checks": [{"id": "C5", "result": "fail"}]}
        (self.audits / f"{path.stem}.json").write_text(json.dumps(audit), encoding="utf-8")

    def setUp(self):
        super().setUp()
        self.findings, self.audits, self.records = (self.root / d for d in ("findings", "audits", "records"))
        for d in (self.findings, self.audits, self.records):
            d.mkdir()

    def _run(self, args):
        return chat_tools.get_findings(self.con, args, findings_dir=self.findings, audits_dir=self.audits,
                                       investigations_dir=self.records)

    def test_grades_stale_audits_and_rejected(self):
        self._audit(self._finding("F-001", "Solid flame spread claim"), "B")
        self._audit(self._finding("F-002", "Another flame claim"), "A", sha="0" * 64)  # audit of other content
        self._audit(self._finding("F-003", "Rejected flame claim"), "rejected")
        r = self._run({"topic": "flame"})
        grades = {f["id"]: (f["grade"], f["failed_checks"]) for f in r["findings"]}
        self.assertEqual(grades["F-001"], ("B", ["C5"]))
        self.assertEqual(grades["F-002"], ("pending audit", []))
        self.assertNotIn("F-003", grades)
        self.assertEqual(r["availability"]["rejected_not_shown"], 1)
        self.assertTrue(r["preliminary"])

    def test_environment_filter(self):
        self._finding("F-001", "Lunar flame claim")  # tagged lunar_base
        self.assertEqual(len(self._run({"topic": "flame", "environment": "lunar_base"})["findings"]), 1)
        self.assertEqual(len(self._run({"topic": "flame", "environment": "mars_base"})["findings"]), 0)
        # Earth is a reference point, not a tag: it must not hide findings.
        self.assertEqual(len(self._run({"topic": "flame", "environment": "earth_sea_level"})["findings"]), 1)

    def test_nothing_available_says_no_data(self):
        r = self._run({"topic": "flame spread"})
        self.assertTrue(r["no_data"])
        self.assertEqual(r["findings"], [])

    def test_text_is_cleaned(self):
        self._finding("F-001", "Flame claim\x1b[31m with an escape‮")
        claim = self._run({"topic": "flame"})["findings"][0]["claim"]
        self.assertNotIn("\x1b", claim)
        self.assertNotIn("‮", claim)


class ReadOnlyTest(ChatToolsCase):
    def test_tools_write_nothing(self):
        before = sorted(p.relative_to(self.root) for p in self.root.rglob("*"))
        chat_tools.run("query_tests", {"group_by": "fuel"}, snapshot_dir=self.snap)
        chat_tools.run("check_environment", {"environment": "lunar_base"}, snapshot_dir=self.snap)
        after = sorted(p.relative_to(self.root) for p in self.root.rglob("*"))
        self.assertEqual(before, after)

    def test_unknown_tool(self):
        with self.assertRaises(ValueError):
            chat_tools.run("sql_query", {"sql": "SELECT 1"}, snapshot_dir=self.snap)


if __name__ == "__main__":
    unittest.main()
