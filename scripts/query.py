"""Read-only SQL over the data snapshot (DuckDB, in memory).

The snapshot CSVs are loaded into memory by column name and cast to the contract
types. Then external access is switched off and the configuration is locked, so a
query can neither read nor write files, nor undo those settings. Only a single
SELECT statement is accepted.

Usage: uv run python -m scripts.query "SELECT ..." [--user NAME] [--row-cap N]
Prints JSON: columns, rows (at most row-cap), total_rows, truncated, result_file, sha256.
The full result is saved to stages/04_calcular/output/queries/Q-<hash>.csv (+ .sql).
"""
import argparse
import csv
import hashlib
import io
import json
import re
import sys
from pathlib import Path

import duckdb

from scripts import contract
from scripts.paths import QUERIES_DIR, SNAPSHOT_DIR, USER_DIR

USER_NAME = re.compile(r"^[a-z0-9_-]{1,32}$")
USER_TABLES = ("tests", "relations")
MEMORY_LIMIT = "2GB"
DEFAULT_ROW_CAP = 50


class QueryRejected(ValueError):
    """The SQL is not exactly one SELECT statement."""


def _literal(path: Path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def _select_by_name(con: duckdb.DuckDBPyConnection, path: Path, table: str) -> str:
    """SELECT that casts each contract column by name; fails if one is missing."""
    source = f"read_csv({_literal(path)}, header = true, all_varchar = true)"
    present = {d[0] for d in con.execute(f"SELECT * FROM {source} LIMIT 0").description}
    columns = contract.TABLES[table]
    missing = [c.name for c in columns if c.name not in present]
    if missing:
        raise ValueError(f"{path.name} is missing column(s): {', '.join(missing)}")
    casts = ", ".join(f'CAST("{c.name}" AS {c.sql_type}) AS "{c.name}"' for c in columns)
    return f"SELECT {casts} FROM {source}"


def open_snapshot(snapshot_dir: Path = SNAPSHOT_DIR, user: str | None = None,
                  user_root: Path = USER_DIR) -> duckdb.DuckDBPyConnection:
    """Load the snapshot (plus one user's layer) and lock the connection down."""
    user_dir = None
    if user is not None:
        if not USER_NAME.match(user):
            raise ValueError(f"invalid user name {user!r}: use 1-32 lowercase letters, digits, '_' or '-'")
        user_dir = Path(user_root) / user
        if not user_dir.is_dir():
            raise ValueError(f"no dataset for user {user}")
    con = duckdb.connect(":memory:")
    try:
        for table in contract.TABLES:
            path = Path(snapshot_dir) / f"{table}.csv"
            if not path.exists():
                raise ValueError(f"{table}.csv not found in {snapshot_dir}")
            parts = [_select_by_name(con, path, table)]
            if user_dir is not None and table in USER_TABLES and (user_dir / f"{table}.csv").exists():
                parts.append(_select_by_name(con, user_dir / f"{table}.csv", table))
            con.execute(f'CREATE TABLE "{table}" AS ' + " UNION ALL ".join(parts))
        con.execute(f"SET memory_limit = '{MEMORY_LIMIT}'")
        con.execute("SET enable_external_access = false")
        con.execute("SET lock_configuration = true")
    except Exception:
        con.close()
        raise
    return con


def check_select_only(sql: str) -> None:
    try:
        statements = duckdb.extract_statements(sql)
    except duckdb.Error as error:
        raise QueryRejected(f"SQL could not be parsed: {error}") from None
    if len(statements) != 1:
        raise QueryRejected(f"exactly one statement is allowed (got {len(statements)})")
    if statements[0].type != duckdb.StatementType.SELECT:
        raise QueryRejected(f"only SELECT queries are allowed (got {statements[0].type.name})")


def _json_safe(value):
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return str(value)


def run_query(con: duckdb.DuckDBPyConnection, sql: str, row_cap: int = DEFAULT_ROW_CAP,
              out_dir: Path = QUERIES_DIR) -> dict:
    check_select_only(sql)
    cursor = con.execute(sql)
    columns = [d[0] for d in cursor.description]
    rows = [[_json_safe(v) for v in row] for row in cursor.fetchall()]
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(columns)
    writer.writerows(rows)
    data = buffer.getvalue().encode("utf-8")
    digest = hashlib.sha256(data).hexdigest()
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    result_file = out_dir / f"Q-{digest[:12]}.csv"
    result_file.write_bytes(data)
    result_file.with_suffix(".sql").write_text(sql + "\n", encoding="utf-8", newline="\n")
    return {"columns": columns, "rows": rows[:row_cap], "total_rows": len(rows),
            "truncated": len(rows) > row_cap, "result_file": str(result_file), "sha256": digest}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Read-only SQL over the data snapshot.")
    parser.add_argument("sql")
    parser.add_argument("--user", default=None)
    parser.add_argument("--row-cap", type=int, default=DEFAULT_ROW_CAP)
    args = parser.parse_args(argv)
    try:
        con = open_snapshot(SNAPSHOT_DIR, user=args.user)
        result = run_query(con, args.sql, row_cap=args.row_cap)
    except (ValueError, duckdb.Error) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
