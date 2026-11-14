import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from scripts import numbers
from scripts.findings import load, save
from scripts.make_chart import build_chart, main
from scripts.paths import CONFIG_DIR, SCHEMAS_DIR
from scripts.tests.helpers import NO_OFFER, fixture_calc, fixture_finding, make_fixture_snapshot

LABELS = {"PSI-25": "BASS-II", "PSI-69": "FLEX"}
FINDING = fixture_finding()
SCHEMA = Draft202012Validator(json.loads((SCHEMAS_DIR / "finding.schema.json").read_text(encoding="utf-8")))


def sql_finding(values: dict) -> dict:
    method = {"script": "scripts/functions.py", "function": "sql_query", "params": {"sql": "SELECT 1"}, "formula": "f"}
    return {**FINDING, "values": values, "method": method}


ONE_VALUE_FINDING = sql_finding({"k": {"value": 1.0, "unit": "u"}})


class BuildChartTest(unittest.TestCase):
    def test_o2_range_chart(self):
        spec = build_chart(FINDING, LABELS)
        self.assertIn("vega-lite/v6", spec["$schema"])
        self.assertNotIn("datasets", spec)
        self.assertEqual(spec["data"]["values"], [{"investigation": "BASS-II", "o2_min_pct": 21.0, "o2_max_pct": 22.2},
                                                  {"investigation": "FLEX", "o2_min_pct": 34.0, "o2_max_pct": 34.0}])
        self.assertIn("30", json.dumps(spec["layer"][1]))
        self.assertIn("Threshold: 30% O2", json.dumps(spec))
        self.assertEqual(spec["title"], "Oxygen levels tested (% O2)")
        self.assertIn('"Oxygen (% O2)"', json.dumps(spec["layer"][0]))

    def test_chart_numbers_trace_to_values(self):
        spec = build_chart(FINDING, LABELS)
        allowed = numbers.collect(FINDING["values"]) | numbers.collect(FINDING["method"]["params"])
        self.assertTrue(numbers.collect(spec["data"]["values"]) <= allowed)

    def test_labels_fall_back_to_ids(self):
        spec = build_chart(FINDING, {})
        self.assertEqual([r["investigation"] for r in spec["data"]["values"]], ["PSI-25", "PSI-69"])

    def test_single_value_has_no_chart(self):
        with self.assertRaisesRegex(ValueError, "no chart for this finding"):
            build_chart(ONE_VALUE_FINDING, LABELS)

    def test_coverage_chart(self):
        calc = fixture_calc("coverage_by_environment", "lunar_base", CONFIG_DIR / "environments.md")
        finding = fixture_finding(calc, claim="One droplet test reached the lunar oxygen level; no solid test did.",
                                  summary_professional="Droplet: 1 test at or above the oxygen target.",
                                  summary_student="Only one droplet test matched.", visual_offer=NO_OFFER)
        spec = build_chart(finding, LABELS)
        self.assertEqual(spec["data"]["values"], [{"phase": "droplet", "o2_match": 1, "o2_and_pressure_match": 1},
                                                  {"phase": "solid", "o2_match": 0, "o2_and_pressure_match": 0}])
        self.assertEqual(spec["title"], "Tests within the lunar base atmosphere (tests)")
        self.assertTrue(numbers.collect(spec["data"]["values"]) <= numbers.collect(finding["values"]))

    def test_sql_chart_needs_one_unit(self):
        spec = build_chart(sql_finding({"a": {"value": 2, "unit": "tests"}, "b": {"value": 5, "unit": "tests"}}), LABELS)
        self.assertEqual(spec["data"]["values"], [{"name": "a", "value": 2}, {"name": "b", "value": 5}])
        with self.assertRaisesRegex(ValueError, "no chart for this finding: .*unit"):
            build_chart(sql_finding({"a": {"value": 2, "unit": "tests"}, "b": {"value": 5, "unit": "% O2"}}), LABELS)

    def test_unknown_function_has_no_chart(self):
        other = {**FINDING, "method": {**FINDING["method"], "function": "something_else"}}
        with self.assertRaisesRegex(ValueError, "no chart for this finding"):
            build_chart(other, LABELS)


class ChartCliTest(unittest.TestCase):
    def test_cli_bumps_version_and_validates(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            findings_dir = root / "findings"
            save(FINDING, findings_dir)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["F-001"], findings_dir=findings_dir, snapshot_dir=snap), 0)
            saved = load("F-001", findings_dir)
            self.assertEqual(saved["version"], 2)
            self.assertEqual(saved["chart"]["data"]["values"][0]["investigation"], "BASS-II")
            self.assertEqual(list(SCHEMA.iter_errors(saved)), [])
            self.assertTrue((findings_dir / "history" / "F-001.v1.json").exists())
            self.assertIn("F-001.json", out.getvalue())

    def test_cli_reports_no_chart(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            save(ONE_VALUE_FINDING, root / "findings")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["F-001"], findings_dir=root / "findings", snapshot_dir=snap), 1)
            self.assertIn("no chart for this finding", out.getvalue())
            self.assertEqual(load("F-001", root / "findings")["version"], 1)


if __name__ == "__main__":
    unittest.main()
