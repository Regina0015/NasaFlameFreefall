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



class Saffire2Test(unittest.TestCase):
    FILE = "PSI-99_Experimental table_SAFFIRE-2.csv"

    def test_saffire2_row1(self):
        r = map_row(self.FILE, 1)
        self.assertEqual((r["fuel"], r["o2_pct_min"], r["flow_cm_s"]), ("Silicone", 21.5, 20.0))
        self.assertIn("approximate", r["problems"])

    def test_saffire2_to_range_and_empty_material(self):
        r = map_row(self.FILE, 9)
        self.assertEqual((r["o2_pct_min"], r["o2_pct_max"]), (21.9, 22.0))
        self.assertIsNone(r["fuel"])
        self.assertIn("material cell empty", r["problems"])

    def test_saffire2_footnote_row_skipped(self):
        self.assertIsNone(map_row(self.FILE, 12))


class Flex2Test(unittest.TestCase):
    def test_flex2_row1_is_condition_matrix(self):
        r = map_row("PSI-68_Experimental table_Flex2.csv", 1)
        self.assertEqual((r["o2_pct_min"], r["o2_pct_max"]), (17.0, 30.0))
        self.assertEqual((r["pressure_atm_min"], r["pressure_atm_max"]), (0.5, 3.0))
        self.assertIn("condition matrix", r["problems"])


class CfiTest(unittest.TestCase):
    def test_cfi_row1(self):
        r = map_row("PSI-39_Experimental table_CFI.csv", 1)
        self.assertEqual((r["fuel"], r["o2_pct_min"], r["pressure_atm_min"], r["diluent"]), ("C12H26", 21.0, 1.0, "N2"))


class CfigTest(unittest.TestCase):
    def test_cfig_rows(self):
        n = map_row("PSI-159_Experimental table_CFI-G_Normal Flames.csv", 1)
        self.assertEqual(n["o2_pct_min"], 39.39)
        self.assertAlmostEqual(n["pressure_atm_min"], 0.9443956 * 0.986923, places=6)
        self.assertEqual((n["phase"], n["geometry"]), ("gas", "burner"))
        i = map_row("PSI-159_Experimental table_CFI-G_Inverse Flames.csv", 1)
        self.assertEqual(i["o2_pct_min"], 21.0)
        self.assertIn("burner stream", i["problems"])


class BreTest(unittest.TestCase):
    FILE = "PSI-20_Experimental table_ACME BRE.csv"

    def test_bre_bad_cell_is_null_not_3400(self):
        r1 = map_row(self.FILE, 1)
        self.assertEqual((r1["o2_pct_min"], r1["o2_pct_max"]), (21.0, 40.0))
        r5 = map_row(self.FILE, 5)
        self.assertIsNone(r5["o2_pct_max"])
        self.assertIn("3400", r5["problems"])
        self.assertIn("test-day row", r1["problems"])


class SameRTest(unittest.TestCase):
    def test_same_r_row1(self):
        r = map_row("PSI-101_Experimental table_SAME-R.csv", 1)
        self.assertEqual((r["fuel"], r["phase"], r["flow_cm_s"]), ("Kapton", "smoke", 8.1))
        self.assertIsNone(r["o2_pct_min"])
        self.assertIn("O2 not in table", r["problems"])


if __name__ == "__main__":
    unittest.main()
