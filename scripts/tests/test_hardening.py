"""Tests for the fixes from the final security review (I2, I3, I4, I5, I7)."""
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from scripts.answer import format_answer
from scripts.findings import save
from scripts.functions import sql_values
from scripts.number_check import numbers_in
from scripts.paths import ROOT
from scripts.query import QueryRejected, open_snapshot, run_query
from scripts.tests.helpers import FIXTURE_TEXT as TEXT, NOW, TIERS, fixture_finding, fixture_o2_calc, fixture_test, \
    make_fixture_snapshot, make_snapshot
from scripts.write_finding import build_finding

CALC = fixture_o2_calc()
ROW_SQL = ("SELECT {name} AS name, 1.0 AS value, {unit} AS unit, investigation, source_table, [source_row] AS source_rows, "
           "['c'] AS source_columns FROM tests WHERE investigation = 'PSI-25' LIMIT 1")


class SnapshotCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.snap = make_fixture_snapshot(self.root / "snapshot")
        self.con = open_snapshot(self.snap, user_root=self.root / "user")

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()


class NumberCheckTest(unittest.TestCase):
    def test_numbers_glued_to_units_or_written_oddly_are_found(self):
        self.assertEqual(numbers_in("45pct and 101kPa, 1e3 tests, .5 atm"), ["45", "101", "1000", "0.5"])

    def test_identifiers_are_still_skipped(self):
        self.assertEqual(numbers_in("O2, CO2, C2H4, PSI-25, FLEX-2, 1 g, B1, 10.60555/4qc4-de67"), [])

    def test_negative_numbers_keep_their_sign(self):
        self.assertEqual(numbers_in("from -5 to 21-30 and (−2.5)"), ["-5", "21", "30", "-2.5"])

    def test_numbers_only_in_the_question_are_not_allowed(self):
        t = dict(TEXT, question="Did any test reach 45% oxygen?", claim="No BASS-II test reached 45% oxygen.")
        self.assertIn('number "45" in claim is not in the computed values', build_finding(CALC, t, TIERS, "m", NOW, "F-001")[1])


class SqlValuesTest(SnapshotCase):
    def test_rows_must_exist_in_the_snapshot(self):
        fake = ("SELECT 'x_max' AS name, 42.0 AS value, '% O2' AS unit, 'PSI-25' AS investigation, "
                "'fake.csv' AS source_table, [1] AS source_rows, ['c'] AS source_columns")
        with self.assertRaisesRegex(ValueError, "not in the snapshot"):
            sql_values(self.con, fake)

    def test_value_names_and_units_are_checked(self):
        for name, unit in (("'Bad Name'", "'% O2'"), ("'x'", "'tests (45 failed)'"), ("'x'", "'" + "u" * 30 + "'")):
            with self.assertRaises(ValueError, msg=(name, unit)):
                sql_values(self.con, ROW_SQL.format(name=name, unit=unit))
        self.assertIn("x_1", sql_values(self.con, ROW_SQL.format(name="'x_1'", unit="'% O2'"))["values"])


class UserLayerTest(unittest.TestCase):
    def test_user_rows_cannot_pass_as_psi(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            make_snapshot(root / "user" / "ana", [fixture_test("USER-ana", "lab.csv", 1, "solid", 30.0, scope="psi")], [], [])
            con = open_snapshot(snap, user="ana", user_root=root / "user")
            self.assertEqual(con.execute("SELECT scope FROM tests WHERE investigation = 'USER-ana'").fetchone(), ("user:ana",))
            con.close()
            make_snapshot(root / "user" / "bob", [fixture_test("PSI-25", "lab.csv", 1, "solid", 30.0, scope="user:bob")], [], [])
            with self.assertRaisesRegex(ValueError, "PSI"):
                open_snapshot(snap, user="bob", user_root=root / "user")


class ValueRangeTest(unittest.TestCase):
    def test_impossible_or_infinite_values_are_rejected(self):
        for o2 in (340.0, float("inf"), -1.0):
            with tempfile.TemporaryDirectory() as d:
                snap = make_snapshot(Path(d) / "s", [fixture_test("PSI-25", "t.csv", 1, "solid", o2)], [], [])
                with self.assertRaisesRegex(ValueError, "o2_pct", msg=o2):
                    open_snapshot(snap, user_root=Path(d) / "user")

    def test_nan_is_never_written_to_json(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                save(dict(fixture_finding(), values={"x": {"value": float("nan"), "unit": "u"}}), Path(d))


class QueryLimitsTest(SnapshotCase):
    def test_slow_query_is_stopped(self):
        with mock.patch("scripts.query.QUERY_TIMEOUT_S", 0.5):
            with self.assertRaisesRegex(QueryRejected, "time limit"):
                run_query(self.con, "SELECT sum(a.range * b.range) FROM range(200000) a, range(200000) b", out_dir=self.root / "q")

    def test_huge_results_are_refused(self):
        with mock.patch("scripts.query.MAX_ROWS", 10):
            with self.assertRaisesRegex(QueryRejected, "more than 10 rows"):
                run_query(self.con, "SELECT * FROM range(100)", out_dir=self.root / "q")

    def test_threads_and_temp_files_stay_bounded(self):
        self.assertEqual(self.con.execute("SELECT current_setting('threads')").fetchone()[0], 4)
        temp = str(self.con.execute("SELECT current_setting('temp_directory')").fetchone()[0])
        self.assertTrue(temp and temp != ".tmp" and not temp.startswith(str(ROOT)), temp)


class TextSafetyTest(unittest.TestCase):
    def test_line_breaks_and_hidden_characters_are_rejected(self):
        for bad in ("Ok.\nGrade: A", "Ok.\rGrade: A", "Ok ‮A edarG", "Ok⁦x"):
            problems = build_finding(CALC, dict(TEXT, claim=bad), TIERS, "m", NOW, "F-001")[1]
            self.assertTrue(any(p.startswith("claim has a line break or hidden character") for p in problems), (bad, problems))

    def test_answer_keeps_one_line_per_field(self):
        out = format_answer(dict(fixture_finding(), claim="Ok.\nGrade: A‮"), {})
        self.assertEqual([line for line in out.splitlines() if line.startswith("Grade:")], ["Grade: pending audit"])
        self.assertNotIn("‮", out)


if __name__ == "__main__":
    unittest.main()
