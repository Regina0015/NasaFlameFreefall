"""Download the database tables into data/snapshot/, so every calculation follows the database.

Usage:
  uv run python -m scripts.pull_db            # write tests.csv, investigations.csv, relations.csv
  uv run python -m scripts.pull_db --check    # only say which tables differ; writes nothing

The database (Supabase) is the source of truth for the data. The Calculator and the Auditor
keep reading the CSV files, so results stay reproducible offline. SUPABASE_URL and
SUPABASE_SERVICE_ROLE_KEY are read from the environment or from .env; the key is never printed.
Nothing is written unless all three tables download completely with every contract column.
"""
import argparse
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

from scripts import contract
from scripts.paths import ROOT, SNAPSHOT_DIR

PAGE = 1000  # Supabase returns at most 1000 rows per request
TIMEOUT_S = 30


def read_env(path: Path) -> dict[str, str]:
    """KEY=value lines of a .env file (comments and blank lines skipped)."""
    values = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                name, value = line.split("=", 1)
                values[name.strip()] = value.strip()
    return values


def cell(value, sql_type: str = "VARCHAR") -> str:
    """One CSV cell in the format build_snapshot writes."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    if sql_type == "DOUBLE":
        return str(float(value))
    if sql_type == "INTEGER":
        return str(int(value))
    return str(value)


def read_all(get_page: Callable[[str, int], list[dict]], table: str) -> list[dict]:
    """Every row of a table, one page at a time."""
    rows, offset = [], 0
    while True:
        page = get_page(table, offset)
        rows += page
        if len(page) < PAGE:
            return rows
        offset += PAGE


def _sort_key(table: str, row: dict):
    if table == "tests":  # same order as build_snapshot: investigation, table, row
        table_index = int(row["test_id"].rsplit("-T", 1)[1].split("-R")[0])
        return int(row["investigation"].split("-")[1]), table_index, int(row["source_row"])
    if table == "investigations":
        return (int(row["id"].split("-")[1]),)
    return ()  # relations keep the database order


def render(table: str, rows: list[dict]) -> str:
    """The CSV text of one table, with the contract's columns and order."""
    columns = contract.TABLES[table]
    for row in rows:
        missing = [c.name for c in columns if c.name not in row]
        if missing:
            raise ValueError(f"{table}: the database has no column {', '.join(missing)}")
    if table != "relations":
        rows = sorted(rows, key=lambda r: _sort_key(table, r))
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow([c.name for c in columns])
    for row in rows:
        writer.writerow([cell(row[c.name], c.sql_type) for c in columns])
    return out.getvalue()


def _download(fetch: Callable[[str], list[dict]]) -> dict[str, str]:
    return {table: render(table, fetch(table)) for table in contract.TABLES}


def pull(out_dir: Path, fetch: Callable[[str], list[dict]]) -> dict[str, int]:
    """Write the three CSVs; returns the row count of each. Writes nothing if any table fails."""
    texts = _download(fetch)
    out_dir.mkdir(parents=True, exist_ok=True)
    for table, text in texts.items():
        tmp = out_dir / f".{table}.csv.tmp"
        tmp.write_text(text, encoding="utf-8", newline="")
        tmp.replace(out_dir / f"{table}.csv")
    return {table: text.count("\n") - 1 for table, text in texts.items()}


def differences(out_dir: Path, fetch: Callable[[str], list[dict]]) -> list[str]:
    """Tables whose CSV in out_dir is not what the database holds."""
    texts = _download(fetch)
    changed = []
    for table, text in texts.items():
        path = out_dir / f"{table}.csv"
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            changed.append(table)
    return changed


def supabase_fetch(url: str, key: str) -> Callable[[str], list[dict]]:
    """A fetch(table) over the Supabase REST API (read only: GET requests)."""
    base = url.rstrip("/") + "/rest/v1/"
    headers = {"apikey": key, "Accept": "application/json"}
    if not key.startswith("sb_"):  # legacy JWT keys also go in Authorization
        headers["Authorization"] = f"Bearer {key}"

    def get_page(table: str, offset: int) -> list[dict]:
        request = urllib.request.Request(f"{base}{table}?select=*&offset={offset}&limit={PAGE}", headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            raise ValueError(f"{table}: the database answered {error.code}") from None

    return lambda table: read_all(get_page, table)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="only report which tables differ")
    args = parser.parse_args(argv)
    env = {**read_env(ROOT / ".env"), **{k: v for k, v in os.environ.items() if k.startswith("SUPABASE_")}}
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (in .env)", file=sys.stderr)
        return 1
    fetch = supabase_fetch(url, key)
    try:
        if args.check:
            changed = differences(SNAPSHOT_DIR, fetch)
            print("snapshot matches the database" if not changed else "differs from the database: " + ", ".join(changed))
            return 1 if changed else 0
        counts = pull(SNAPSHOT_DIR, fetch)
    except (ValueError, OSError) as error:
        print(f"nothing written: {error}", file=sys.stderr)
        return 1
    print("wrote " + ", ".join(f"{t}.csv ({n} rows)" for t, n in counts.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
