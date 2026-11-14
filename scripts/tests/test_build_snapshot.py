import tempfile
import unittest
from pathlib import Path

from scripts.build_snapshot import build, build_tests
from scripts.paths import PSI_DIR


class RegressionTest(unittest.TestCase):
    def test_regression_o2_ranges(self):
        rows, _ = build_tests(PSI_DIR)
        bass = [r for r in rows if r["investigation"] == "PSI-25"]
        flex = [r for r in rows if r["investigation"] == "PSI-69"]
        self.assertEqual(len(bass), 129)
        self.assertEqual(len(flex), 274)
        self.assertEqual((min(r["o2_pct_min"] for r in bass), max(r["o2_pct_max"] for r in bass)), (13.6, 22.2))
        self.assertEqual((min(r["o2_pct_min"] for r in flex), max(r["o2_pct_max"] for r in flex)), (12.0, 34.0))
        self.assertEqual(sum(r["o2_pct_max"] >= 30 for r in flex), 24)

    def test_test_ids_are_unique(self):
        rows, _ = build_tests(PSI_DIR)
        ids = [r["test_id"] for r in rows]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("PSI-25-T0-R1", ids)


class IdempotenceTest(unittest.TestCase):
    def test_build_twice_is_identical(self):
        with tempfile.TemporaryDirectory() as a, tempfile.TemporaryDirectory() as b:
            build(PSI_DIR, Path(a))
            build(PSI_DIR, Path(b))
            for name in ["tests.csv", "catalog.md"]:
                self.assertEqual((Path(a) / name).read_bytes(), (Path(b) / name).read_bytes(), name)


if __name__ == "__main__":
    unittest.main()
