"""Send a finding to the Auditor gateway (api/) and print its grade. For the Calculator's machine.

Usage (from the repository root):
  uv run python -m scripts.audit_client F-001            # audit with the model (Gemma) on the Auditor's PC
  uv run python -m scripts.audit_client F-001 --no-model # code checks only; C8 stays "fail"
  uv run python -m scripts.audit_client F-001 --reaudit  # even if this exact finding was already audited

Needs in .env: AUDITOR_URL (for example http://100.64.0.1:8000) and AUDITOR_API_KEY (the gateway's API_KEY).
Saves the verdict in stages/05_auditar/output/audits/ (as scripts.audit_step does), so scripts.answer shows it.
Prints one JSON line {finding, version, grade, failed, send_back_to}. Exit code: 0 audited (any grade except
rejected), 1 rejected (fix it in stage 04), 2 the audit did not run (a grade is never invented).
Only the standard library is used.
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from api.config import load_dotenv
from scripts import findings
from scripts.audit_step import AUDITS_DIR, read_verdict
from scripts.paths import FINDINGS_DIR

POLL_S = 3
WAIT_S = 900


def request(method: str, url: str, key: str, body: dict | None = None, timeout: int = 120) -> tuple[int, dict]:
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"X-API-Key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.load(error)
        except ValueError:
            return error.code, {"detail": error.reason}


def audit(finding: dict, base_url: str, key: str, use_model: bool = True, reaudit: bool = False) -> dict:
    base = base_url.rstrip("/")
    status, body = request("POST", f"{base}/audit", key,
                           {"finding": finding, "use_model": use_model, "reaudit": reaudit})
    deadline = time.monotonic() + WAIT_S
    while status == 202 and time.monotonic() < deadline:
        time.sleep(POLL_S)
        status, body = request("GET", f"{base}/audits/jobs/{body['job_id']}", key)
    if status not in (200, 202) or body.get("status") != "done":
        raise RuntimeError(f"HTTP {status}: {body.get('detail') or body}")
    return body


def save_verdict(verdict: dict, finding_path: Path, audits_dir: Path = AUDITS_DIR) -> Path:
    """Keep the gateway's verdict next to the local finding, only if it was made for exactly these bytes."""
    data = Path(finding_path).read_bytes()
    if verdict.get("finding_sha256") != hashlib.sha256(data).hexdigest():
        raise ValueError("the Auditor graded other bytes than the local finding file; audit again")
    local = json.loads(data.decode("utf-8"))
    # Checked before writing: a wrong id must never overwrite another finding's audit or leave the folder.
    if verdict.get("finding_id") != local.get("id") or verdict.get("finding_version") != local.get("version"):
        raise ValueError("the verdict does not match the local finding (id or version)")
    audits_dir = Path(audits_dir)
    audits_dir.mkdir(parents=True, exist_ok=True)
    path = audits_dir / f"{findings.check_id(local['id'])}.json"
    path.write_text(json.dumps(verdict, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    if read_verdict(Path(finding_path), audits_dir) is None:
        path.unlink()
        raise ValueError("the verdict does not match the local finding (id, version or grade)")
    return path


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, audits_dir: Path = AUDITS_DIR) -> int:
    parser = argparse.ArgumentParser(description="Send a finding to the Auditor gateway.")
    parser.add_argument("finding_id")
    parser.add_argument("--no-model", action="store_true")
    parser.add_argument("--reaudit", action="store_true")
    args = parser.parse_args(argv)
    load_dotenv()
    try:
        url, key = os.environ.get("AUDITOR_URL"), os.environ.get("AUDITOR_API_KEY")
        if not url or not key:
            raise RuntimeError("set AUDITOR_URL and AUDITOR_API_KEY in .env")
        finding = findings.load(args.finding_id, findings_dir)
        result = audit(finding, url, key, not args.no_model, args.reaudit)
        save_verdict(result["audit"], Path(findings_dir) / f"{finding['id']}.json", audits_dir)
    except (ValueError, OSError, RuntimeError) as error:
        print(json.dumps({"finding": args.finding_id, "status": "audit failed to run", "detail": str(error)}))
        return 2
    print(json.dumps({"finding": result["finding_id"], "version": result["finding_version"], "grade": result["grade"],
                      "failed": result["failed_checks"], "send_back_to": result["send_back_to"]}))
    return 1 if result["grade"] == "rejected" else 0


if __name__ == "__main__":
    sys.exit(main())
