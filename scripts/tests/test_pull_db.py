import csv
import tempfile
import unittest
from pathlib import Path

from scripts import contract, pull_db


def _db_rows():
    """What the database returns: JSON objects for the JSON columns, numbers as numbers."""
    test = {c.name: None for c in contract.TESTS}
    test.update(test_id="PSI-25-T0-R2", investigation="PSI-25", source_table="t.csv", source_row=2,
                fuel="PMMA", phase="solid", o2_pct_min=21, o2_pct_max=22.2, gravity="microgravity",
                other={"b": "–", "a": "1"}, raw={}, field_sources={}, scope="psi")
    first = dict(test, test_id="PSI-25-T0-R1", source_row=1)
    later = dict(test, test_id="PSI-10-T0-R1", investigation="PSI-10", source_row=1)
    inv = {c.name: "" for c in contract.INVESTIGATIONS}
    inv.update(id="PSI-25", tier=1, scope="psi")
    rel = {"id": 7, "from_id": "PSI-25", "to_id": "PSI-10", "type": "same_fuel", "source": "tests.fuel", "scope": "psi"}
    return {"tests": [test, first, later], "investigations": [inv], "relations": [rel]}


class PullDbTest(unittest.TestCase):
    def test_cell_matches_the_snapshot_format(self):
        self.assertEqual(pull_db.cell(None), "")
        self.assertEqual(pull_db.cell({"b": "–", "a": "1"}), '{"a": "1", "b": "–"}')
        self.assertEqual(pull_db.cell(22.2, "DOUBLE"), "22.2")
        self.assertEqual(pull_db.cell(21, "DOUBLE"), "21.0")  # build_snapshot writes doubles as Python floats
        self.assertEqual(pull_db.cell(2, "INTEGER"), "2")

    def test_writes_contract_columns_in_snapshot_order(self):
        rows = _db_rows()
        with tempfile.TemporaryDirectory() as d:
            counts = pull_db.pull(Path(d), lambda table: rows[table])
            self.assertEqual(counts, {"tests": 3, "investigations": 1, "relations": 1})
            with open(Path(d) / "tests.csv", encoding="utf-8", newline="") as f:
                got = list(csv.reader(f))
            self.assertEqual(got[0], [c.name for c in contract.TESTS])
            self.assertEqual([r[0] for r in got[1:]], ["PSI-10-T0-R1", "PSI-25-T0-R1", "PSI-25-T0-R2"])
            with open(Path(d) / "relations.csv", encoding="utf-8", newline="") as f:
                self.assertEqual(next(csv.reader(f)), [c.name for c in contract.RELATIONS])  # no database id

    def test_missing_column_writes_nothing(self):
        rows = _db_rows()
        del rows["relations"][0]["source"]
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, "relations.*source"):
                pull_db.pull(Path(d), lambda table: rows[table])
            self.assertEqual(list(Path(d).iterdir()), [])

    def test_check_reports_changed_tables_without_writing(self):
        rows = _db_rows()
        with tempfile.TemporaryDirectory() as d:
            pull_db.pull(Path(d), lambda table: rows[table])
            rows["investigations"][0]["tier"] = 2
            before = (Path(d) / "investigations.csv").read_bytes()
            self.assertEqual(pull_db.differences(Path(d), lambda table: rows[table]), ["investigations"])
            self.assertEqual((Path(d) / "investigations.csv").read_bytes(), before)

    def test_reads_pages_until_a_short_one(self):
        pages = [[{"n": i} for i in range(1000)], [{"n": 1000}]]
        calls = []

        def get(path, offset):
            calls.append(offset)
            return pages[len(calls) - 1]

        self.assertEqual(len(pull_db.read_all(get, "tests")), 1001)
        self.assertEqual(calls, [0, 1000])

    def test_env_file_values_without_printing_them(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / ".env"
            path.write_text("# comment\nSUPABASE_URL = https://x.supabase.co/\nSUPABASE_SERVICE_ROLE_KEY=k\n", encoding="utf-8")
            self.assertEqual(pull_db.read_env(path), {"SUPABASE_URL": "https://x.supabase.co/", "SUPABASE_SERVICE_ROLE_KEY": "k"})


if __name__ == "__main__":
    unittest.main()
