import csv
import hashlib
import tempfile
import unittest
from pathlib import Path

import duckdb

from scripts import contract
from scripts.query import QueryRejected, check_select_only, open_snapshot, run_query
from scripts.tests.helpers import fixture_test, make_fixture_snapshot, make_snapshot


def rewrite_tests_csv(snap: Path, columns: list[str], extra: dict | None = None) -> None:
    path = snap / "tests.csv"
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\n", extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, **(extra or {})})


class QueryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.snap = make_fixture_snapshot(self.root / "snapshot")
        self.out = self.root / "queries"
        self.con = open_snapshot(self.snap, user_root=self.root / "user")

    def tearDown(self):
        self.con.close()
        self.tmp.cleanup()

    def test_select_and_cap(self):
        r = run_query(self.con, "SELECT investigation, o2_pct_max FROM tests ORDER BY o2_pct_max", row_cap=2, out_dir=self.out)
        self.assertEqual((r["total_rows"], len(r["rows"]), r["truncated"]), (3, 2, True))
        self.assertEqual(r["columns"], ["investigation", "o2_pct_max"])
        self.assertEqual(r["rows"][0], ["PSI-25", 21.0])
        self.assertEqual(hashlib.sha256(Path(r["result_file"]).read_bytes()).hexdigest(), r["sha256"])
        self.assertTrue(Path(r["result_file"]).with_suffix(".sql").exists())

    def test_types_are_cast(self):
        r = run_query(self.con, "SELECT typeof(o2_pct_max), typeof(source_row), typeof(pressure_atm_min) FROM tests LIMIT 1",
                      out_dir=self.out)
        self.assertEqual(r["rows"][0], ["DOUBLE", "INTEGER", "DOUBLE"])

    def test_empty_cells_are_null(self):
        r = run_query(self.con, "SELECT count(*) FROM tests WHERE pressure_atm_min IS NULL", out_dir=self.out)
        self.assertEqual(r["rows"][0], [2])

    def test_rejects_non_select(self):
        for sql in ["DROP TABLE tests", "SELECT 1; SELECT 2", "COPY tests TO 'x.csv'", "ATTACH 'x.db'",
                    "SET lock_configuration = false", "INSTALL httpfs", "PRAGMA version", "CALL pragma_version()",
                    "DELETE FROM tests", "CREATE TABLE x AS SELECT 1", "not sql at all"]:
            with self.assertRaises(QueryRejected, msg=sql):
                check_select_only(sql)

    def test_run_query_checks_first(self):
        with self.assertRaises(QueryRejected):
            run_query(self.con, "DROP TABLE tests", out_dir=self.out)
        self.assertEqual(run_query(self.con, "SELECT count(*) FROM tests", out_dir=self.out)["rows"][0], [3])

    def test_no_file_access_from_select(self):
        for sql in ["SELECT * FROM read_csv('pyproject.toml')", "SELECT * FROM read_text('CLAUDE.md')"]:
            with self.assertRaises(duckdb.Error, msg=sql):
                self.con.execute(sql)

    def test_configuration_is_locked(self):
        with self.assertRaises(duckdb.Error):
            self.con.execute("SET enable_external_access = true")


class ExportShapeTest(unittest.TestCase):
    def test_export_with_other_column_order_and_extras(self):
        with tempfile.TemporaryDirectory() as d:
            snap = make_fixture_snapshot(Path(d))
            rewrite_tests_csv(snap, list(reversed(contract.names(contract.TESTS))) + ["notes"], {"notes": "extra"})
            con = open_snapshot(snap, user_root=Path(d) / "user")
            self.assertEqual(con.execute("SELECT max(o2_pct_max), typeof(max(o2_pct_max)) FROM tests").fetchone(), (34.0, "DOUBLE"))
            self.assertNotIn("notes", [c[0] for c in con.execute("SELECT * FROM tests LIMIT 0").description])
            con.close()

    def test_missing_column_message(self):
        with tempfile.TemporaryDirectory() as d:
            snap = make_fixture_snapshot(Path(d))
            rewrite_tests_csv(snap, [c for c in contract.names(contract.TESTS) if c != "scope"])
            with self.assertRaisesRegex(ValueError, r"tests\.csv is missing column\(s\): scope"):
                open_snapshot(snap, user_root=Path(d) / "user")

    def test_snapshot_path_with_quote_and_spaces(self):
        with tempfile.TemporaryDirectory() as d:
            snap = make_fixture_snapshot(Path(d) / "it's a dir")
            con = open_snapshot(snap, user_root=Path(d) / "user")
            self.assertEqual(con.execute("SELECT count(*) FROM tests").fetchone(), (3,))
            con.close()


class UserLayerTest(unittest.TestCase):
    def test_user_layer_and_bad_names(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            make_snapshot(root / "user" / "ana", [fixture_test("USER-ana", "lab.csv", 1, "solid", 30.0, scope="user:ana")], [], [])
            with_user = open_snapshot(snap, user="ana", user_root=root / "user")
            self.assertEqual(with_user.execute("SELECT count(*) FROM tests").fetchone(), (4,))
            self.assertEqual(with_user.execute("SELECT scope FROM tests WHERE investigation = 'USER-ana'").fetchone(), ("user:ana",))
            with_user.close()
            without = open_snapshot(snap, user_root=root / "user")
            self.assertEqual(without.execute("SELECT count(*) FROM tests").fetchone(), (3,))
            without.close()
            for bad in ["../etc", "Ana", "a/b", "", "x" * 33]:
                with self.assertRaises(ValueError, msg=bad):
                    open_snapshot(snap, user=bad, user_root=root / "user")
            with self.assertRaisesRegex(ValueError, "no dataset for user bob"):
                open_snapshot(snap, user="bob", user_root=root / "user")


if __name__ == "__main__":
    unittest.main()
