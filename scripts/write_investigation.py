"""Check an Investigator draft and save the investigation record.

The record = PSI facts (code) + the team's tier (code) + the agent's draft
(summaries, pillar, environments). The draft is rejected when it cites a source
that is not in the PSI record, states a number the record does not contain, or
tries to set a field it does not own (such as the tier).

Usage: uv run python -m scripts.write_investigation PSI-25 [PSI-26 ...]
Reads stages/03_investigar/output/drafts/PSI-XX.json, writes
stages/03_investigar/output/investigations/PSI-XX.json. Exit 1 lists the problems.
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator

from scripts.cli import utf8_output
from scripts.investigations import facts, load_tiers
from scripts.number_check import collect, numbers_in
from scripts.paths import CONFIG_DIR, INVESTIGATOR_OUT, PSI_DIR, ROOT, SCHEMAS_DIR

DRAFT_FIELDS = {"id", "summary_student", "summary_professional", "pillar", "environments", "model"}
CITABLE_FIELDS = ["title", "objective", "approach", "hypothesis", "researchImpacts",
                  "subResearchArea", "experimentHardware", "flightProgram"]

_VALIDATOR = Draft202012Validator(json.loads((SCHEMAS_DIR / "investigation.schema.json").read_text(encoding="utf-8")))


def _allowed_sources(record: dict) -> set[str]:
    fields = {f for f in CITABLE_FIELDS if (record.get(f) or "").strip()}
    dois = {record.get("doi", "")} | {p.get("doi", "") for p in record.get("publications", [])}
    return fields | {d for d in dois if d}


def _allowed_numbers(record: dict) -> set[str]:
    texts = [record.get(f, "") for f in CITABLE_FIELDS] + [p.get("title", "") for p in record.get("publications", [])]
    return collect(texts)


def _texts(draft: dict) -> list[tuple[str, dict]]:
    """(field path, item with 'sources') for every sourced text in the draft."""
    items = [("summary_student", draft.get("summary_student")),
             ("summary_professional", draft.get("summary_professional")),
             ("pillar", draft.get("pillar"))]
    items += [(f"environments[{i}]", e) for i, e in enumerate(draft.get("environments") or [])]
    return [(name, item) for name, item in items if isinstance(item, dict)]


def build_record(record: dict, draft: dict, tiers: dict, now: str) -> tuple[dict | None, list[str]]:
    problems = [f"draft field not allowed: {k}" for k in sorted(set(draft) - DRAFT_FIELDS)]
    if draft.get("id") != record.get("accession"):
        problems.append(f"draft id {draft.get('id')!r} does not match record {record.get('accession')!r}")

    allowed_sources = _allowed_sources(record)
    allowed_numbers = _allowed_numbers(record)
    for name, item in _texts(draft):
        for source in item.get("sources") or []:
            if source not in allowed_sources:
                problems.append(f"source {source!r} in {name} is not a non-empty PSI field or a DOI of this record")
        text = item["text"] if "text" in item else item.get("reason", "")
        for number in numbers_in(text):
            if number not in allowed_numbers:
                problems.append(f'number "{number}" in {name} is not in the PSI record')

    tier = tiers.get(record.get("accession"), {})
    result = facts(record)
    result.update(
        tier=tier.get("tier"),
        tier_reason=tier.get("reason"),
        boost_environments=tier.get("boost", []),
        summary_student=draft.get("summary_student"),
        summary_professional=draft.get("summary_professional"),
        pillar=draft.get("pillar"),
        environments=draft.get("environments", []),
        generated_by={"agent": "investigator", "model": draft.get("model", ""), "date": now},
        reviewed_by=None,
    )
    problems += [f"schema: {'/'.join(map(str, e.path)) or '(root)'}: {e.message}"
                 for e in sorted(_VALIDATOR.iter_errors(result), key=lambda e: list(e.path))]
    return (None, problems) if problems else (result, [])


def main(argv: list[str] | None = None) -> int:
    utf8_output()
    ids = argv if argv is not None else sys.argv[1:]
    if not ids:
        print("usage: python -m scripts.write_investigation PSI-25 [PSI-26 ...]", file=sys.stderr)
        return 2
    tiers = load_tiers(CONFIG_DIR / "tiers.md")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out_dir = INVESTIGATOR_OUT / "investigations"
    out_dir.mkdir(parents=True, exist_ok=True)
    failed = 0
    for investigation in ids:
        record_path = PSI_DIR / f"{investigation}.json"
        draft_path = INVESTIGATOR_OUT / "drafts" / f"{investigation}.json"
        if not record_path.exists() or not draft_path.exists():
            print(f"{investigation}: missing {record_path if not record_path.exists() else draft_path}")
            failed += 1
            continue
        record = json.loads(record_path.read_text(encoding="utf-8"))
        try:
            draft = json.loads(draft_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            print(f"{investigation}: draft is not valid JSON: {error}")
            failed += 1
            continue
        result, problems = build_record(record, draft, tiers, now)
        if problems:
            print(f"{investigation}: {len(problems)} problem(s)")
            for problem in problems:
                print(f"  - {problem}")
            failed += 1
            continue
        path = out_dir / f"{investigation}.json"
        path.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print(f"{investigation}: saved {path.relative_to(ROOT)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
