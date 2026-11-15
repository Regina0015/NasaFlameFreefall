"""Catalog of tested calculations over the snapshot.

Each function takes a read-only connection from `scripts.query.open_snapshot` and
returns a calc result: the method, the values (each with its unit), the number of
tests used and the evidence (investigation, DOI, table, original columns, rows).
Every SQL value from a caller goes in as a bound parameter, never as SQL text.
"""
import json
import math
import re
from decimal import Decimal
from pathlib import Path

import duckdb

from scripts.contract import SOURCE_SEPARATOR
from scripts.mdtable import parse_table
from scripts.query import check_select_only

SCRIPT = "scripts/functions.py"
PSI_PER_ATM = 14.6959
SQL_COLUMNS = ("name", "value", "unit", "investigation", "source_table", "source_rows", "source_columns")
ATMOSPHERES_HEADING = "Sourced atmospheres"

O2_FIELDS = ("o2_pct_min", "o2_pct_max")
HAS_O2 = "(o2_pct_min IS NOT NULL OR o2_pct_max IS NOT NULL)"
O2_LOW = "coalesce(o2_pct_min, o2_pct_max)"
O2_HIGH = "coalesce(o2_pct_max, o2_pct_min)"


def _number(value, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a number")
    return float(value)


def _key(text: str, joiner: str) -> str:
    key = re.sub(r"[^a-z0-9]+", joiner, text.lower()).strip("_")
    if not key:
        raise ValueError(f"cannot make a value name from {text!r}")
    return key


def investigation_key(investigation: str) -> str:
    """Value-name prefix of an investigation: PSI-25 -> psi25."""
    return _key(investigation, "")


def phase_key(phase: str) -> str:
    """Value-name prefix of a fuel phase."""
    return _key(phase, "_")


def _investigation_order(investigation: str):
    match = re.match(r"^(\D*)(\d+)", investigation)
    return (match.group(1), int(match.group(2)), investigation) if match else (investigation, 0, investigation)


def _group_rows(rows, fields) -> dict:
    """(investigation, table, source_row, field_sources) rows -> {(investigation, table): {rows, columns}}."""
    groups: dict = {}
    for investigation, table, source_row, sources in rows:
        group = groups.setdefault((investigation, table), {"rows": set(), "columns": set()})
        group["rows"].add(source_row)
        try:
            mapping = json.loads(sources or "{}")
        except json.JSONDecodeError:
            mapping = {}
        if isinstance(mapping, dict):
            group["columns"].update(c for f in fields if isinstance(mapping.get(f), str)
                                    for c in mapping[f].split(SOURCE_SEPARATOR) if c)
    return groups


def _evidence(con: duckdb.DuckDBPyConnection, groups: dict, order: list[str] | None = None) -> list[dict]:
    if not groups:
        return []
    dois = dict(con.execute("SELECT id, doi FROM investigations").fetchall())
    rank = {inv: i for i, inv in enumerate(order or [])}
    keys = sorted(groups, key=lambda k: (rank.get(k[0], len(rank)), _investigation_order(k[0]), k[1]))
    evidence = []
    for investigation, table in keys:
        evidence.append({"investigation": investigation, "doi": dois.get(investigation) or "", "table": table,
                         "columns": sorted(groups[(investigation, table)]["columns"]),
                         "rows": sorted(groups[(investigation, table)]["rows"])})
    return evidence


def _result(function: str, params: dict, formula: str, values: dict, n_tests: int, evidence: list) -> dict:
    return {"method": {"script": SCRIPT, "function": function, "params": params, "formula": formula},
            "values": values, "n_tests": n_tests, "evidence": evidence}


def o2_range(con: duckdb.DuckDBPyConnection, investigations: list[str], threshold_pct: float) -> dict:
    """Lowest and highest O2 per investigation, and how many tests reached the threshold."""
    if not isinstance(investigations, list) or not investigations or not all(isinstance(i, str) and i for i in investigations):
        raise ValueError("investigations must be a non-empty list of investigation ids")
    threshold = _number(threshold_pct, "threshold_pct")
    ids = list(dict.fromkeys(investigations))
    values: dict = {}
    used: list = []
    n_tests = 0
    for investigation in ids:
        key = investigation_key(investigation)
        if f"{key}_o2_min" in values:
            raise ValueError(f"two investigation ids give the same value name: {key}")
        low, high, n, n_above = con.execute(
            f"SELECT min({O2_LOW}), max({O2_HIGH}), count(*), count(*) FILTER (WHERE {O2_HIGH} >= ?) "
            f"FROM tests WHERE investigation = ? AND {HAS_O2}", [threshold, investigation]).fetchone()
        values[f"{key}_o2_min"] = {"value": low, "unit": "% O2"}
        values[f"{key}_o2_max"] = {"value": high, "unit": "% O2"}
        values[f"{key}_n_tests"] = {"value": n, "unit": "tests"}
        values[f"{key}_n_at_or_above"] = {"value": n_above, "unit": "tests"}
        n_tests += n
        used += con.execute("SELECT investigation, source_table, source_row, field_sources FROM tests "
                            f"WHERE investigation = ? AND {HAS_O2}", [investigation]).fetchall()
    formula = ("For each investigation, the lowest and highest oxygen percentage over its tests that report oxygen, "
               "the number of those tests, and how many reached at least threshold_pct (o2_pct_max >= threshold_pct).")
    return _result("o2_range", {"investigations": ids, "threshold_pct": threshold}, formula, values, n_tests,
                   _evidence(con, _group_rows(used, O2_FIELDS), order=ids))


def _atmosphere(environments_md: Path, environment: str) -> dict:
    rows = parse_table(Path(environments_md).read_text(encoding="utf-8"), ATMOSPHERES_HEADING)
    row = next((r for r in rows if r.get("environment") == environment), None)
    if row is None:
        raise ValueError(f"no sourced atmosphere for {environment}; add it to _config/environments.md with a source")
    atmosphere = {"environment": environment, "source": (row.get("source") or "").strip()}
    if not atmosphere["source"]:
        raise ValueError(f"the atmosphere of {environment} has no source in _config/environments.md")
    for column in ("o2_min_pct", "pressure_max_psi"):
        try:
            atmosphere[column] = float(row.get(column) or "")
        except ValueError:
            raise ValueError(f"{column} of {environment} in _config/environments.md is not a number") from None
    return atmosphere


def coverage_by_environment(con: duckdb.DuckDBPyConnection, environment: str, environments_md: Path) -> dict:
    """Per fuel phase, how many tests reached the environment's oxygen, and at its pressure."""
    if not isinstance(environment, str) or not environment:
        raise ValueError("environment must be an environment id")
    atmosphere = _atmosphere(environments_md, environment)
    o2_min = atmosphere["o2_min_pct"]
    pressure_max_atm = atmosphere["pressure_max_psi"] / PSI_PER_ATM
    o2_match = f"{O2_HIGH} >= ?"
    stats = con.execute(
        f"SELECT phase, count(*) FILTER (WHERE {o2_match}), "
        f"count(*) FILTER (WHERE {o2_match} AND pressure_atm_min <= ?), "
        f"count(*) FILTER (WHERE {o2_match} AND pressure_atm_min IS NULL) "
        "FROM tests WHERE phase IS NOT NULL GROUP BY phase ORDER BY phase",
        [o2_min, o2_min, pressure_max_atm, o2_min]).fetchall()
    values: dict = {}
    for phase, n_o2, n_both, n_unknown in stats:
        key = phase_key(phase)
        if f"{key}_o2_match" in values:
            raise ValueError(f"two phases give the same value name: {key}")
        values[f"{key}_o2_match"] = {"value": n_o2, "unit": "tests"}
        values[f"{key}_o2_and_pressure_match"] = {"value": n_both, "unit": "tests"}
        values[f"{key}_pressure_unknown"] = {"value": n_unknown, "unit": "tests"}
    used = con.execute("SELECT investigation, source_table, source_row, field_sources FROM tests "
                       f"WHERE phase IS NOT NULL AND {o2_match}", [o2_min]).fetchall()
    formula = ("For each fuel phase, the number of tests whose oxygen reached at least o2_min_pct, how many of them "
               "also ran at or below pressure_max_psi (pressure_atm_min <= pressure_max_psi / 14.6959), and how many "
               "of them report no pressure.")
    params = {k: atmosphere[k] for k in ("environment", "o2_min_pct", "pressure_max_psi", "source")}
    return _result("coverage_by_environment", params, formula, values, len(used),
                   _evidence(con, _group_rows(used, O2_FIELDS + ("pressure_atm_min",))))


def _sql_value(value, row: int):
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = float(value)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or (isinstance(value, float) and not math.isfinite(value)):
        raise ValueError(f"row {row}: value must be a finite number or null")
    return value


def _text(value, column: str, row: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"row {row}: {column} must be non-empty text")
    return value


def sql_values(con: duckdb.DuckDBPyConnection, sql: str) -> dict:
    """Values from one SELECT, one row per value, each with the source rows it used."""
    check_select_only(sql)
    cursor = con.execute(sql)
    columns = [d[0] for d in cursor.description]
    missing = [c for c in SQL_COLUMNS if c not in columns]
    if missing:
        raise ValueError(f"sql_query result is missing column(s): {', '.join(missing)} "
                         f"(it must return {', '.join(SQL_COLUMNS)})")
    index = {c: columns.index(c) for c in SQL_COLUMNS}
    values: dict = {}
    groups: dict = {}
    pairs: set = set()
    for n, record in enumerate(cursor.fetchall(), start=1):
        row = {c: record[i] for c, i in index.items()}
        name = _text(row["name"], "name", n)
        if name in values:
            raise ValueError(f"duplicate value name {name!r}")
        unit = row["unit"]
        if not isinstance(unit, str):
            raise ValueError(f"row {n}: unit must be text")
        investigation = _text(row["investigation"], "investigation", n)
        table = _text(row["source_table"], "source_table", n)
        rows = row["source_rows"]
        if (not isinstance(rows, list) or not rows
                or not all(isinstance(r, int) and not isinstance(r, bool) and r >= 1 for r in rows)):
            raise ValueError(f"row {n}: source_rows must be a non-empty list of row numbers (1 or more)")
        source_columns = row["source_columns"]
        if not isinstance(source_columns, list) or not all(isinstance(c, str) for c in source_columns):
            raise ValueError(f"row {n}: source_columns must be a list of column names")
        values[name] = {"value": _sql_value(row["value"], n), "unit": unit}
        group = groups.setdefault((investigation, table), {"rows": set(), "columns": set()})
        group["rows"].update(rows)
        group["columns"].update(part for c in source_columns for part in c.split(SOURCE_SEPARATOR) if part)
        pairs.update((table, r) for r in rows)
    formula = "The values returned by the SQL query in params, one row per value, each with the source rows it used."
    return _result("sql_query", {"sql": sql}, formula, values, len(pairs), _evidence(con, groups))
