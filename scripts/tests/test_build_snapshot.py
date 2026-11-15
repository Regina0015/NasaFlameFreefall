import csv
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
            for name in ["tests.csv", "catalog.md", "investigations.csv", "relations.csv"]:
                self.assertEqual((Path(a) / name).read_bytes(), (Path(b) / name).read_bytes(), name)



class InvestigationsAndRelationsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        build(PSI_DIR, Path(cls.tmp.name))
        with open(Path(cls.tmp.name) / "investigations.csv", encoding="utf-8") as f:
            cls.investigations = list(csv.DictReader(f))
        with open(Path(cls.tmp.name) / "relations.csv", encoding="utf-8") as f:
            cls.relations = list(csv.DictReader(f))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_24_investigations_with_tiers(self):
        self.assertEqual(len(self.investigations), 24)
        bass2 = next(r for r in self.investigations if r["id"] == "PSI-25")
        self.assertEqual((bass2["doi"], bass2["tier"], bass2["label"]), ("10.60555/4qc4-de67", "1", "BASS-II"))
        bre = next(r for r in self.investigations if r["id"] == "PSI-20")
        self.assertEqual(bre["boost_environments"], "transit_vehicle,lunar_base")

    def test_expected_relations(self):
        triples = {(r["from_id"], r["to_id"], r["type"]) for r in self.relations}
        self.assertIn(("PSI-25", "PSI-26", "related_in_psi"), triples)
        self.assertIn(("PSI-62", "PSI-25", "reuses_flight_data"), triples)
        self.assertIn(("PSI-25", "PSI-26", "same_hardware"), triples)
        self.assertEqual(len(triples), len(self.relations))


if __name__ == "__main__":
    unittest.main()
