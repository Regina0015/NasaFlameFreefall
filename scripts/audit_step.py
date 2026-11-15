"""Hand a finding to the Auditor (scripts/auditar.py, owned by a teammate) and read its verdict.

Usage (from the repository root): uv run python -m scripts.audit_step F-001
Runs auditar.py on that one finding, with the PSI tables and records of stage 01, and
reads its verdict from stages/05_auditar/output/audits/F-001.json. A verdict counts only
if its finding id, version and SHA-256 match the finding file and it was written by this
run; otherwise the result is "audit failed to run". This step never invents a grade.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

from scripts import findings
from scripts.cli import utf8_output
from scripts.paths import FINDINGS_DIR, ROOT

AUDITOR = ROOT / "scripts" / "auditar.py"
PSI_DIR = ROOT / "stages" / "01_ingesta" / "output" / "psi"
AUDIT_OUT = ROOT / "stages" / "05_auditar" / "output"
AUDITS_DIR = AUDIT_OUT / "audits"
GRADES = ("A", "B", "C", "no_data", "rejected")
TIMEOUT_S = 300
DETAIL_LENGTH = 500
PENDING = "pending audit"
FAILED = "audit failed to run"


def auditor_command(fid: str, findings_dir: Path, out_dir: Path) -> list[str]:
    """auditar.py on one finding; no shell, the same Python as this step."""
    return [sys.executable, str(AUDITOR), "--only", fid, "--findings", str(findings_dir),
            "--tables", str(PSI_DIR), "--fiches", str(PSI_DIR), "--out", str(out_dir)]


def _finding(finding_path: Path) -> tuple[dict, bytes]:
    data = Path(finding_path).read_bytes()
    finding = json.loads(data)
    version = finding.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ValueError(f"{finding.get('id')} has no valid version")
    findings.check_id(finding.get("id"))
    return finding, data


def read_verdict(finding_path: Path, audits_dir: Path = AUDITS_DIR) -> dict | None:
    """The Auditor's verdict for exactly this finding file, or None."""
    finding, data = _finding(finding_path)
    try:
        verdict = json.loads((Path(audits_dir) / f"{finding['id']}.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(verdict, dict):
        return None
    if (verdict.get("finding_id") != finding["id"] or verdict.get("finding_version") != finding["version"]
            or verdict.get("finding_sha256") != hashlib.sha256(data).hexdigest() or verdict.get("grade") not in GRADES):
        return None
    return verdict


def run_audit(finding_path: Path, command: list[str], out_dir: Path = AUDIT_OUT, timeout: int = TIMEOUT_S) -> dict:
    finding, _ = _finding(finding_path)
    verdict_path = Path(out_dir) / "audits" / f"{finding['id']}.json"
    before = verdict_path.stat().st_mtime_ns if verdict_path.is_file() else None

    def failed(detail: str) -> dict:
        return {"finding": finding["id"], "version": finding["version"], "status": FAILED, "detail": detail[-DETAIL_LENGTH:]}

    try:
        proc = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return failed(f"timed out after {timeout} s")
    except (OSError, ValueError) as error:
        return failed(f"could not start the Auditor: {error}")
    if proc.returncode != 0:
        return failed((proc.stderr or "").strip() or f"exit code {proc.returncode}")
    fresh = verdict_path.is_file() and verdict_path.stat().st_mtime_ns != before
    verdict = read_verdict(finding_path, verdict_path.parent) if fresh else None
    return verdict or failed("the Auditor wrote no verdict for this version of the finding")


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, out_dir: Path = AUDIT_OUT) -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description="Run the Auditor on a finding.")
    parser.add_argument("finding_id")
    args = parser.parse_args(argv)
    try:
        fid = findings.check_id(args.finding_id)
        path = Path(findings_dir) / f"{fid}.json"
        if not path.is_file():
            raise ValueError(f"{fid} not found in {findings_dir}")
        verdict = run_audit(path, auditor_command(fid, findings_dir, out_dir), out_dir)
    except (ValueError, OSError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    failed = [c.get("id") for c in verdict.get("checks") or [] if isinstance(c, dict) and c.get("result") == "fail"]
    summary = {"finding": fid, "grade": verdict["grade"], "failed": failed} if "grade" in verdict else verdict
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
