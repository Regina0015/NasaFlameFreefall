"""Finding files: ids (F-001, F-002, ...), load, save, and version history."""
import copy
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from scripts.paths import FINDINGS_DIR

FINDING_ID = re.compile(r"^F-(\d{3})$")


def check_id(fid) -> str:
    if not isinstance(fid, str) or not FINDING_ID.match(fid):
        raise ValueError(f"invalid finding id {fid!r}: use the F-001 form")
    return fid


def next_id(dir: Path = FINDINGS_DIR) -> str:
    numbers = [int(m.group(1)) for p in Path(dir).glob("F-*.json") if (m := FINDING_ID.match(p.stem))]
    n = max(numbers, default=0) + 1
    if n > 999:
        raise ValueError("no finding ids left (F-999 is the last)")
    return f"F-{n:03d}"


def load(fid: str, dir: Path = FINDINGS_DIR) -> dict:
    path = Path(dir) / f"{check_id(fid)}.json"
    if not path.exists():
        raise ValueError(f"{fid} not found in {dir}")
    return json.loads(path.read_text(encoding="utf-8"))


def save(finding: dict, dir: Path = FINDINGS_DIR) -> Path:
    dir = Path(dir)
    dir.mkdir(parents=True, exist_ok=True)
    path = dir / f"{check_id(finding.get('id'))}.json"
    path.write_text(json.dumps(finding, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    return path


def save_new(finding: dict, dir: Path = FINDINGS_DIR) -> Path:
    """Save a new finding under the first free id, never over a file saved meanwhile (two /ask runs at once)."""
    dir = Path(dir)
    dir.mkdir(parents=True, exist_ok=True)
    while True:
        path = dir / f"{check_id(finding.get('id'))}.json"
        try:
            with open(path, "x", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(finding, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
            return path
        except FileExistsError:
            finding["id"] = next_id(dir)


def bump_version(finding: dict, now: str, dir: Path = FINDINGS_DIR) -> dict:
    """Copy the saved file to history/F-001.v<N>.json and return a copy with version N + 1 dated `now`."""
    fid = check_id(finding.get("id"))
    current = Path(dir) / f"{fid}.json"
    if not current.exists():
        raise ValueError(f"{fid} is not saved in {dir}")
    version = json.loads(current.read_text(encoding="utf-8"))["version"]
    history = Path(dir) / "history"
    history.mkdir(parents=True, exist_ok=True)
    target = history / f"{fid}.v{version}.json"
    if target.exists():
        raise ValueError(f"history/{target.name} already exists")
    shutil.copyfile(current, target)
    bumped = copy.deepcopy(finding)
    bumped["version"] = version + 1
    bumped.setdefault("generated_by", {})["date"] = now
    return bumped


def save_new_version(finding: dict, field: str, value, validator, dir: Path = FINDINGS_DIR,
                     now: str | None = None) -> tuple[Path | None, list[str]]:
    """Set one field, check the schema, then save it as the next version (the old file goes to history/).

    Nothing is written when the schema check fails."""
    candidate = copy.deepcopy(finding)
    candidate[field] = value
    problems = [f"schema: {'.'.join(map(str, e.absolute_path)) or 'finding'}: {e.message}" for e in validator.iter_errors(candidate)]
    if problems:
        return None, problems
    updated = bump_version(finding, now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), dir)
    updated[field] = value
    return save(updated, dir), []
