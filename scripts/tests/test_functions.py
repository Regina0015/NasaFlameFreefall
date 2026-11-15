import json
import tempfile
import unittest
from pathlib import Path

from scripts.functions import _group_rows, coverage_by_environment, o2_range, sql_values
from scripts.paths import CONFIG_DIR, SNAPSHOT_DIR
from scripts.query import QueryRejected, open_snapshot
from scripts.run_calc import run
from scripts.tests.helpers import BASS2_O2, BASS2_TABLE, fixture_test, make_fixture_snapshot

ENV_MD = CONFIG_DIR / "environments.md"
SAFFIRE2_TABLE = "PSI-99_Experimental table_SAFFIRE-2.csv"
SAFFIRE2_O2 = "Percent O2 (Note 1)"
PSI99_SOLID = fixture_test("PSI-99", SAFFIRE2_TABLE, 1, "solid", 21.5,
                           sources={"o2_pct_min": SAFFIRE2_O2, "o2_pct_max": SAFFIRE2_O2})


class FixtureCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.snap = make_fixture_snapshot(self.root / "snapshot", extra_tests=[PSI99_SOLID])
        self.con = open_snapshot(self.snap, user_root=self.root / "user")

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()


class O2RangeTest(FixtureCase):
    def test_o2_range_fixture(self):
        c = o2_range(self.con, ["PSI-25", "PSI-69"], 30)
        v = c["values"]
        self.assertEqual((v["psi25_o2_min"]["value"], v["psi25_o2_max"]["value"], v["psi25_n_at_or_above"]["value"]), (21.0, 22.2, 0))
        self.assertEqual((v["psi69_o2_max"]["value"], v["psi69_n_at_or_above"]["value"]), (34.0, 1))
        self.assertEqual(c["n_tests"], 3)
        self.assertEqual(c["evidence"][0]["doi"], "10.60555/4qc4-de67")

    def test_o2_range_method_and_evidence(self):
        c = o2_range(self.con, ["PSI-25"], 21.5)
        self.assertEqual(c["method"]["script"], "scripts/functions.py")
        self.assertEqual(c["method"]["function"], "o2_range")
        self.assertEqual(c["method"]["params"], {"investigations": ["PSI-25"], "threshold_pct": 21.5})
        self.assertEqual(c["values"]["psi25_o2_min"]["unit"], "% O2")
        self.assertEqual(c["values"]["psi25_n_at_or_above"], {"value": 1, "unit": "tests"})
        rows = [r for (r,) in self.con.execute(
            "SELECT DISTINCT source_row FROM tests WHERE investigation = 'PSI-25' ORDER BY 1").fetchall()]
        self.assertEqual(c["evidence"], [{"investigation": "PSI-25", "doi": "10.60555/4qc4-de67", "table": BASS2_TABLE,
                                          "columns": [BASS2_O2], "rows": rows}])

    def test_joined_field_sources_become_separate_columns(self):
        groups = _group_rows([("PSI-69", "t.csv", 1, json.dumps({"diluent": "N2 col | CO2 col"}))], ("diluent",))
        self.assertEqual(groups[("PSI-69", "t.csv")]["columns"], {"N2 col", "CO2 col"})

    def test_sql_values_splits_joined_source_columns(self):
        c = sql_values(self.con, "SELECT 'x' AS name, 1.0 AS value, 'u' AS unit, investigation, source_table, "
                                 "[source_row] AS source_rows, ['A | B', 'C'] AS source_columns FROM tests "
                                 "WHERE investigation = 'PSI-25' LIMIT 1")
        self.assertEqual(c["evidence"][0]["columns"], ["A", "B", "C"])

    def test_o2_range_without_oxygen_tests(self):
        c = o2_range(self.con, ["PSI-101"], 30)
        self.assertEqual((c["values"]["psi101_o2_max"]["value"], c["values"]["psi101_n_tests"]["value"]), (None, 0))
        self.assertEqual((c["n_tests"], c["evidence"]), (0, []))

    def test_o2_range_bad_params(self):
        for investigations, threshold in [([], 30), ("PSI-25", 30), ([25], 30), (["PSI-25"], "30"), (["PSI-25"], True)]:
            with self.assertRaises(ValueError, msg=repr((investigations, threshold))):
                o2_range(self.con, investigations, threshold)

    def test_o2_range_regression_real_snapshot(self):
        con = open_snapshot(SNAPSHOT_DIR)
        v = o2_range(con, ["PSI-25", "PSI-69"], 30)["values"]
        con.close()
        self.assertEqual((v["psi25_o2_min"]["value"], v["psi25_o2_max"]["value"], v["psi25_n_tests"]["value"]), (13.6, 22.2, 129))
        self.assertEqual((v["psi69_o2_min"]["value"], v["psi69_o2_max"]["value"], v["psi69_n_tests"]["value"], v["psi69_n_at_or_above"]["value"]),
                         (12.0, 34.0, 274, 24))


class CoverageTest(FixtureCase):
    def test_coverage_lunar_base(self):
        c = coverage_by_environment(self.con, "lunar_base", ENV_MD)
        self.assertEqual(c["values"]["droplet_o2_match"]["value"], 1)
        self.assertEqual(c["values"]["solid_o2_match"]["value"], 0)
        self.assertEqual(c["method"]["params"]["pressure_max_psi"], 10.2)

    def test_coverage_pressure_and_params(self):
        c = coverage_by_environment(self.con, "lunar_base", ENV_MD)
        v = c["values"]
        self.assertEqual((v["droplet_o2_and_pressure_match"]["value"], v["droplet_pressure_unknown"]["value"]), (1, 0))
        self.assertEqual(v["solid_pressure_unknown"], {"value": 0, "unit": "tests"})
        p = c["method"]["params"]
        self.assertEqual((p["environment"], p["o2_min_pct"]), ("lunar_base", 30.0))
        self.assertIn("Challenge text", p["source"])
        self.assertEqual(c["n_tests"], 1)
        self.assertEqual([e["investigation"] for e in c["evidence"]], ["PSI-69"])
        self.assertTrue(c["evidence"][0]["rows"] and all(isinstance(r, int) for r in c["evidence"][0]["rows"]))

    def test_coverage_zero_with_tests_lacking_o2_is_no_data(self):
        # Auditor rule C6: a zero over tests without O2 data is not a zero, so the phase is left out.
        self.con.close()
        smoke = fixture_test("PSI-142", "smoke.csv", 1, "smoke", None)
        solid_no_o2 = fixture_test("PSI-99", SAFFIRE2_TABLE, 2, "solid", None)
        self.snap = make_fixture_snapshot(self.root / "snap2", extra_tests=[PSI99_SOLID, smoke, solid_no_o2])
        self.con = open_snapshot(self.snap, user_root=self.root / "user")
        v = coverage_by_environment(self.con, "lunar_base", ENV_MD)["values"]
        self.assertFalse([k for k in v if k.startswith(("smoke_", "solid_"))])
        self.assertEqual(v["droplet_o2_match"]["value"], 1)  # every droplet has O2: a real count stays

    def test_coverage_unknown_environment(self):
        with self.assertRaisesRegex(ValueError, "no sourced atmosphere for space_station"):
            coverage_by_environment(self.con, "space_station", ENV_MD)


SQL_OK = ("SELECT 'psi25_o2_max' AS name, max(o2_pct_max) AS value, '% O2' AS unit, investigation, "
          "any_value(source_table) AS source_table, list(source_row) AS source_rows, "
          "['Calibrated initial O2 % by vol'] AS source_columns FROM tests WHERE investigation = 'PSI-25' GROUP BY investigation")


class SqlValuesTest(FixtureCase):
    def test_sql_values_shape_and_zero_rows(self):
        ok = sql_values(self.con, SQL_OK)
        self.assertEqual((ok["values"]["psi25_o2_max"]["value"], ok["n_tests"]), (22.2, 2))
        self.assertEqual((ok["method"]["function"], ok["method"]["params"]), ("sql_query", {"sql": SQL_OK}))
        self.assertEqual(ok["evidence"][0]["columns"], [BASS2_O2])
        empty = sql_values(self.con, "SELECT 'x' AS name, 1.0 AS value, 'u' AS unit, investigation, source_table, "
                                     "[source_row] AS source_rows, ['c'] AS source_columns FROM tests WHERE o2_pct_max > 90")
        self.assertEqual((empty["values"], empty["n_tests"], empty["evidence"]), ({}, 0, []))
        with self.assertRaises(ValueError):
            sql_values(self.con, "SELECT 1 AS value")

    def test_sql_values_missing_columns_are_named(self):
        with self.assertRaisesRegex(ValueError, "missing column\\(s\\): name, unit"):
            sql_values(self.con, "SELECT 1 AS value, 'PSI-25' AS investigation, 't' AS source_table, [1] AS source_rows, ['c'] AS source_columns")

    def test_sql_values_decimal_becomes_float(self):
        c = sql_values(self.con, f"SELECT 'k' AS name, 1.5 AS value, 'u' AS unit, 'PSI-25' AS investigation, '{BASS2_TABLE}' AS source_table, "
                                 "[1] AS source_rows, ['c'] AS source_columns")
        self.assertEqual(c["values"]["k"]["value"], 1.5)
        self.assertIsInstance(c["values"]["k"]["value"], float)

    def test_sql_values_rejects_bad_rows(self):
        base = ("SELECT {name} AS name, {value} AS value, 'u' AS unit, 'PSI-25' AS investigation, 't' AS source_table, "
                "{rows} AS source_rows, ['c'] AS source_columns")
        for name, value, rows in [("'a'", "'text'", "[1]"), ("'a'", "1", "[0]"), ("'a'", "1", "'1'"), ("NULL", "1", "[1]")]:
            with self.assertRaises(ValueError, msg=(name, value, rows)):
                sql_values(self.con, base.format(name=name, value=value, rows=rows))
        with self.assertRaisesRegex(ValueError, "duplicate value name"):
            sql_values(self.con, base.format(name="'a'", value="1", rows="[1]") + " UNION ALL " + base.format(name="'a'", value="2", rows="[2]"))

    def test_sql_values_only_select(self):
        with self.assertRaises(QueryRejected):
            sql_values(self.con, "DROP TABLE tests")


class RunCalcTest(unittest.TestCase):
    def test_run_writes_calc_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            kwargs = dict(snapshot_dir=snap, user_root=root / "user", out_dir=root / "calcs")
            path = run("o2_range", {"investigations": ["PSI-25", "PSI-69"], "threshold_pct": 30}, **kwargs)
            calc = json.loads(path.read_text(encoding="utf-8"))
            self.assertRegex(path.name, r"^C-[0-9a-f]{12}\.json$")
            self.assertEqual(calc["values"]["psi69_n_at_or_above"]["value"], 1)
            self.assertRegex(calc["snapshot_sha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(calc["created"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")
            again = run("o2_range", {"investigations": ["PSI-25", "PSI-69"], "threshold_pct": 30}, **kwargs)
            self.assertEqual(again, path)
            sql = run("sql_query", {"sql": SQL_OK}, **kwargs)
            self.assertEqual(json.loads(sql.read_text(encoding="utf-8"))["values"]["psi25_o2_max"]["value"], 22.2)

    def test_run_rejects_unknown_function_and_params(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            kwargs = dict(snapshot_dir=snap, user_root=root / "user", out_dir=root / "calcs")
            with self.assertRaisesRegex(ValueError, "unknown function"):
                run("drop_everything", {}, **kwargs)
            with self.assertRaisesRegex(ValueError, "unknown param"):
                run("coverage_by_environment", {"environment": "lunar_base", "environments_md": "../../secret.md"}, **kwargs)
            with self.assertRaisesRegex(ValueError, "missing param"):
                run("o2_range", {"investigations": ["PSI-25"]}, **kwargs)


if __name__ == "__main__":
    unittest.main()
