"""Load data/snapshot/ into the Supabase tables of supabase/schema.sql.

Reads investigations.csv, tests.csv and relations.csv (columns from scripts/contract.py),
turns empty cells into NULL, numbers into numbers and the JSON columns into objects,
then replaces the PSI rows in Supabase: relations and tests with scope = 'psi' are
deleted and inserted again; investigations are upserted by id.

Needs .env at the repository root with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
(the secret key; never commit it). Standard library only.

Usage:
  uv run python -m scripts.load_snapshot --dry-run   # read and check, send nothing
  uv run python -m scripts.load_snapshot             # load into Supabase
"""
import argparse
import csv
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from scripts import contract
from scripts.cli import utf8_output
from scripts.paths import ROOT, SNAPSHOT_DIR

JSON_COLUMNS = {"other", "raw", "field_sources"}
BATCH = 500
ORDER = ["investigations", "tests", "relations"]  # parents before children


def read_env(path: Path) -> dict[str, str]:
    """Minimal .env reader: KEY=value lines, '#' comments, optional quotes."""
    values = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def convert(table: str, row: dict[str, str]) -> dict:
    """One CSV row -> one JSON object with the contract's types. Empty cell -> None."""
    out = {}
    for column in contract.TABLES[table]:
        text = row.get(column.name, "")
        if text == "":
            out[column.name] = None
        elif column.name in JSON_COLUMNS:
            out[column.name] = json.loads(text)
        elif column.sql_type == "INTEGER":
            out[column.name] = int(text)
        elif column.sql_type == "DOUBLE":
            out[column.name] = float(text)
        else:
            out[column.name] = text
    return out


def read_snapshot(snapshot_dir: Path) -> dict[str, list[dict]]:
    tables = {}
    for table in ORDER:
        path = snapshot_dir / f"{table}.csv"
        with open(path, encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            missing = [c for c in contract.names(contract.TABLES[table]) if c not in (reader.fieldnames or [])]
            if missing:
                raise SystemExit(f"{path.name} is missing columns {missing}. Rebuild with scripts.build_snapshot.")
            tables[table] = [convert(table, row) for row in reader]
    return tables


class Supabase:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.headers = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):  # legacy JWT keys also go in Authorization
            self.headers["Authorization"] = f"Bearer {key}"

    def request(self, method: str, path: str, body=None, prefer: str | None = None) -> None:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Supabase answered {error.code} to {method} {path.split('?')[0]}: {detail}")

    def delete_psi(self, table: str) -> None:
        self.request("DELETE", f"{table}?scope=eq.psi", prefer="return=minimal")

    def insert(self, table: str, rows: list[dict], upsert_on: str | None = None) -> None:
        path = table + (f"?on_conflict={urllib.parse.quote(upsert_on)}" if upsert_on else "")
        prefer = "return=minimal" + (",resolution=merge-duplicates" if upsert_on else "")
        for start in range(0, len(rows), BATCH):
            self.request("POST", path, rows[start:start + BATCH], prefer=prefer)


def main() -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="read and check the snapshot; send nothing")
    args = parser.parse_args()

    tables = read_snapshot(SNAPSHOT_DIR)
    for table in ORDER:
        print(f"{table}: {len(tables[table])} rows read")
    if args.dry_run:
        print("Dry run: nothing sent to Supabase.")
        return 0

    env = read_env(ROOT / ".env")
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env (copy .env.example). Nothing sent.")
        return 1

    db = Supabase(url, key)
    db.delete_psi("relations")   # children first, so no foreign key blocks the delete
    db.delete_psi("tests")
    db.insert("investigations", tables["investigations"], upsert_on="id")
    db.insert("tests", tables["tests"])
    db.insert("relations", tables["relations"])
    print("Loaded into Supabase: " + ", ".join(f"{t} {len(tables[t])}" for t in ORDER) + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main())
