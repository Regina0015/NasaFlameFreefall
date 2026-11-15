import copy
import json
import unittest

from scripts.investigations import load_tiers
from scripts.paths import CONFIG_DIR, PSI_DIR
from scripts.write_investigation import build_record

RECORD = json.loads((PSI_DIR / "PSI-25.json").read_text(encoding="utf-8"))
TIERS = load_tiers(CONFIG_DIR / "tiers.md")
NOW = "2026-11-14T12:00:00Z"


def valid_draft() -> dict:
    return {
        "id": "PSI-25",
        "summary_student": {"text": "Astronauts burned plastic and fabric samples on the space station to see how flames grow and go out without gravity.",
                            "sources": ["objective", "approach"]},
        "summary_professional": {"text": "Flame spread and extinction limits of solid fuels in low-velocity forced flow in microgravity.",
                                 "sources": ["objective", "10.1016/j.combustflame.2017.03.001"]},
        "pillar": {"value": "prevention", "reason": "It maps when solid materials ignite and keep burning.",
                   "sources": ["objective"]},
        "environments": [{"environment": "space_station", "reason": "Tests ran aboard the ISS in its cabin air.",
                          "sources": ["flightProgram"]}],
        "model": "claude-opus-5-5",
    }


class BuildRecordTest(unittest.TestCase):
    def test_valid_draft_merges_facts_and_tier(self):
        rec, problems = build_record(RECORD, valid_draft(), TIERS, NOW)
        self.assertEqual(problems, [])
        self.assertEqual((rec["id"], rec["doi"], rec["tier"]), ("PSI-25", "10.60555/4qc4-de67", 1))
        self.assertEqual((rec["generated_by"]["agent"], rec["reviewed_by"]), ("investigator", None))

    def test_number_not_in_record_is_rejected(self):
        d = valid_draft()
        d["summary_professional"]["text"] += " Tests reached 31% O2."
        rec, problems = build_record(RECORD, d, TIERS, NOW)
        self.assertIsNone(rec)
        self.assertTrue(any('"31"' in p for p in problems), problems)

    def test_number_in_record_is_allowed(self):
        d = valid_draft()
        d["summary_professional"]["text"] += " Oxygen ranged from 21 to 40 percent in ground tests."
        self.assertEqual(build_record(RECORD, d, TIERS, NOW)[1], [])

    def test_unknown_source_is_rejected(self):
        d = valid_draft()
        d["pillar"]["sources"] = ["wikipedia"]
        self.assertIsNone(build_record(RECORD, d, TIERS, NOW)[0])

    def test_doi_not_in_record_is_rejected(self):
        d = valid_draft()
        d["summary_professional"]["sources"] = ["10.9999/made-up"]
        self.assertIsNone(build_record(RECORD, d, TIERS, NOW)[0])

    def test_empty_field_cannot_be_cited(self):
        record = copy.deepcopy(RECORD)
        record["hypothesis"] = ""
        d = valid_draft()
        d["pillar"]["sources"] = ["hypothesis"]
        self.assertIsNone(build_record(record, d, TIERS, NOW)[0])

    def test_draft_cannot_set_tier(self):
        d = valid_draft()
        d["tier"] = 1
        rec, problems = build_record(RECORD, d, TIERS, NOW)
        self.assertIsNone(rec)
        self.assertTrue(any("tier" in p for p in problems))

    def test_bad_pillar_is_rejected_by_schema(self):
        d = valid_draft()
        d["pillar"]["value"] = "maybe"
        self.assertIsNone(build_record(RECORD, d, TIERS, NOW)[0])

    def test_pillar_none_when_psi_states_no_fire_safety_use(self):
        # PSI-22 says it does not serve space applications: "none" with a sourced reason, never a forced pillar.
        d = valid_draft()
        d["pillar"] = {"value": "none", "reason": "The record states no fire-safety use.", "sources": ["researchImpacts"]}
        rec, problems = build_record(RECORD, d, TIERS, NOW)
        self.assertEqual(problems, [])
        self.assertEqual(rec["pillar"]["value"], "none")

    def test_wrong_id_is_rejected(self):
        d = valid_draft()
        d["id"] = "PSI-26"
        self.assertIsNone(build_record(RECORD, d, TIERS, NOW)[0])


if __name__ == "__main__":
    unittest.main()
