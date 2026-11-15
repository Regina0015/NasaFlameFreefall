"""Draw the proof graph of a finding, on request: finding -> method -> investigations, plus PSI relations.

Usage (from the repository root): uv run python -m scripts.make_graph F-001
Saves a new version of the finding with `graph` set (the old one goes to history/)
and prints its path. Every edge carries a non-empty source.
"""
import argparse
import csv
import re
import sys
from pathlib import Path

from scripts import findings
from scripts.make_chart import labels_from_snapshot
from scripts.paths import FINDINGS_DIR, SNAPSHOT_DIR
from scripts.write_finding import VALIDATOR

LABEL_LENGTH = 80
INVESTIGATION_LABEL_LENGTH = 40
BETWEEN_EVIDENCE = {"same_hardware", "same_fuel"}
ONE_HOP = {"related_in_psi", "reuses_flight_data"}


def _short(text: str, length: int = LABEL_LENGTH) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= length else text[: length - 1].rstrip() + "…"


def _label(labels: dict[str, str], investigation: str) -> str:
    return _short(labels.get(investigation) or investigation, INVESTIGATION_LABEL_LENGTH)


def _order(investigation: str):
    match = re.match(r"^(\D*)(\d+)", investigation)
    return (match.group(1), int(match.group(2)), investigation) if match else (investigation, 0, investigation)


def relations_from_snapshot(snapshot_dir: Path = SNAPSHOT_DIR) -> list[dict]:
    with open(Path(snapshot_dir) / "relations.csv", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def build_graph(finding: dict, relations: list[dict], labels: dict[str, str]) -> dict:
    evidence = [e for e in finding.get("evidence") or [] if isinstance(e, dict) and e.get("investigation")]
    if not evidence:
        raise ValueError("no graph for this finding: it has no evidence")
    fid = finding["id"]
    method = finding["method"]["function"]
    nodes = [{"id": fid, "type": "finding", "label": _short(finding.get("claim", fid))},
             {"id": method, "type": "method", "label": method}]
    edges = [{"from": fid, "to": method, "type": "computed_with", "source": "method"}]

    sources: dict[str, list[str]] = {}
    for i, item in enumerate(evidence):
        sources.setdefault(item["investigation"], []).append(f"evidence[{i}]")
    in_evidence = set(sources)
    for investigation, where in sources.items():
        nodes.append({"id": investigation, "type": "investigation", "label": _label(labels, investigation)})
        edges.append({"from": method, "to": investigation, "type": "uses_data_from", "source": ", ".join(where)})

    neighbors: set[str] = set()
    relation_edges = {}
    for r in relations:
        a, b, kind, source = r.get("from_id"), r.get("to_id"), r.get("type"), (r.get("source") or "").strip()
        if not (a and b and source) or a == b:
            continue
        if kind in BETWEEN_EVIDENCE and a in in_evidence and b in in_evidence:
            pass
        elif kind in ONE_HOP and (a in in_evidence or b in in_evidence):
            neighbors.update({a, b} - in_evidence)
        else:
            continue
        relation_edges.setdefault((kind, a, b), {"from": a, "to": b, "type": kind, "source": source})
    nodes += [{"id": n, "type": "investigation", "label": _label(labels, n)} for n in sorted(neighbors, key=_order)]
    edges += [relation_edges[k] for k in sorted(relation_edges, key=lambda k: (k[0], _order(k[1]), _order(k[2])))]
    return {"nodes": nodes, "edges": edges}


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, snapshot_dir: Path = SNAPSHOT_DIR) -> int:
    parser = argparse.ArgumentParser(description="Draw the proof graph of a finding.")
    parser.add_argument("finding_id")
    args = parser.parse_args(argv)
    try:
        finding = findings.load(args.finding_id, findings_dir)
        graph = build_graph(finding, relations_from_snapshot(snapshot_dir), labels_from_snapshot(snapshot_dir))
    except (ValueError, OSError) as error:
        print(f"problems:\n- {error}")
        return 1
    path, problems = findings.save_new_version(finding, "graph", graph, VALIDATOR, findings_dir)
    if problems:
        print("problems:\n" + "\n".join(f"- {p}" for p in problems))
        return 1
    print(f"saved {finding['id']} version {finding['version'] + 1}: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
