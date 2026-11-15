"""Hand a finding to the Auditor (owned by a teammate) and collect its verdict.

Usage (from the repository root): uv run python -m scripts.audit_step F-001
The Auditor command comes from AUDITOR_CMD (environment first, then .env). It is run
with the finding path as its last argument, as a list of arguments (no shell), and
must write its verdict to <finding dir>/F-001.v<N>.audit.json. With no command the
verdict is "pending audit"; if the command fails or writes nothing it is
"audit failed to run". This step never invents a grade.
"""
import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

from scripts import findings
from scripts.cli import utf8_output
from scripts.paths import FINDINGS_DIR, ROOT

TIMEOUT_S = 300
DETAIL_LENGTH = 500
PENDING = "pending audit"
FAILED = "audit failed to run"
ENV_FILE = ROOT / ".env"


def auditor_command(environ=None, env_path: Path = ENV_FILE) -> str | None:
    """AUDITOR_CMD from the environment, else from simple KEY=VALUE lines in .env; None when empty."""
    environ = os.environ if environ is None else environ
    value = environ.get("AUDITOR_CMD") or None
    if value is None and Path(env_path).is_file():
        for line in Path(env_path).read_text(encoding="utf-8-sig").splitlines():
            key, sep, rest = line.partition("=")
            if sep and not line.lstrip().startswith("#") and key.strip() == "AUDITOR_CMD":
                value = rest
    value = (value or "").strip()
    return value or None


def split_command(command: str) -> list[str]:
    """Split a command line into arguments; on Windows backslashes in paths are kept."""
    if os.name != "nt":
        return shlex.split(command)
    parts = shlex.split(command, posix=False)
    return [p[1:-1] if len(p) >= 2 and p[0] == p[-1] == '"' else p for p in parts]


def _write(path: Path, verdict: dict) -> dict:
    path.write_text(json.dumps(verdict, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return verdict


def run_audit(finding_path: Path, auditor_cmd: str | None, timeout: int = TIMEOUT_S) -> dict:
    finding_path = Path(finding_path).resolve()
    finding = json.loads(finding_path.read_text(encoding="utf-8"))
    fid = findings.check_id(finding.get("id"))
    version = finding.get("version")
    if isinstance(version, bool) or not isinstance(version, int) or version < 1:
        raise ValueError(f"{fid} has no valid version")
    out = finding_path.parent / f"{fid}.v{version}.audit.json"
    base = {"finding": fid, "version": version}
    if not auditor_cmd:
        return _write(out, {**base, "status": PENDING})

    def failed(detail: str) -> dict:
        return _write(out, {**base, "status": FAILED, "detail": detail[-DETAIL_LENGTH:]})

    out.unlink(missing_ok=True)  # an old verdict must never stand in for this run
    try:
        proc = subprocess.run(split_command(auditor_cmd) + [str(finding_path)], capture_output=True, text=True,
                              encoding="utf-8", errors="replace", timeout=timeout, stdin=subprocess.DEVNULL)
    except subprocess.TimeoutExpired:
        return failed(f"timed out after {timeout} s")
    except (OSError, ValueError) as error:
        return failed(f"could not start the Auditor: {error}")
    if proc.returncode != 0 or not out.is_file():
        reason = f"exit code {proc.returncode}" if proc.returncode else "the Auditor wrote no verdict file"
        return failed((proc.stderr or "").strip() or reason)
    try:
        verdict = json.loads(out.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return failed("the verdict file is not valid JSON")
    if not isinstance(verdict, dict):
        return failed("the verdict file is not a JSON object")
    return verdict


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, environ=None, env_path: Path = ENV_FILE) -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description="Run the Auditor on a finding.")
    parser.add_argument("finding_id")
    args = parser.parse_args(argv)
    try:
        path = Path(findings_dir) / f"{findings.check_id(args.finding_id)}.json"
        if not path.is_file():
            raise ValueError(f"{args.finding_id} not found in {findings_dir}")
        verdict = run_audit(path, auditor_command(environ, env_path))
    except (ValueError, OSError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(verdict, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
