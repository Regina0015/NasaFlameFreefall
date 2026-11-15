import tempfile
import unittest
from pathlib import Path

from scripts.load_snapshot import convert, read_env, read_snapshot
from scripts.paths import SNAPSHOT_DIR


class ConvertTest(unittest.TestCase):
    def test_types_and_empty_cells(self):
        row = convert("tests", {"test_id": "PSI-25-T0-R1", "source_row": "1", "o2_pct_min": "22.2",
                                "flow_cm_s": "", "raw": '{"Test #": "B1"}', "other": "{}", "problems": ""})
        self.assertEqual(row["source_row"], 1)
        self.assertEqual(row["o2_pct_min"], 22.2)
        self.assertIsNone(row["flow_cm_s"])
        self.assertIsNone(row["problems"])
        self.assertEqual(row["raw"], {"Test #": "B1"})
        self.assertIsNone(row["fuel"])  # column missing from the input -> NULL


class ReadEnvTest(unittest.TestCase):
    def test_reads_keys_and_ignores_comments(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / ".env"
            path.write_text("# comment\nSUPABASE_URL=https://x.supabase.co\nSUPABASE_SERVICE_ROLE_KEY='abc'\n",
                            encoding="utf-8")
            env = read_env(path)
        self.assertEqual(env["SUPABASE_URL"], "https://x.supabase.co")
        self.assertEqual(env["SUPABASE_SERVICE_ROLE_KEY"], "abc")


class ReadSnapshotTest(unittest.TestCase):
    def test_snapshot_rows_have_contract_types(self):
        tables = read_snapshot(SNAPSHOT_DIR)
        self.assertEqual(len(tables["investigations"]), 24)
        self.assertGreater(len(tables["tests"]), 1900)
        self.assertTrue(all(isinstance(t["source_row"], int) for t in tables["tests"]))
        self.assertTrue(all(isinstance(t["raw"], dict) for t in tables["tests"]))
        ids = {i["id"] for i in tables["investigations"]}
        self.assertTrue(all(t["investigation"] in ids for t in tables["tests"]))
