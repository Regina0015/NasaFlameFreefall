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

    def test_flex_diluent_sources_are_separate_columns(self):
        for n in range(1, 400):
            r = map_row(self.FILE, n)
            if "+" in (r["diluent"] or ""):
                break
        else:
            self.fail("no FLEX row with two diluent gases")
        sources = json.loads(r["field_sources"])["diluent"]
        self.assertEqual(len(sources.split(" | ")), len(r["diluent"].split("+")))
        self.assertNotIn(", ", sources)

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


class FlameDesignTest(unittest.TestCase):
    NORMAL = "PSI-10_Experimental table_Flame Design_Normal Flame.csv"
    INVERSE = "PSI-10_Experimental table_Flame Design_Inverse Flame.csv"

    def test_normal_row1(self):
        r = map_row(self.NORMAL, 1)
        self.assertEqual((r["fuel"], r["phase"], r["geometry"]), ("C2H4", "gas", "burner"))
        self.assertAlmostEqual(r["o2_pct_min"], 20.712837, places=5)
        self.assertEqual(r["o2_pct_min"], r["o2_pct_max"])
        self.assertAlmostEqual(r["pressure_atm_min"], 1.01796816, places=5)
        self.assertEqual(json.loads(r["field_sources"])["o2_pct_min"], "XO2 (init)")

    def test_pressure_falls_back_to_pinit_when_pmean_is_empty(self):
        r = map_row(self.NORMAL, 188)
        self.assertAlmostEqual(r["pressure_atm_min"], 0.931972789, places=6)
        self.assertEqual(r["pressure_atm_min"], r["pressure_atm_max"])
        self.assertEqual(json.loads(r["field_sources"])["pressure_atm_min"], "pinit (atm)")
        self.assertIn("pressure read from pinit", r["problems"])

    def test_normal_ramped_row_is_noted(self):
        self.assertIn("RAMPED", map_row(self.NORMAL, 2)["problems"])

    def test_inverse_fuel_from_header_and_burner_o2(self):
        r = map_row(self.INVERSE, 1)
        self.assertEqual(r["fuel"], "C2H4")
        self.assertEqual(json.loads(r["field_sources"])["fuel"], "XC2H4 initial")
        self.assertAlmostEqual(r["o2_pct_min"], 37.082819, places=5)
        self.assertIn("burner stream", r["problems"])


class SpiceTest(unittest.TestCase):
    FILE = "PSI-107_Experimental table_Spice.csv"

    def test_spice_row1(self):
        r = map_row(self.FILE, 1)
        self.assertEqual((r["fuel"], r["phase"], r["flow_cm_s"]), ("Ethylene", "gas", 36.39))
        self.assertIsNone(r["o2_pct_min"])
        self.assertIn("O2 not in table", r["problems"])
        self.assertEqual(json.loads(r["other"])["Nozzle (mm)"], "1.6002")


class TestDayTablesTest(unittest.TestCase):
    def test_slice_cld_efield_sflame_are_test_days(self):
        for file_name in ("PSI-106_Experimental table_Slice.csv", "PSI-21_Experimental table_CLD Flame.csv",
                          "PSI-22_Experimental table_ACME E-FIELD Flames.csv",
                          "PSI-23_Experimental table_ACME s-Flame.csv"):
            r = map_row(file_name, 1)
            self.assertEqual(r["phase"], "gas", file_name)
            self.assertIn("test-day row", r["problems"], file_name)

    def test_efield_notes_only_rows_are_skipped(self):
        self.assertIsNone(map_row("PSI-22_Experimental table_ACME E-FIELD Flames.csv", 3))

    def test_sflame_atmosphere_text_is_not_parsed(self):
        r = map_row("PSI-23_Experimental table_ACME s-Flame.csv", 1)
        self.assertIsNone(r["o2_pct_min"])
        self.assertEqual(json.loads(r["other"])["Atmosphere*"], "~21% O2 with N2")


class BassTest(unittest.TestCase):
    FILE = "PSI-26_Experimental table_BASS.csv"

    def test_bass_geometry_from_material_text(self):
        self.assertEqual(map_row(self.FILE, 1)["geometry"], "fabric")   # SIBAL 2 cm
        self.assertEqual(map_row(self.FILE, 2)["geometry"], "sphere")   # PMMA sphere 2 cm
        self.assertEqual(map_row(self.FILE, 1)["phase"], "solid")

    def test_bass_soot_cleaning_is_noted(self):
        self.assertIn("soot cleaning", map_row(self.FILE, 66)["problems"])


class SaffireLargeTest(unittest.TestCase):
    def test_saffire1_range_and_approx(self):
        f = "PSI-98_Experimental table_SAFFIRE-1.csv"
        r1, r2 = map_row(f, 1), map_row(f, 2)
        self.assertEqual((r1["o2_pct_min"], r1["o2_pct_max"], r1["flow_cm_s"]), (21.5, 21.7, 20.0))
        self.assertEqual((r2["o2_pct_min"], r2["o2_pct_max"]), (21.5, 21.5))
        self.assertIn("approximate", r2["problems"])
        self.assertEqual(r1["geometry"], "fabric")

    def test_saffire1_flow_visualization_rows_are_skipped(self):
        self.assertIsNone(map_row("PSI-98_Experimental table_SAFFIRE-1.csv", 3))

    def test_saffire3_flow_with_unit_text(self):
        r = map_row("PSI-100_Experimental table_SAFFIRE-3.csv", 1)
        self.assertEqual((r["fuel"], r["flow_cm_s"]), ("SIBAL Fabric", 30.0))
        self.assertIn("O2 not in table", r["problems"])


class SmokeAndDustTest(unittest.TestCase):
    def test_same_row1(self):
        r = map_row("PSI-102_Experimental table_SAME.csv", 1)
        self.assertEqual((r["fuel"], r["phase"], r["flow_cm_s"]), ("Teflon", "smoke", 5.0))

    def test_same_same_conditions_rows_are_not_filled(self):
        r = map_row("PSI-102_Experimental table_SAME.csv", 5)
        self.assertEqual(r["fuel"], "Kapton")
        self.assertIsNone(r["flow_cm_s"])
        self.assertIn("not copied", r["problems"])

    def test_daft_has_no_phase(self):
        r = map_row("PSI-47_Experimental table_DAFT.csv", 1)
        self.assertIsNone(r["phase"])
        self.assertIn("no combustion", r["problems"])


class FigureIndexTest(unittest.TestCase):
    def test_psi142_rows_are_not_tests(self):
        for n in range(1, 9):
            self.assertIsNone(map_row("PSI-142_Experimental table_Data Summary Table.csv", n))


class AllTablesMappedTest(unittest.TestCase):
    def test_every_psi_table_has_a_mapper(self):
        files = sorted(p.name for p in PSI_DIR.glob("PSI-*.csv"))
        self.assertEqual(len(files), 22)
        self.assertEqual([f for f in files if f not in MAPPERS], [])
