import unittest

from scripts.investigations import derive_relations, facts, load_tiers
from scripts.mdtable import parse_table
from scripts.paths import CONFIG_DIR


def rec(accession: str, related: str = "", hw: str = "", ground: bool = False, acronym: str = "X") -> dict:
    return {"accession": accession, "investigationAcronym": acronym, "title": f"Title {accession}",
            "doi": f"10.0/{accession}", "related_glds": related, "experimentHardware": hw,
            "projectType": "Ground Investigation" if ground else "Microgravity Investigation",
            "subResearchArea": "Spacecraft Fire Safety", "flightProgram": "ISS"}


def triples(relations: list[dict]) -> list[tuple]:
    return [(r["from_id"], r["to_id"], r["type"]) for r in relations]


class RelationsTest(unittest.TestCase):
    def test_related_in_psi_is_undirected_and_deduplicated(self):
        recs = [rec("PSI-25", related="PSI-26"), rec("PSI-26", related="PSI-25")]
        rel = derive_relations(recs, [])
        self.assertEqual(triples(rel), [("PSI-25", "PSI-26", "related_in_psi")])
        self.assertEqual(rel[0]["source"], "related_glds")

    def test_ground_study_reuses_flight_data(self):
        recs = [rec("PSI-62", related="PSI-25", ground=True), rec("PSI-25")]
        self.assertIn(("PSI-62", "PSI-25", "reuses_flight_data"), triples(derive_relations(recs, [])))

    def test_related_outside_set_is_ignored(self):
        self.assertEqual(derive_relations([rec("PSI-181", related="PSI-77")], []), [])

    def test_same_hardware_keyword_and_source(self):
        recs = [rec("PSI-25", hw="Microgravity Science Glovebox (MSG)"), rec("PSI-26", hw="Microgravity Science Glovebox")]
        r = [x for x in derive_relations(recs, []) if x["type"] == "same_hardware"][0]
        self.assertEqual((r["from_id"], r["to_id"], r["source"]), ("PSI-25", "PSI-26", "experimentHardware: MSG"))

    def test_same_fuel_from_tests(self):
        tests = [{"investigation": "PSI-25", "fuel": "PMMA rod"}, {"investigation": "PSI-26", "fuel": "pmma sheet"}]
        self.assertIn(("PSI-25", "PSI-26", "same_fuel"), triples(derive_relations([rec("PSI-25"), rec("PSI-26")], tests)))

    def test_methane_is_not_ethane(self):
        tests = [{"investigation": "PSI-20", "fuel": "100% CH4"}, {"investigation": "PSI-159", "fuel": "ethane"}]
        self.assertEqual([r for r in derive_relations([rec("PSI-20"), rec("PSI-159")], tests) if r["type"] == "same_fuel"], [])

    def test_all_edges_have_psi_scope(self):
        recs = [rec("PSI-25", related="PSI-26", hw="MSG Microgravity Science Glovebox"), rec("PSI-26", hw="Microgravity Science Glovebox")]
        self.assertTrue(all(r["scope"] == "psi" for r in derive_relations(recs, [])))


class FactsTest(unittest.TestCase):
    def test_ground_study_label_falls_back_to_title(self):
        f = facts(rec("PSI-62", ground=True, acronym=""))
        self.assertEqual((f["id"], f["type"], f["label"], f["doi"]), ("PSI-62", "ground", "Title PSI-62", "10.0/PSI-62"))

    def test_flight(self):
        self.assertEqual(facts(rec("PSI-25"))["type"], "flight")


class TiersTest(unittest.TestCase):
    def test_load_tiers_boost(self):
        t = load_tiers(CONFIG_DIR / "tiers.md")
        self.assertEqual(len(t), 24)
        self.assertEqual(t["PSI-20"]["tier"], 2)
        self.assertEqual(t["PSI-20"]["boost"], ["transit_vehicle", "lunar_base"])
        self.assertEqual(t["PSI-25"]["tier"], 1)
        self.assertEqual(t["PSI-25"]["boost"], [])


class MdTableTest(unittest.TestCase):
    def test_parse_first_table_under_heading(self):
        text = "# T\n\n## Other\n| a |\n|---|\n| 0 |\n\n## Wanted\n\nIntro.\n\n| x | y |\n|---|---|\n| 1 |  |\n| 2 | b |\n\nAfter.\n"
        self.assertEqual(parse_table(text, "Wanted"), [{"x": "1", "y": ""}, {"x": "2", "y": "b"}])

    def test_missing_heading(self):
        with self.assertRaises(ValueError):
            parse_table("## A\n| x |\n|---|\n| 1 |\n", "B")


if __name__ == "__main__":
    unittest.main()
