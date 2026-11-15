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
import tempfile
import threading
from pathlib import Path

import duckdb

from scripts import contract
from scripts.cli import utf8_output
from scripts.paths import QUERIES_DIR, SNAPSHOT_DIR, USER_DIR

USER_NAME = re.compile(r"^[a-z0-9_-]{1,32}$")
USER_TABLES = ("tests", "relations")
MEMORY_LIMIT = "2GB"
DEFAULT_ROW_CAP = 50
QUERY_TIMEOUT_S = 30
MAX_ROWS = 100_000
THREADS = 4
TEMP_DIR = Path(tempfile.gettempdir()) / "nasatwisters-duckdb"  # spill files never land in the repository
# Physical ranges checked when the snapshot is loaded (None: no bound). Every DOUBLE must be finite.
RANGES = {"o2_pct_min": (0, 100), "o2_pct_max": (0, 100), "pressure_atm_min": (0, None),
          "pressure_atm_max": (0, None), "flow_cm_s": (0, None)}


class QueryRejected(ValueError):
    """The SQL is not exactly one SELECT statement."""


def _literal(path: Path) -> str:
    return "'" + str(path).replace("'", "''") + "'"


def _select_by_name(con: duckdb.DuckDBPyConnection, path: Path, table: str, scope: str | None = None) -> str:
    """SELECT that casts each contract column by name; fails if one is missing. A given scope replaces the file's."""
    source = f"read_csv({_literal(path)}, header = true, all_varchar = true)"
    present = {d[0] for d in con.execute(f"SELECT * FROM {source} LIMIT 0").description}
    columns = contract.TABLES[table]
    missing = [c.name for c in columns if c.name not in present]
    if missing:
        raise ValueError(f"{path.name} is missing column(s): {', '.join(missing)}")
    casts = ", ".join(f'{_literal(scope)} AS "scope"' if scope is not None and c.name == "scope"
                      else f'CAST("{c.name}" AS {c.sql_type}) AS "{c.name}"' for c in columns)
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
                user_select = _select_by_name(con, user_dir / f"{table}.csv", table, scope=f"user:{user}")
                if table == "tests" and con.execute(
                        f"SELECT count(*) FROM ({user_select}) WHERE upper(investigation) LIKE 'PSI-%'").fetchone()[0]:
                    raise ValueError(f"user dataset {user}: investigation ids must not look like PSI ids (PSI-...)")
                parts.append(user_select)
            con.execute(f'CREATE TABLE "{table}" AS ' + " UNION ALL ".join(parts))
        _check_ranges(con)
        con.execute(f"SET memory_limit = '{MEMORY_LIMIT}'")
        con.execute(f"SET threads = {THREADS}")
        TEMP_DIR.mkdir(parents=True, exist_ok=True)
        con.execute(f"SET temp_directory = {_literal(TEMP_DIR)}")
        con.execute("SET enable_external_access = false")
        con.execute("SET lock_configuration = true")
    except Exception:
        con.close()
        raise
    return con


def _check_ranges(con: duckdb.DuckDBPyConnection) -> None:
    for table, columns in contract.TABLES.items():
        for c in columns:
            if c.sql_type != "DOUBLE":
                continue
            low, high = RANGES.get(c.name, (None, None))
            conditions = [f'isinf("{c.name}")', f'isnan("{c.name}")']
            conditions += [f'"{c.name}" < {low}'] if low is not None else []
            conditions += [f'"{c.name}" > {high}'] if high is not None else []
            n = con.execute(f'SELECT count(*) FROM "{table}" WHERE ' + " OR ".join(conditions)).fetchone()[0]
            if n:
                span = f"{'-inf' if low is None else low}..{'inf' if high is None else high}"
                raise ValueError(f"{table}.csv: {n} value(s) of {c.name} are infinite or outside {span}")


def execute_limited(con: duckdb.DuckDBPyConnection, sql: str) -> tuple[list[str], list[tuple]]:
    """Run one SELECT with a time limit and a row limit; returns (column names, rows)."""
    check_select_only(sql)
    timer = threading.Timer(QUERY_TIMEOUT_S, con.interrupt)
    timer.start()
    try:
        cursor = con.execute(sql)
        rows = cursor.fetchmany(MAX_ROWS + 1)
    except duckdb.InterruptException:
        raise QueryRejected(f"the query ran past the {QUERY_TIMEOUT_S} s time limit; add a filter or an aggregate") from None
    finally:
        timer.cancel()
    if len(rows) > MAX_ROWS:
        raise QueryRejected(f"the query returned more than {MAX_ROWS} rows; add a filter or an aggregate")
    return [d[0] for d in cursor.description], rows


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
    columns, records = execute_limited(con, sql)
    rows = [[_json_safe(v) for v in row] for row in records]
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
    utf8_output()
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
