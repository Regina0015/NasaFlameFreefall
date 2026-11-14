"""Draw a Vega-Lite chart for a finding, on request, from its stored values only.

Usage (from the repository root): uv run python -m scripts.make_chart F-001
Saves a new version of the finding with `chart` set (the old one goes to history/)
and prints its path, or prints "no chart for this finding: <reason>" and exits 1.
The chart's data come from the finding's `values` and method params: nothing is recomputed.
"""
import argparse
import copy
import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import altair as alt

from scripts import findings
from scripts.functions import investigation_key
from scripts.numbers import canonical
from scripts.paths import FINDINGS_DIR, SNAPSHOT_DIR
from scripts.write_finding import VALIDATOR

alt.data_transformers.consolidate_datasets = False

MEASURE_LABELS = ("datum.label == 'o2_match' ? 'Oxygen at or above the target' : "
                  "'Oxygen at or above the target, pressure at or below it'")


def _no_chart(reason: str) -> ValueError:
    return ValueError(f"no chart for this finding: {reason}")


def labels_from_snapshot(snapshot_dir: Path = SNAPSHOT_DIR) -> dict[str, str]:
    """Investigation id -> short label (acronym, else label, else id)."""
    with open(Path(snapshot_dir) / "investigations.csv", encoding="utf-8", newline="") as f:
        return {row["id"]: (row.get("acronym") or row.get("label") or row["id"]) for row in csv.DictReader(f)}


def _value(values: dict, name: str):
    item = values.get(name)
    return item.get("value") if isinstance(item, dict) else None


def _o2_range_chart(finding: dict, labels: dict[str, str]) -> alt.TopLevelMixin:
    params = finding["method"].get("params") or {}
    values = finding["values"]
    rows = []
    for investigation in params.get("investigations") or []:
        key = investigation_key(investigation)
        low, high = _value(values, f"{key}_o2_min"), _value(values, f"{key}_o2_max")
        if low is not None and high is not None:
            rows.append({"investigation": labels.get(investigation) or investigation, "o2_min_pct": low, "o2_max_pct": high})
    if not rows:
        raise _no_chart("no investigation has oxygen values")
    y = alt.Y("investigation:N", title=None, sort=None)
    tooltip = [alt.Tooltip("investigation:N", title="Investigation"), alt.Tooltip("o2_min_pct:Q", title="Lowest O2 (%)"),
               alt.Tooltip("o2_max_pct:Q", title="Highest O2 (%)")]
    layers = [
        alt.Chart().mark_bar(height=14, opacity=0.8).encode(
            y=y, x=alt.X("o2_min_pct:Q", title="Oxygen (% O2)"), x2="o2_max_pct:Q", tooltip=tooltip),
    ]
    threshold = params.get("threshold_pct")
    if isinstance(threshold, (int, float)) and not isinstance(threshold, bool):
        line = alt.Data(values=[{"threshold_pct": threshold}])
        layers += [
            alt.Chart(line).mark_rule(strokeDash=[6, 4], color="#444").encode(x="threshold_pct:Q"),
            alt.Chart(line).mark_text(align="left", dx=4, dy=8, color="#444",
                                      text=f"Threshold: {canonical(threshold)}% O2").encode(x="threshold_pct:Q", y=alt.value(0)),
        ]
    layers += [alt.Chart().mark_tick(thickness=2).encode(y=y, x=alt.X(f"{end}:Q"), tooltip=tooltip)
               for end in ("o2_min_pct", "o2_max_pct")]
    return alt.layer(*layers, data=alt.Data(values=rows), title="Oxygen levels tested (% O2)")


def _coverage_chart(finding: dict) -> alt.TopLevelMixin:
    values = finding["values"]
    rows = [{"phase": name[: -len("_o2_match")], "o2_match": item.get("value"),
             "o2_and_pressure_match": _value(values, name[: -len("_o2_match")] + "_o2_and_pressure_match")}
            for name, item in values.items() if name.endswith("_o2_match") and isinstance(item, dict)]
    if not rows:
        raise _no_chart("no phase counts in its values")
    environment = str((finding["method"].get("params") or {}).get("environment", "the environment"))
    title = f"Tests within the {environment.replace('_', ' ')} atmosphere (tests)"
    return (alt.Chart(alt.Data(values=rows), title=title)
            .transform_fold(["o2_match", "o2_and_pressure_match"], as_=["measure", "tests"])
            .mark_bar()
            .encode(x=alt.X("phase:N", title="Fuel phase"), xOffset=alt.XOffset("measure:N"),
                    y=alt.Y("tests:Q", title="Tests"),
                    color=alt.Color("measure:N", title=None, legend=alt.Legend(orient="bottom", labelExpr=MEASURE_LABELS)),
                    tooltip=[alt.Tooltip("phase:N", title="Phase"), alt.Tooltip("tests:Q", title="Tests")]))


def _sql_chart(finding: dict) -> alt.TopLevelMixin:
    points = [(name, item["value"], item.get("unit", "")) for name, item in finding["values"].items()
              if isinstance(item, dict) and item.get("value") is not None]
    if len(points) < 2:
        raise _no_chart("fewer than two values have a number")
    units = sorted({unit for _, _, unit in points})
    if len(units) != 1:
        raise _no_chart(f"the values have different units ({', '.join(units)})")
    rows = [{"name": name, "value": value} for name, value, _ in points]
    return (alt.Chart(alt.Data(values=rows), title=f"Computed values ({units[0]})")
            .mark_bar()
            .encode(y=alt.Y("name:N", title=None, sort=None), x=alt.X("value:Q", title=units[0]),
                    tooltip=[alt.Tooltip("name:N", title="Value"), alt.Tooltip("value:Q", title=units[0])]))


def build_chart(finding: dict, labels: dict[str, str]) -> dict:
    """Vega-Lite spec (inline data.values) for the finding's method; ValueError when no chart fits."""
    values = finding.get("values") or {}
    if len(values) < 2:
        raise _no_chart("a chart needs at least two values")
    function = (finding.get("method") or {}).get("function")
    if function == "o2_range":
        chart = _o2_range_chart(finding, labels)
    elif function == "coverage_by_environment":
        chart = _coverage_chart(finding)
    elif function == "sql_query":
        chart = _sql_chart(finding)
    else:
        raise _no_chart(f"no chart kind for the method {function!r}")
    return chart.to_dict()


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, snapshot_dir: Path = SNAPSHOT_DIR) -> int:
    parser = argparse.ArgumentParser(description="Draw a Vega-Lite chart for a finding.")
    parser.add_argument("finding_id")
    args = parser.parse_args(argv)
    try:
        finding = findings.load(args.finding_id, findings_dir)
        spec = build_chart(finding, labels_from_snapshot(snapshot_dir))
    except (ValueError, OSError) as error:
        print(f"problems:\n- {error}")
        return 1
    candidate = copy.deepcopy(finding)
    candidate["chart"] = spec
    errors = [f"schema: {'.'.join(map(str, e.absolute_path)) or 'finding'}: {e.message}" for e in VALIDATOR.iter_errors(candidate)]
    if errors:
        print("problems:\n" + "\n".join(f"- {e}" for e in errors))
        return 1
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    updated = findings.bump_version(finding, now, findings_dir)
    updated["chart"] = spec
    path = findings.save(updated, findings_dir)
    print(f"saved {updated['id']} version {updated['version']}: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
