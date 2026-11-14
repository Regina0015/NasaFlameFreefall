"""Build a finding from a calc file and the Calculator's text, check it, and save it.

Usage (from the repository root):
  uv run python -m scripts.write_finding --calc stages/04_calcular/output/calcs/C-<hash>.json --text <text.json> --model <model id>
Prints "saved F-00N: <path>", or the problems (one per line) and exits 1.

The values, method, evidence and n_tests are copied from the calc file, never from
the text. Every number in the text must be one of the computed values, n_tests, a
method parameter or a number in the question.
"""
import argparse
import copy
import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator

from scripts import findings
from scripts.numbers import canonical, collect, numbers_in
from scripts.paths import CALCS_DIR, FINDINGS_DIR, SCHEMAS_DIR, SNAPSHOT_DIR
from scripts.run_calc import calc_digest

TEXT_FIELDS = ("question", "status", "claim", "summary_student", "summary_professional", "assumptions",
               "limitations", "warnings", "environments", "pillar", "visual_offer")
LUNAR_WARNING = ("PSI has no partial-gravity combustion data. Lunar and Mars conclusions are bounded by "
                 "microgravity and Earth-gravity results only.")
LUNAR_WARNING_START = "PSI has no partial-gravity combustion data."
PARTIAL_GRAVITY = {"lunar_base", "mars_base"}
CALC_NAME = re.compile(r"^C-([0-9a-f]{12})\.json$")
VALIDATOR = Draft202012Validator(json.loads((SCHEMAS_DIR / "finding.schema.json").read_text(encoding="utf-8")))


def load_calc(path: Path, calcs_dir: Path = CALCS_DIR) -> dict:
    """Read a calc file written by run_calc: it must sit in calcs_dir and match the hash in its name."""
    path = Path(path).resolve()
    match = CALC_NAME.match(path.name)
    if not match or os.path.normcase(str(path.parent)) != os.path.normcase(str(Path(calcs_dir).resolve())):
        raise ValueError(f"--calc must be a calc file in {calcs_dir} written by scripts.run_calc (C-<hash>.json)")
    calc = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(calc, dict) or calc_digest(calc)[:12] != match.group(1):
        raise ValueError(f"calc file {path.name} does not match its content (was it edited by hand?); run scripts.run_calc again")
    return calc


def tiers_from_snapshot(snapshot_dir: Path = SNAPSHOT_DIR) -> dict[str, int | None]:
    with open(Path(snapshot_dir) / "investigations.csv", encoding="utf-8", newline="") as f:
        return {row["id"]: int(row["tier"]) if (row.get("tier") or "").strip() else None for row in csv.DictReader(f)}


def _text_items(text: dict) -> list[tuple[str, str]]:
    """(field label, text) for every text field whose numbers are checked."""
    items = [(f, text.get(f)) for f in ("claim", "summary_student", "summary_professional")]
    for field in ("assumptions", "limitations", "warnings"):
        if isinstance(text.get(field), list):
            items += [(f"{field}[{i}]", s) for i, s in enumerate(text[field])]
    offer = text.get("visual_offer")
    if isinstance(offer, dict):
        items.append(("visual_offer.footnote", offer.get("footnote")))
        items += [(f"visual_offer.{k}.idea", offer[k].get("idea")) for k in ("chart", "graph") if isinstance(offer.get(k), dict)]
    return [(label, s) for label, s in items if isinstance(s, str)]


def allowed_numbers(calc: dict, question) -> set[str]:
    allowed = {canonical(v["value"]) for v in (calc.get("values") or {}).values()
               if isinstance(v, dict) and isinstance(v.get("value"), (int, float)) and not isinstance(v.get("value"), bool)}
    if isinstance(calc.get("n_tests"), int):
        allowed.add(canonical(calc["n_tests"]))
    allowed |= collect((calc.get("method") or {}).get("params") or {})
    if isinstance(question, str):
        allowed.update(numbers_in(question))
    return allowed


def build_finding(calc: dict, text: dict, tiers_by_investigation: dict[str, int | None], model: str, now: str,
                  fid: str) -> tuple[dict | None, list[str]]:
    if not isinstance(text, dict):
        return None, ["text must be a JSON object"]
    problems = []
    extra = sorted(set(text) - set(TEXT_FIELDS))
    missing = [f for f in TEXT_FIELDS if f not in text]
    if extra:
        problems.append(f"unexpected field(s) in text: {', '.join(extra)}")
    if missing:
        problems.append(f"missing field(s) in text: {', '.join(missing)}")
    allowed = allowed_numbers(calc, text.get("question"))
    for label, sentence in _text_items(text):
        problems += [f'number "{n}" in {label} is not in the computed values' for n in numbers_in(sentence) if n not in allowed]
    evidence = copy.deepcopy(calc.get("evidence") or [])
    n_tests = calc.get("n_tests")
    if text.get("status") == "no_data" and n_tests != 0:
        problems.append(f'status "no_data" needs a calc with no tests (this calc used {n_tests})')
    if text.get("status") == "has_data" and not (isinstance(n_tests, int) and n_tests > 0 and evidence):
        problems.append('status "has_data" needs a calc with tests and at least one evidence item')
    warnings = list(text["warnings"]) if isinstance(text.get("warnings"), list) else text.get("warnings")
    environments = text.get("environments")
    if isinstance(warnings, list) and isinstance(environments, list) and PARTIAL_GRAVITY & set(map(str, environments)):
        reworded = [w for w in warnings if isinstance(w, str) and w.startswith(LUNAR_WARNING_START) and w != LUNAR_WARNING]
        warnings = [w for w in warnings if w not in reworded]
        if LUNAR_WARNING not in warnings:
            warnings.append(LUNAR_WARNING)
    first = evidence[0] if evidence and isinstance(evidence[0], dict) else {}
    finding = {
        "id": fid, "version": 1, "question": text.get("question"), "status": text.get("status"),
        "claim": text.get("claim"), "summary_student": text.get("summary_student"),
        "summary_professional": text.get("summary_professional"),
        "values": copy.deepcopy(calc.get("values")), "method": copy.deepcopy(calc.get("method")),
        "evidence": evidence, "n_tests": n_tests,
        "assumptions": text.get("assumptions"), "limitations": text.get("limitations"), "warnings": warnings,
        "environments": environments, "tier": tiers_by_investigation.get(first.get("investigation")),
        "pillar": text.get("pillar"), "visual_offer": copy.deepcopy(text.get("visual_offer")),
        "chart": None, "graph": None,
        "generated_by": {"agent": "calculator", "model": model, "date": now},
    }
    for error in sorted(VALIDATOR.iter_errors(finding), key=lambda e: [str(p) for p in e.absolute_path]):
        where = ".".join(str(p) for p in error.absolute_path) or "finding"
        problems.append(f"schema: {where}: {error.message}")
    if problems:
        return None, list(dict.fromkeys(problems))
    return finding, []


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, calcs_dir: Path = CALCS_DIR,
         snapshot_dir: Path = SNAPSHOT_DIR) -> int:
    parser = argparse.ArgumentParser(description="Build, check and save a finding.")
    parser.add_argument("--calc", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args(argv)
    try:
        calc = load_calc(Path(args.calc), calcs_dir)
        text = json.loads(Path(args.text).read_text(encoding="utf-8"))
        tiers = tiers_from_snapshot(snapshot_dir)
        fid = findings.next_id(findings_dir)
    except (ValueError, OSError) as error:
        print(f"problems:\n- {error}")
        return 1
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    finding, problems = build_finding(calc, text, tiers, args.model, now, fid)
    if problems:
        print("problems:")
        for problem in problems:
            print(f"- {problem}")
        return 1
    path = findings.save(finding, findings_dir)
    print(f"saved {fid}: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
