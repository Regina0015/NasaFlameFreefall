"""Run one catalog calculation and save it as a calc file.

Usage (from the repository root):
  uv run python -m scripts.run_calc o2_range --params '{"investigations": ["PSI-25"], "threshold_pct": 30}'
  uv run python -m scripts.run_calc coverage_by_environment --params '{"environment": "lunar_base"}'
  uv run python -m scripts.run_calc sql_query --sql "SELECT ..."
Each accepts --user NAME to add that user's dataset. Writes CALCS_DIR/C-<hash>.json
and prints {"calc_file", "values", "n_tests"} as JSON (or {"error"} and exit 1).
"""
import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb

from scripts import contract, functions
from scripts.cli import utf8_output
from scripts.paths import CALCS_DIR, CONFIG_DIR, SNAPSHOT_DIR, USER_DIR
from scripts.query import USER_TABLES, open_snapshot

PARAMS = {
    "o2_range": ("investigations", "threshold_pct"),
    "coverage_by_environment": ("environment",),
    "sql_query": ("sql",),
}
ENVIRONMENTS_MD = CONFIG_DIR / "environments.md"


def snapshot_sha256(snapshot_dir: Path, user: str | None = None, user_root: Path = USER_DIR) -> str:
    """One hash over the snapshot CSVs (and the user's CSVs) that a calculation read."""
    files = [(f"snapshot/{t}.csv", Path(snapshot_dir) / f"{t}.csv") for t in contract.TABLES]
    if user is not None:
        files += [(f"user/{user}/{t}.csv", Path(user_root) / user / f"{t}.csv") for t in USER_TABLES]
    digest = hashlib.sha256()
    for label, path in files:
        if path.exists():
            data = path.read_bytes()
            digest.update(f"{label}\0{len(data)}\0".encode("utf-8"))
            digest.update(data)
    return digest.hexdigest()


def calc_digest(calc: dict) -> str:
    """SHA-256 of a calc without its `created` time: the C-<hash> file name, checked again by write_finding."""
    body = {k: v for k, v in calc.items() if k != "created"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()


def _check_params(function: str, params) -> None:
    if function not in PARAMS:
        raise ValueError(f"unknown function {function!r}; use one of: {', '.join(PARAMS)}")
    if not isinstance(params, dict):
        raise ValueError("params must be a JSON object")
    expected = PARAMS[function]
    unknown = sorted(set(params) - set(expected))
    if unknown:
        raise ValueError(f"unknown param(s) for {function}: {', '.join(unknown)} (expected: {', '.join(expected)})")
    missing = [p for p in expected if p not in params]
    if missing:
        raise ValueError(f"missing param(s) for {function}: {', '.join(missing)}")


def run(function: str, params: dict, user: str | None = None, snapshot_dir: Path = SNAPSHOT_DIR,
        user_root: Path = USER_DIR, out_dir: Path = CALCS_DIR, environments_md: Path = ENVIRONMENTS_MD,
        now: str | None = None) -> Path:
    """Run the calculation and write its calc file; the same calculation on the same data gives the same file name."""
    _check_params(function, params)
    con = open_snapshot(snapshot_dir, user=user, user_root=user_root)
    try:
        if function == "o2_range":
            calc = functions.o2_range(con, params["investigations"], params["threshold_pct"])
        elif function == "coverage_by_environment":
            calc = functions.coverage_by_environment(con, params["environment"], environments_md)
        else:
            calc = functions.sql_values(con, params["sql"])
    finally:
        con.close()
    calc["snapshot_sha256"] = snapshot_sha256(snapshot_dir, user, user_root)
    digest = calc_digest(calc)
    calc["created"] = now or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"C-{digest[:12]}.json"
    path.write_text(json.dumps(calc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
    return path


def main(argv: list[str] | None = None) -> int:
    utf8_output()
    parser = argparse.ArgumentParser(description="Run one catalog calculation and save a calc file.")
    parser.add_argument("function")
    parser.add_argument("--params", default=None, help="JSON object (o2_range, coverage_by_environment)")
    parser.add_argument("--sql", default=None, help="SELECT query (sql_query)")
    parser.add_argument("--user", default=None)
    args = parser.parse_args(argv)
    try:
        if args.function == "sql_query":
            if args.sql is None or args.params is not None:
                raise ValueError("sql_query takes --sql and no --params")
            params = {"sql": args.sql}
        else:
            if args.sql is not None:
                raise ValueError(f"{args.function} takes --params, not --sql")
            params = json.loads(args.params or "{}")
        path = run(args.function, params, user=args.user)
        calc = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError, duckdb.Error) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps({"calc_file": str(path), "values": calc["values"], "n_tests": calc["n_tests"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
