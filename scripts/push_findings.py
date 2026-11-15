"""Send the audited findings to the database's findings table, so the dashboard can read them.

Usage:
  uv run python -m scripts.push_findings           # show what would change; sends nothing
  uv run python -m scripts.push_findings --apply   # update the database

The table ends up holding exactly the publishable findings: the current version of each finding in
stages/04_calcular/output/findings/ that has an Auditor verdict for exactly its file (same id, version and
SHA-256, in stages/05_auditar/output/audits/) and is not rejected. Rejected or unaudited findings are never
sent, because anyone can read the table. A row that is no longer publishable (an older version, a finding
now rejected or deleted) is removed. No other table is touched. A person runs --apply after looking at the
preview.
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from pathlib import Path

from scripts import findings, pull_db
from scripts.audit_step import AUDITS_DIR, read_verdict
from scripts.cli import utf8_output
from scripts.paths import FINDINGS_DIR, ROOT

# Same names and order as the findings table in supabase/schema.sql.
FINDING_COLUMNS = ("id", "version", "question", "status", "claim", "summary_student", "summary_professional",
                   "values", "method", "evidence", "n_tests", "assumptions", "limitations", "warnings",
                   "environments", "tier", "pillar", "visual_offer", "chart", "graph", "generated_by")
AUDIT_COLUMNS = ("grade", "grade_reasons", "finding_sha256", "audit", "audited_at")
COMPARED = ("finding_sha256", "grade", "audit")  # a row is sent again only if one of these differs

Key = tuple[str, int]


def rows(findings_dir: Path = FINDINGS_DIR, audits_dir: Path = AUDITS_DIR) -> tuple[list[dict], list[str]]:
    """One row per publishable finding, and a note for each finding left out."""
    out, left_out = [], []
    for path in sorted(Path(findings_dir).glob("F-*.json")):
        if not findings.FINDING_ID.match(path.stem):
            continue
        try:
            finding = json.loads(path.read_text(encoding="utf-8"))
        except ValueError as error:
            raise ValueError(f"{path.name} is not valid JSON ({error}); fix it first") from None
        name = f"{finding.get('id')} v{finding.get('version')}"
        verdict = read_verdict(path, audits_dir)
        if verdict is None:
            left_out.append(f"{name}: no audit for exactly this file; audit it first")
            continue
        if verdict["grade"] == "rejected":
            left_out.append(f"{name}: rejected, so it is not published")
            continue
        row = {column: finding.get(column) for column in FINDING_COLUMNS}
        row.update(grade=verdict["grade"], grade_reasons=verdict.get("reasons") or [],
                   finding_sha256=verdict["finding_sha256"], audit=verdict,
                   audited_at=(verdict.get("audited_by") or {}).get("date"))
        out.append(row)
    return out, left_out


def changes(db_rows: list[dict], wanted: list[dict]) -> tuple[list[dict], list[Key]]:
    """Rows to insert or update, and (id, version) of rows to delete."""
    current = {(r["id"], r["version"]): r for r in db_rows}
    keys = {(r["id"], r["version"]) for r in wanted}
    upsert = [r for r in wanted
              if any(current.get((r["id"], r["version"]), {}).get(c) != r[c] for c in COMPARED)]
    return upsert, sorted(k for k in current if k not in keys)


def apply(upsert: list[dict], delete: list[Key], send: Callable[[list[dict]], None],
          remove: Callable[[str, int], None]) -> None:
    if upsert:
        send(upsert)
    for fid, version in delete:
        remove(fid, version)


def supabase_writers(url: str, key: str) -> tuple[Callable[[list[dict]], None], Callable[[str, int], None]]:
    base = url.rstrip("/") + "/rest/v1/findings"
    headers = {"apikey": key, "Content-Type": "application/json"}
    if not key.startswith("sb_"):  # legacy JWT keys also go in Authorization
        headers["Authorization"] = f"Bearer {key}"

    def call(target: str, method: str, body: bytes | None, prefer: str, what: str) -> None:
        request = urllib.request.Request(target, data=body, method=method, headers={**headers, "Prefer": prefer})
        try:
            urllib.request.urlopen(request, timeout=pull_db.TIMEOUT_S).close()
        except urllib.error.HTTPError as error:
            raise ValueError(f"{what}: the database answered {error.code}") from None

    def send(rows_: list[dict]) -> None:
        body = json.dumps(rows_, ensure_ascii=False, allow_nan=False).encode("utf-8")
        call(f"{base}?on_conflict=id,version", "POST", body, "resolution=merge-duplicates,return=minimal",
             f"{len(rows_)} finding row(s)")

    def remove(fid: str, version: int) -> None:
        query = urllib.parse.urlencode({"id": f"eq.{findings.check_id(fid)}", "version": f"eq.{int(version)}"})
        call(f"{base}?{query}", "DELETE", None, "return=minimal", f"{fid} v{version}")

    return send, remove


def main(argv: list[str] | None = None, findings_dir: Path = FINDINGS_DIR, audits_dir: Path = AUDITS_DIR) -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="update the database (otherwise only show)")
    args = parser.parse_args(argv)
    try:  # the local files first: a broken one stops everything before any request
        wanted, left_out = rows(findings_dir, audits_dir)
    except (ValueError, OSError) as error:
        print(f"stopped: {error}", file=sys.stderr)
        return 1
    for note in left_out:
        print(f"left out: {note}")
    env = pull_db.read_env(ROOT / ".env")
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (in .env)", file=sys.stderr)
        return 1
    try:
        current = pull_db.supabase_fetch(url, key)("findings")
        upsert, delete = changes(current, wanted)
        known = {(r["id"], r["version"]) for r in current}
        for r in upsert:
            action = "update" if (r["id"], r["version"]) in known else "insert"
            print(f"{action}: {r['id']} v{r['version']} (grade {r['grade']})")
        for fid, version in delete:
            print(f"delete: {fid} v{version} (no longer published)")
        if not upsert and not delete:
            print(f"the database already has the {len(wanted)} published finding(s)")
            return 0
        if not args.apply:
            print("nothing sent; check the list, then run again with --apply")
            return 0
        apply(upsert, delete, *supabase_writers(url, key))
    except (ValueError, OSError) as error:
        print(f"stopped: {error}", file=sys.stderr)
        return 1
    print(f"sent {len(upsert)} row(s), deleted {len(delete)}; {len(wanted)} finding(s) published")
    return 0


if __name__ == "__main__":
    sys.exit(main())
