"""Send the Investigator's reviewed fields to the database, then copy the database back into data/snapshot/.

Usage:
  uv run python -m scripts.push_investigations           # show what would change; sends nothing
  uv run python -m scripts.push_investigations --apply   # update the database, then run pull_db

Only four columns of existing rows of `investigations` are updated: pillar, environments,
summary_student and summary_professional, from stages/03_investigar/output/investigations/.
Rows are never inserted or deleted, and no other table is touched. A person runs --apply
after reviewing the records (see /investigate).
"""
import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable

from scripts import pull_db
from scripts.cli import utf8_output
from scripts.investigations import load_investigator_records, reviewed_fields
from scripts.paths import INVESTIGATOR_OUT, ROOT, SNAPSHOT_DIR

__all__ = ["apply", "changes", "reviewed_fields"]


def changes(db_rows: list[dict], records: dict[str, dict]) -> tuple[dict[str, dict], list[str]]:
    """Per investigation id, the reviewed fields whose value differs from the database; and problems."""
    current = {row["id"]: row for row in db_rows}
    out, problems = {}, []
    for id_, record in sorted(records.items()):
        if id_ not in current:
            problems.append(f"{id_}: not in the database's investigations table; nothing sent")
            continue
        diff = {k: v for k, v in reviewed_fields(record).items() if current[id_].get(k) != v}
        if diff:
            out[id_] = diff
    return out, problems


def apply(pending: dict[str, dict], patch: Callable[[str, dict], None]) -> None:
    for id_, fields in pending.items():
        patch(id_, fields)


def supabase_patch(url: str, key: str) -> Callable[[str, dict], None]:
    headers = {"apikey": key, "Content-Type": "application/json", "Prefer": "return=minimal"}
    if not key.startswith("sb_"):
        headers["Authorization"] = f"Bearer {key}"

    def patch(id_: str, fields: dict) -> None:
        target = f"{url.rstrip('/')}/rest/v1/investigations?id=eq.{urllib.parse.quote(id_)}"
        request = urllib.request.Request(target, data=json.dumps(fields).encode(), headers=headers, method="PATCH")
        try:
            urllib.request.urlopen(request, timeout=pull_db.TIMEOUT_S).close()
        except urllib.error.HTTPError as error:
            raise ValueError(f"{id_}: the database answered {error.code}") from None

    return patch


def main(argv: list[str] | None = None) -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--apply", action="store_true", help="update the database (otherwise only show)")
    args = parser.parse_args(argv)
    env = pull_db.read_env(ROOT / ".env")
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (in .env)", file=sys.stderr)
        return 1
    try:
        fetch = pull_db.supabase_fetch(url, key)
        pending, problems = changes(fetch("investigations"), load_investigator_records(INVESTIGATOR_OUT))
        for problem in problems:
            print(problem, file=sys.stderr)
        for id_, fields in pending.items():
            print(f"{id_}: {', '.join(fields)}")
        if not pending:
            print("the database already has every reviewed field")
        if not args.apply:
            if pending:
                print("nothing sent; review the records, then run again with --apply")
            return 1 if problems else 0
        apply(pending, supabase_patch(url, key))
        counts = pull_db.pull(SNAPSHOT_DIR, fetch)
    except (ValueError, OSError) as error:
        print(f"stopped: {error}", file=sys.stderr)
        return 1
    print(f"updated {len(pending)} investigation(s); snapshot copied from the database "
          f"({counts['investigations']} investigations)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
