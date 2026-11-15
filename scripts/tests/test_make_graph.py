import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

from scripts.findings import load, save
from scripts.make_graph import build_graph, main
from scripts.paths import SCHEMAS_DIR
from scripts.tests.helpers import fixture_finding, make_fixture_snapshot

SCHEMA = json.loads((SCHEMAS_DIR / "finding.schema.json").read_text(encoding="utf-8"))
GRAPH_SCHEMA = Draft202012Validator(SCHEMA["properties"]["graph"])
FULL_SCHEMA = Draft202012Validator(SCHEMA)
FINDING = fixture_finding()
LABELS = {"PSI-25": "BASS-II", "PSI-69": "FLEX", "PSI-26": "BASS", "PSI-62": "BASS-ground", "PSI-39": "CFI"}
RELATIONS = [
    {"from_id": "PSI-25", "to_id": "PSI-26", "type": "related_in_psi", "source": "related_glds", "scope": "psi"},
    {"from_id": "PSI-62", "to_id": "PSI-25", "type": "reuses_flight_data", "source": "related_glds + projectType", "scope": "psi"},
    {"from_id": "PSI-69", "to_id": "PSI-39", "type": "same_hardware", "source": "experimentHardware: CIR", "scope": "psi"},
]


class BuildGraphTest(unittest.TestCase):
    def test_nodes_and_neighbors(self):
        g = build_graph(FINDING, RELATIONS, LABELS)
        self.assertEqual({n["id"] for n in g["nodes"]}, {"F-001", "o2_range", "PSI-25", "PSI-69", "PSI-26", "PSI-62"})

    def test_every_edge_has_source(self):
        g = build_graph(FINDING, RELATIONS, LABELS)
        self.assertTrue(all(e["source"] for e in g["edges"]))
        self.assertIn({"from": "o2_range", "to": "PSI-25", "type": "uses_data_from", "source": "evidence[0]"}, g["edges"])
        self.assertIn({"from": "o2_range", "to": "PSI-69", "type": "uses_data_from", "source": "evidence[1]"}, g["edges"])
        self.assertIn({"from": "F-001", "to": "o2_range", "type": "computed_with", "source": "method"}, g["edges"])
        self.assertIn({"from": "PSI-62", "to": "PSI-25", "type": "reuses_flight_data", "source": "related_glds + projectType"}, g["edges"])

    def test_node_types_and_labels(self):
        nodes = {n["id"]: n for n in build_graph(FINDING, RELATIONS, LABELS)["nodes"]}
        self.assertEqual((nodes["F-001"]["type"], nodes["o2_range"]["type"], nodes["PSI-26"]["type"]), ("finding", "method", "investigation"))
        self.assertEqual((nodes["PSI-25"]["label"], nodes["PSI-62"]["label"]), ("BASS-II", "BASS-ground"))
        self.assertEqual(build_graph(FINDING, RELATIONS, {})["nodes"][2]["label"], "PSI-25")

    def test_same_hardware_only_between_evidence(self):
        both = RELATIONS + [{"from_id": "PSI-25", "to_id": "PSI-69", "type": "same_fuel", "source": "fuel: n-heptane", "scope": "psi"}]
        g = build_graph(FINDING, both, LABELS)
        types = [(e["from"], e["to"], e["type"]) for e in g["edges"]]
        self.assertIn(("PSI-25", "PSI-69", "same_fuel"), types)
        self.assertNotIn(("PSI-69", "PSI-39", "same_hardware"), types)

    def test_relations_without_source_or_far_away_are_skipped(self):
        extra = RELATIONS + [{"from_id": "PSI-25", "to_id": "PSI-47", "type": "related_in_psi", "source": "", "scope": "psi"},
                             {"from_id": "PSI-26", "to_id": "PSI-101", "type": "related_in_psi", "source": "related_glds", "scope": "psi"}]
        ids = {n["id"] for n in build_graph(FINDING, extra, LABELS)["nodes"]}
        self.assertNotIn("PSI-47", ids)
        self.assertNotIn("PSI-101", ids)

    def test_long_claim_label_is_cut(self):
        long = dict(FINDING, claim="BASS-II " + "and FLEX " * 20)
        label = build_graph(long, RELATIONS, LABELS)["nodes"][0]["label"]
        self.assertLessEqual(len(label), 80)
        self.assertTrue(label.startswith("BASS-II and FLEX"))

    def test_long_investigation_titles_are_cut(self):
        title = "Concurrent Flame Spread Modeling using Flamelet Generated Manifolds in Microgravity"
        nodes = {n["id"]: n for n in build_graph(FINDING, RELATIONS, dict(LABELS, **{"PSI-62": title}))["nodes"]}
        self.assertLessEqual(len(nodes["PSI-62"]["label"]), 40)
        self.assertTrue(nodes["PSI-62"]["label"].startswith("Concurrent Flame Spread"))

    def test_graph_validates(self):
        self.assertEqual(list(GRAPH_SCHEMA.iter_errors(build_graph(FINDING, RELATIONS, LABELS))), [])

    def test_no_evidence_has_no_graph(self):
        with self.assertRaisesRegex(ValueError, "no graph for this finding"):
            build_graph(dict(FINDING, evidence=[]), RELATIONS, LABELS)


class GraphCliTest(unittest.TestCase):
    def test_cli_bumps_version_and_uses_snapshot_relations(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            snap = make_fixture_snapshot(root / "snapshot")
            save(FINDING, root / "findings")
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(main(["F-001"], findings_dir=root / "findings", snapshot_dir=snap), 0)
            saved = load("F-001", root / "findings")
            self.assertEqual(saved["version"], 2)
            self.assertIn("PSI-26", {n["id"] for n in saved["graph"]["nodes"]})
            self.assertEqual(list(FULL_SCHEMA.iter_errors(saved)), [])
            self.assertIn("F-001.json", out.getvalue())


if __name__ == "__main__":
    unittest.main()
