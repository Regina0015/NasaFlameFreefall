"""Print a finding for the person who asked, with its audit grade.

Usage (from the repository root): uv run python -m scripts.answer F-001
Reads the current version of the finding and the Auditor's verdict in
stages/05_auditar/output/audits/F-001.json; a verdict for other content means "pending audit".
"""
import argparse
import re
import sys
from pathlib import Path

from scripts import findings
from scripts.audit_step import AUDITS_DIR, FAILED, PENDING, read_verdict
from scripts.cli import utf8_output
from scripts.paths import FINDINGS_DIR

CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def _clean(text) -> str:
    """Text for the terminal: control characters (such as escape sequences) are removed."""
    return CONTROL.sub("", str(text))


def format_answer(finding: dict, audit: dict) -> str:
    audit = audit if isinstance(audit, dict) else {}
    grade = audit.get("grade")
    status = audit.get("status")
    if grade not in (None, ""):
        failed = [c.get("id") for c in audit.get("checks") or [] if isinstance(c, dict) and c.get("result") == "fail"]
        shown = f"{grade} (failed: {', '.join(map(str, failed))})" if failed else grade
    elif status == FAILED:
        shown = FAILED
    else:
        shown = status or PENDING
    lines = [f"{finding['id']} v{finding['version']}", finding["claim"],
             f"Student: {finding['summary_student']}", f"Professional: {finding['summary_professional']}",
             f"Grade: {shown}"]
    lines += [f"Warning: {w}" for w in finding.get("warnings") or []]
    dois = list(dict.fromkeys(e["doi"] for e in finding.get("evidence") or [] if isinstance(e, dict) and e.get("doi")))
    lines.append("Sources: " + (", ".join(dois) if dois else "none"))
    footnote = (finding.get("visual_offer") or {}).get("footnote")
    if footnote:
        lines.append(footnote)
    return "\n".join(_clean(line) for line in lines)


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, audits_dir: Path = AUDITS_DIR) -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description="Print a finding and its audit grade.")
    parser.add_argument("finding_id")
    args = parser.parse_args(argv)
    try:
        finding = findings.load(args.finding_id, findings_dir)
        audit = read_verdict(Path(findings_dir) / f"{finding['id']}.json", audits_dir) or {"status": PENDING}
    except (ValueError, OSError) as error:
        print(f"problems:\n- {error}")
        return 1
    print(format_answer(finding, audit))
    return 0


if __name__ == "__main__":
    sys.exit(main())
