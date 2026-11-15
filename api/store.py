"""Where the gateway keeps the findings it receives and the audits of them.

Layout (kept apart from the local stage 04 / 05 folders, so a remote F-001 never mixes with a local one):
  <gateway>/findings/F-XXX.json            latest version received
  <gateway>/findings/history/F-XXX.vN.json earlier versions
  <gateway>/audits/F-XXX.json              the Auditor's verdict (written by scripts/auditar.py)
  <gateway>/reviews/                       model alerts for a person to review (written by scripts/auditar.py)
"""
import json
import shutil
import threading
from pathlib import Path

from scripts import findings
from scripts.audit_step import GRADES, PENDING, read_verdict

_write_lock = threading.Lock()


def _dump(finding: dict) -> str:
    """The text findings.save writes, so a resent identical finding is recognized (and its SHA-256 is stable)."""
    return json.dumps(finding, indent=2, ensure_ascii=False, allow_nan=False) + "\n"


class Conflict(ValueError):
    """The finding clashes with the one already stored (same version, other content; or an older version)."""


class Store:
    def __init__(self, base: Path):
        self.base = Path(base)
        self.findings_dir = self.base / "findings"
        self.audits_dir = self.base / "audits"

    def finding_path(self, fid: str) -> Path:
        return self.findings_dir / f"{findings.check_id(fid)}.json"

    def save_finding(self, finding: dict) -> tuple[Path, str]:
        """Store a received finding. Returns (path, 'new' | 'same' | 'new_version')."""
        fid = findings.check_id(finding.get("id"))
        version = finding.get("version")
        if isinstance(version, bool) or not isinstance(version, int) or version < 1:
            raise ValueError("the finding needs an integer 'version' of 1 or more")
        with _write_lock:
            path = self.finding_path(fid)
            if not path.exists():
                return findings.save(finding, self.findings_dir), "new"
            current = json.loads(path.read_text(encoding="utf-8"))
            old_version = current.get("version")
            if version < old_version:
                raise Conflict(f"{fid} version {version} is older than the stored version {old_version}")
            if version == old_version:
                if path.read_text(encoding="utf-8") == _dump(finding):
                    return path, "same"
                raise Conflict(f"{fid} version {version} already exists with different content: bump the version")
            history = self.findings_dir / "history"
            history.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, history / f"{fid}.v{old_version}.json")
            return findings.save(finding, self.findings_dir), "new_version"

    def load_finding(self, fid: str) -> dict:
        """Errors name the finding, never a folder on this PC (they are sent to clients)."""
        try:
            return findings.load(fid, self.findings_dir)
        except ValueError as error:
            raise ValueError(str(error).replace(f" in {self.findings_dir}", " on the gateway")) from None

    def finding_ids(self) -> list[str]:
        return sorted(p.stem for p in self.findings_dir.glob("F-*.json") if findings.FINDING_ID.match(p.stem))

    def verdict(self, fid: str) -> dict | None:
        """The Auditor's verdict for exactly the stored file (same id, version and SHA-256), else None."""
        path = self.finding_path(fid)
        return read_verdict(path, self.audits_dir) if path.is_file() else None

    def raw_audit(self, fid: str) -> dict | None:
        """The audit file as written, even if it no longer matches the stored finding (stale)."""
        try:
            data = json.loads((self.audits_dir / f"{findings.check_id(fid)}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        return data if isinstance(data, dict) else None


def failed_checks(verdict: dict | None) -> list[str]:
    return [c.get("id") for c in (verdict or {}).get("checks") or [] if isinstance(c, dict) and c.get("result") == "fail"]


def model_used(verdict: dict | None) -> bool:
    return bool(((verdict or {}).get("audited_by") or {}).get("model"))


def summary(store: Store, fid: str) -> dict:
    """One row about a finding's audit: grade, failed checks, and whether the audit is stale."""
    verdict = store.verdict(fid)
    raw = store.raw_audit(fid)
    if verdict is not None:
        grade, stale = verdict["grade"], False
    else:
        grade, stale = PENDING, raw is not None  # an audit exists, but for another version of the finding
    source = verdict or raw or {}
    return {
        "finding_id": fid,
        "finding_version": store.load_finding(fid).get("version"),
        "grade": grade,
        "failed_checks": failed_checks(verdict),
        "stale_audit": stale,
        "finding_sha256": (verdict or {}).get("finding_sha256"),
        "model_used": model_used(verdict),
        "audited_at": (source.get("audited_by") or {}).get("date") if verdict else None,
    }


__all__ = ["Store", "Conflict", "GRADES", "PENDING", "summary", "failed_checks", "model_used"]
