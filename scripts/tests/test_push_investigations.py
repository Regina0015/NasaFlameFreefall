import unittest

from scripts import push_investigations as push


def _record(pillar="prevention", envs=("lunar_habitat",), student="S", pro="P"):
    return {"pillar": {"value": pillar}, "environments": [{"environment": e} for e in envs],
            "summary_student": {"text": student}, "summary_professional": {"text": pro}}


DB = [{"id": "PSI-25", "pillar": "prevention", "environments": "lunar_habitat", "summary_student": "S",
       "summary_professional": "P", "title": "untouched"},
      {"id": "PSI-69", "pillar": None, "environments": None, "summary_student": None, "summary_professional": None}]


class PushInvestigationsTest(unittest.TestCase):
    def test_only_changed_fields_of_reviewed_columns(self):
        records = {"PSI-25": _record(), "PSI-69": _record("suppression", ("iss", "spacecraft"), "s2", "p2")}
        changes, problems = push.changes(DB, records)
        self.assertEqual(problems, [])
        self.assertEqual(changes, {"PSI-69": {"pillar": "suppression", "environments": "iss,spacecraft",
                                              "summary_student": "s2", "summary_professional": "p2"}})

    def test_record_not_in_the_database_is_a_problem_not_an_insert(self):
        changes, problems = push.changes(DB, {"PSI-999": _record()})
        self.assertEqual(changes, {})
        self.assertEqual(problems, ["PSI-999: not in the database's investigations table; nothing sent"])

    def test_apply_patches_each_id_with_only_its_changes(self):
        sent = []
        push.apply({"PSI-69": {"pillar": "suppression"}}, lambda id_, fields: sent.append((id_, fields)))
        self.assertEqual(sent, [("PSI-69", {"pillar": "suppression"})])

    def test_reviewed_fields_are_the_ones_build_snapshot_uses(self):
        from scripts import build_snapshot
        self.assertIs(build_snapshot.reviewed_fields, push.reviewed_fields)
        self.assertEqual(push.reviewed_fields(_record("detection", ())),
                         {"pillar": "detection", "environments": None, "summary_student": "S", "summary_professional": "P"})


if __name__ == "__main__":
    unittest.main()
