import json
import unittest

from scripts.cells import read_table
from scripts.mappers import MAPPERS
from scripts.paths import PSI_DIR


def map_row(file_name: str, source_row: int) -> dict:
    """Map one real PSI row: read the table, take that source row, call its mapper."""
    investigation = file_name.split("_")[0]
    cells = dict(read_table(PSI_DIR / file_name))[source_row]
    return MAPPERS[file_name](investigation, source_row, cells)


class Bass2Test(unittest.TestCase):
    FILE = "PSI-25_Experimental table_BASS-II.csv"

    def test_bass2_row1(self):
        r = map_row(self.FILE, 1)
        self.assertEqual(r["fuel"], "100 micron PMMA film 2 cm wide")
        self.assertEqual((r["phase"], r["geometry"]), ("solid", "film"))
        self.assertEqual((r["o2_pct_min"], r["o2_pct_max"]), (22.2, 22.2))
        self.assertIn("pressure not in table", r["problems"])
        self.assertEqual(json.loads(r["field_sources"])["o2_pct_min"], "Calibrated initial O2 % by vol")
        self.assertEqual((r["gravity"], r["scope"]), ("microgravity", "psi"))

    def test_bass2_keeps_raw_cells(self):
        r = map_row(self.FILE, 1)
        self.assertEqual(json.loads(r["raw"])["Test #"], "B1")


class FlexTest(unittest.TestCase):
    FILE = "PSI-69_Experimental table_FLEX.csv"

    def test_flex_row1(self):
        r = map_row(self.FILE, 1)
        self.assertEqual((r["fuel"], r["o2_pct_min"], r["diluent"]), ("Methanol", 21.0, "N2"))
        self.assertAlmostEqual(r["pressure_atm_min"], 757.7 / 760, places=6)
        self.assertEqual((r["phase"], r["geometry"]), ("droplet", "droplet"))


if __name__ == "__main__":
    unittest.main()
