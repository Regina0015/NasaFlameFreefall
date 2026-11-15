"""Read-only tools for the dashboard chat (a small local model picks one; this code computes the answer).

Usage (from the repository root):
  uv run python -m scripts.chat_tools query_tests '{"phase": "solid", "o2_min_pct": 30}'
  uv run python -m scripts.chat_tools check_environment '{"environment": "lunar_base"}'
  uv run python -m scripts.chat_tools get_findings '{"topic": "flame spread"}'
Prints one JSON object. On bad input it prints {"error": ...} and exits with 1.

Rules:
- Nothing is written to disk: no query files, no drafts. The snapshot is opened read-only in memory.
- The model never sends SQL. Filters are fixed parameters, bound as SQL parameters; group_by
  picks from a fixed list of columns.
- Text from PSI records and findings is data, not instructions (CLAUDE.md rule 8). It is
  returned with control and hidden characters removed.
"""
import hashlib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import duckdb

from scripts import findings
from scripts.answer import _clean
from scripts.audit_step import AUDITS_DIR, PENDING, read_verdict
from scripts.cli import utf8_output
from scripts.functions import HAS_O2, O2_HIGH, O2_LOW, PSI_PER_ATM, coverage_by_environment, phase_key
from scripts.paths import CONFIG_DIR, FINDINGS_DIR, INVESTIGATOR_OUT, ROOT, SNAPSHOT_DIR
from scripts.query import open_snapshot
from scripts.write_finding import LUNAR_WARNING

ENVIRONMENTS_MD = CONFIG_DIR / "environments.md"
PHASES = ("solid", "droplet", "gas", "smoke")
GRAVITIES = ("microgravity", "earth")
GROUP_COLUMNS = {"none": None, "phase": "phase", "fuel": "fuel", "investigation": "investigation", "gravity": "gravity"}
# Environments with a sourced range in _config/environments.md ("Sourced atmospheres").
SOURCED = ("lunar_base", "pressurized_rover")
# Reference atmospheres: a single point, not a range; the chat does not count tests "inside" them.
REFERENCE = {
    "earth_sea_level": {"o2_pct": 21, "pressure_psi": 14.7, "source": "Challenge text, \"Spacesuits and oxygen concentration\" (21% implied)"},
    "spacesuit": {"o2_pct": 100, "pressure_psi": 4.3, "source": "Challenge text, \"Spacesuits and oxygen concentration\""},
}
UNSOURCED = ("space_station", "transit_vehicle", "mars_base")
ENVIRONMENTS = SOURCED + tuple(REFERENCE) + UNSOURCED
PARTIAL_GRAVITY = ("lunar_base", "pressurized_rover", "mars_base")
GROUP_LIMIT = 12
EXAMPLE_IDS = 5
FINDING_LIMIT = 4
TEXT_LIMIT = 400
SNAPSHOT_NOTE = "Live count from data/snapshot (the stage 02 snapshot). It is not an audited finding."
FINDING_FILE = re.compile(r"^F-\d{3}\.json$")
AUDITOR_TIMEOUT_S = 5


def _round(value, digits: int = 2):
    return None if value is None else round(float(value), digits)


def _text(value, limit: int = TEXT_LIMIT):
    if value is None:
        return None
    text = _clean(value)
    return text if len(text) <= limit else text[:limit] + "…"


def resolve_investigation(con: duckdb.DuckDBPyConnection, name) -> str | None:
    """'PSI-25', 'psi 25', 'BASS-II' or 'bass ii' -> 'PSI-25'; None if unknown."""
    if not isinstance(name, str) or not name.strip():
        return None
    number = re.fullmatch(r"\s*psi[\s_-]*(\d+)\s*", name, re.IGNORECASE)
    if number:
        return f"PSI-{number.group(1)}"
    flat = re.sub(r"[^a-z0-9]", "", name.lower())
    row = con.execute(
        "SELECT id FROM investigations WHERE regexp_replace(lower(coalesce(acronym, '')), '[^a-z0-9]', '', 'g') = ? "
        "OR regexp_replace(lower(coalesce(label, '')), '[^a-z0-9]', '', 'g') = ? ORDER BY id LIMIT 1", [flat, flat]).fetchone()
    return row[0] if row else None


def _number(args: dict, key: str):
    value = args.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{key} must be a number")
    return float(value)


def _choice(args: dict, key: str, allowed) -> str | None:
    value = args.get(key)
    if value in (None, ""):
        return None
    if value not in allowed:
        raise ValueError(f"{key} must be one of: {', '.join(allowed)}")
    return value


def query_tests(con: duckdb.DuckDBPyConnection, args: dict) -> dict:
    """Count tests and give O2 / pressure ranges, with fixed filters and an optional grouping."""
    warnings = []
    text_where, params = ["scope = 'psi'"], []
    investigation = None
    if args.get("investigation"):
        investigation = resolve_investigation(con, args["investigation"])
        if investigation is None:
            warnings.append(f"Unknown investigation {_text(args['investigation'], 40)!r}.")
            investigation = "(none)"
        text_where.append("investigation = ?")
        params.append(investigation)
    phase = _choice(args, "phase", PHASES)
    if phase:
        text_where.append("phase = ?")
        params.append(phase)
    gravity = _choice(args, "gravity", GRAVITIES)
    if gravity:
        text_where.append("gravity = ?")
        params.append(gravity)
    fuel = args.get("fuel")
    if fuel:
        text_where.append("fuel ILIKE ?")
        params.append(f"%{str(fuel)[:60]}%")

    o2_min, o2_max = _number(args, "o2_min_pct"), _number(args, "o2_max_pct")
    p_min, p_max = _number(args, "pressure_min_psi"), _number(args, "pressure_max_psi")
    group = GROUP_COLUMNS.get(args.get("group_by") or "none", "missing")
    if group == "missing":
        raise ValueError(f"group_by must be one of: {', '.join(GROUP_COLUMNS)}")

    base = " AND ".join(text_where)
    scope_n, scope_o2_low, scope_o2_high, scope_p_low, scope_p_high = con.execute(
        f"SELECT count(*), min({O2_LOW}), max({O2_HIGH}), min(pressure_atm_min), max(pressure_atm_max) "
        f"FROM tests WHERE {base}", params).fetchone()

    # Numeric filters, with the same O2 reading as scripts/functions.py: a row "reaches" a level
    # when its highest O2 does. A row without the value is not counted, and is reported apart.
    numeric, numeric_params = [], []
    if o2_min is not None:
        numeric.append(f"{O2_HIGH} >= ?")
        numeric_params.append(o2_min)
    if o2_max is not None:
        numeric.append(f"{O2_LOW} <= ?")
        numeric_params.append(o2_max)
    if p_min is not None:
        numeric.append("coalesce(pressure_atm_max, pressure_atm_min) >= ?")
        numeric_params.append(p_min / PSI_PER_ATM)
    if p_max is not None:
        numeric.append("coalesce(pressure_atm_min, pressure_atm_max) <= ?")
        numeric_params.append(p_max / PSI_PER_ATM)
    missing_o2 = missing_pressure = 0
    if o2_min is not None or o2_max is not None:
        missing_o2 = con.execute(f"SELECT count(*) FROM tests WHERE {base} AND NOT {HAS_O2}", params).fetchone()[0]
    if p_min is not None or p_max is not None:
        missing_pressure = con.execute(
            f"SELECT count(*) FROM tests WHERE {base} AND pressure_atm_min IS NULL AND pressure_atm_max IS NULL",
            params).fetchone()[0]
    where = " AND ".join([base] + numeric)
    all_params = params + numeric_params

    key = f'coalesce(CAST("{group}" AS VARCHAR), \'no data\')' if group else "'all'"
    rows = con.execute(
        f"SELECT {key} AS grp, count(*), list(DISTINCT investigation ORDER BY investigation), "
        f"min({O2_LOW}), max({O2_HIGH}), min(pressure_atm_min), max(pressure_atm_max), "
        f"list(test_id ORDER BY investigation, source_table, source_row)[1:{EXAMPLE_IDS}] "
        f"FROM tests WHERE {where} GROUP BY grp ORDER BY count(*) DESC, grp", all_params).fetchall()
    total = sum(r[1] for r in rows)
    groups = [{"group": g, "n_tests": n, "investigations": invs,
               "o2_pct": {"min": _round(o2a), "max": _round(o2b)} if o2a is not None else None,
               "pressure_psi": ({"min": _round(pa * PSI_PER_ATM), "max": _round(pb * PSI_PER_ATM)} if pa is not None else None),
               "example_test_ids": ids}
              for g, n, invs, o2a, o2b, pa, pb, ids in rows]
    numeric_asked = bool(numeric)
    if scope_n == 0:
        summary = "No data: no tests match these filters."
    elif numeric_asked:
        summary = f"{total} of {scope_n} tests meet the numeric conditions."
    else:
        summary = f"{total} tests."
    result = {
        "filters": {"investigation": investigation, "phase": phase, "gravity": gravity, "fuel": fuel,
                    "o2_min_pct": o2_min, "o2_max_pct": o2_max, "pressure_min_psi": p_min, "pressure_max_psi": p_max},
        "summary": summary,
        "n_tests": total,
        "groups": groups[:GROUP_LIMIT],
        "groups_not_shown": max(0, len(groups) - GROUP_LIMIT),
        "no_data": scope_n == 0,
        "none_match": scope_n > 0 and total == 0,
        "warnings": warnings,
        "source": "snapshot",
        "note": SNAPSHOT_NOTE,
    }
    if numeric_asked:
        result["before_numeric_filters"] = {
            "n_tests": scope_n,
            "o2_pct_tested": {"min": _round(scope_o2_low), "max": _round(scope_o2_high)} if scope_o2_low is not None else None,
            "pressure_psi_tested": ({"min": _round(scope_p_low * PSI_PER_ATM), "max": _round(scope_p_high * PSI_PER_ATM)}
                                    if scope_p_low is not None else None),
            "excluded_no_o2_value": missing_o2,
            "excluded_no_pressure_value": missing_pressure,
        }
    return result


def check_environment(con: duckdb.DuckDBPyConnection, args: dict, environments_md: Path = ENVIRONMENTS_MD) -> dict:
    """Which tests fall inside a crewed environment's atmosphere, per fuel phase (functions.coverage_by_environment)."""
    environment = _choice(args, "environment", ENVIRONMENTS)
    if environment is None:
        raise ValueError(f"environment is required: one of {', '.join(ENVIRONMENTS)}")
    warnings = [LUNAR_WARNING] if environment in PARTIAL_GRAVITY else []
    if environment in UNSOURCED:
        return {"environment": environment, "status": "no_source", "no_data": True, "warnings": warnings,
                "summary": f"The atmosphere of {environment} has no source in _config/environments.md. "
                           "It is not evaluated, to avoid inventing values."}
    if environment in REFERENCE:
        ref = REFERENCE[environment]
        return {"environment": environment, "status": "reference_point", "no_data": False, "warnings": warnings,
                "atmosphere": ref,
                "summary": (f"{environment} is a reference point ({ref['o2_pct']}% O2 at {ref['pressure_psi']} psi), "
                            "not a range, so tests are not counted as inside it. Use query_tests with O2 and "
                            "pressure filters to look near it.")}

    calc = coverage_by_environment(con, environment, environments_md)
    params = calc["method"]["params"]
    totals = dict(con.execute("SELECT phase, count(*) FROM tests WHERE phase IS NOT NULL AND scope = 'psi' "
                              "GROUP BY phase").fetchall())
    phases = []
    v = calc["values"]
    for phase in sorted(totals):
        key = phase_key(phase)
        if f"{key}_o2_match" not in v:  # left out by coverage_by_environment: some tests report no O2
            phases.append({"phase": phase, "n_tests": totals[phase], "no_data": True, "reach_o2": None,
                           "reach_o2_and_pressure": None, "reach_o2_pressure_unknown": None})
            continue
        phases.append({"phase": phase, "n_tests": totals[phase], "no_data": False,
                       "reach_o2": v[f"{key}_o2_match"]["value"],
                       "reach_o2_and_pressure": v[f"{key}_o2_and_pressure_match"]["value"],
                       "reach_o2_pressure_unknown": v[f"{key}_pressure_unknown"]["value"]})
    both = sum(p["reach_o2_and_pressure"] or 0 for p in phases)
    gaps = [f"No data for {p['phase']}: some of its tests report no oxygen." if p["no_data"]
            else f"No {p['phase']} test reached {params['o2_min_pct']:g}% O2."
            for p in phases if p["no_data"] or p["reach_o2"] == 0]
    return {
        "environment": environment,
        "status": "evaluated",
        "conditions": f"O2 >= {params['o2_min_pct']:g}% and pressure <= {params['pressure_max_psi']:g} psi",
        "atmosphere_source": params["source"],
        "summary": (f"{both} tests reached both the O2 and the pressure of {environment}; "
                    f"{calc['n_tests']} reached the O2."),
        "by_phase": phases,
        "gaps": gaps,
        "investigations": [{"investigation": e["investigation"], "doi": e["doi"]} for e in calc["evidence"]][:10],
        "method": {"script": calc["method"]["script"], "function": calc["method"]["function"]},
        "no_data": not phases,
        "none_match": bool(phases) and both == 0,
        "warnings": warnings,
        "source": "snapshot",
        "note": SNAPSHOT_NOTE,
    }


def _remote_audits() -> dict | None:
    """Grades from the Auditor gateway (AUDITOR_URL and AUDITOR_API_KEY), by finding id. None: not set, or unreachable."""
    base = os.environ.get("AUDITOR_URL", "").rstrip("/")
    if not base:
        return None
    request = urllib.request.Request(f"{base}/audits", headers={"X-API-Key": os.environ.get("AUDITOR_API_KEY", "")})
    try:
        with urllib.request.urlopen(request, timeout=AUDITOR_TIMEOUT_S) as response:
            return {a["finding_id"]: a for a in json.load(response)["audits"]}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _grade(finding_path: Path, audits_dir: Path, remote: dict | None = None) -> tuple[str, list[str]]:
    if remote is not None:  # same rule as read_verdict: an audit counts only for this exact file
        row = remote.get(finding_path.stem)
        if (not isinstance(row, dict) or row.get("stale_audit")
                or row.get("finding_sha256") != hashlib.sha256(finding_path.read_bytes()).hexdigest()):
            return PENDING, []
        return row["grade"], list(row.get("failed_checks") or [])
    verdict = read_verdict(finding_path, audits_dir)
    if verdict is None:
        return PENDING, []
    failed = [c.get("id") for c in verdict.get("checks") or [] if isinstance(c, dict) and c.get("result") == "fail"]
    return verdict["grade"], failed


def _words(topic) -> list[str]:
    return [w for w in re.split(r"[^a-z0-9%.-]+", str(topic or "").lower()) if len(w) >= 4]


def _hits(text: str, words: list[str]) -> int:
    low = text.lower()
    return sum(w in low for w in words)


def get_findings(con: duckdb.DuckDBPyConnection, args: dict, findings_dir: Path = FINDINGS_DIR,
                 audits_dir: Path = AUDITS_DIR, investigations_dir: Path = INVESTIGATOR_OUT / "investigations") -> dict:
    """Findings (stage 04) with their audit grade (stage 05), and investigation summaries (stage 03).

    With AUDITOR_URL set, grades come from the Auditor gateway; otherwise from the local audit files."""
    warnings = []
    remote = _remote_audits()
    if os.environ.get("AUDITOR_URL") and remote is None:
        warnings.append("The Auditor gateway is unreachable: grades come from local audit files.")
    words = _words(args.get("topic"))
    investigation = None
    if args.get("investigation"):
        investigation = resolve_investigation(con, args["investigation"])
        if investigation is None:
            warnings.append(f"Unknown investigation {_text(args['investigation'], 40)!r}.")
            investigation = "(none)"  # match nothing, rather than show every finding
    environment = _choice(args, "environment", ENVIRONMENTS)

    scored = []
    paths = sorted(p for p in Path(findings_dir).glob("F-*.json") if FINDING_FILE.match(p.name))
    rejected = 0
    for path in paths:
        try:
            f = findings.load(path.stem, findings_dir)
        except (ValueError, OSError):
            continue
        grade, failed = _grade(path, audits_dir, remote)
        if grade == "rejected":
            rejected += 1  # rejected findings are never published (_config/confidence.md)
            continue
        if investigation and not any(e.get("investigation") == investigation for e in f.get("evidence") or []):
            continue
        # Only crewed environments filter; Earth and the spacesuit are reference points that no finding is tagged with.
        if environment not in (None, *REFERENCE) and f.get("environments") and environment not in f["environments"]:
            continue
        text = " ".join(str(f.get(k) or "") for k in ("question", "claim", "summary_professional"))
        hits = _hits(text, words) if words else 1
        if hits:
            scored.append((hits, f, grade, failed))
    scored.sort(key=lambda x: (-x[0], x[1]["id"]))
    shown = [{
        "id": f["id"], "version": f.get("version"), "grade": grade, "failed_checks": failed,
        "status": f.get("status"), "question": _text(f.get("question")), "claim": _text(f.get("claim")),
        "summary_student": _text(f.get("summary_student")), "summary_professional": _text(f.get("summary_professional")),
        "n_tests": f.get("n_tests"),
        "sources": list(dict.fromkeys(f"{e.get('investigation')} (DOI {e.get('doi')})" for e in f.get("evidence") or []
                                      if isinstance(e, dict)))[:5],
        "limitations": [_text(x, 200) for x in (f.get("limitations") or [])[:3]],
        "warnings": [_text(x, 200) for x in f.get("warnings") or []],
    } for _, f, grade, failed in scored[:FINDING_LIMIT]]

    # Investigation summaries: from the Investigator (stage 03) when it has run, else the snapshot columns.
    summaries = []
    if investigation or words:
        rows = con.execute("SELECT id, label, title, doi, summary_student, summary_professional, pillar, environments "
                           "FROM investigations WHERE scope = 'psi' ORDER BY id").fetchall()
        for inv_id, label, title, doi, s_student, s_prof, pillar, envs in rows:
            if investigation and inv_id != investigation:
                continue
            record_path = Path(investigations_dir) / f"{inv_id}.json"
            record = json.loads(record_path.read_text(encoding="utf-8")) if record_path.exists() else {}
            student = (record.get("summary_student") or {}).get("text") if isinstance(record.get("summary_student"), dict) else s_student
            prof = (record.get("summary_professional") or {}).get("text") if isinstance(record.get("summary_professional"), dict) else s_prof
            hits = _hits(" ".join(str(x or "") for x in (label, title, student, prof)), words) if words else 1
            if not investigation and not hits:
                continue
            summaries.append((hits, bool(record), {
                "investigation": inv_id, "label": label, "title": _text(title, 150), "doi": doi,
                "summary_student": _text(student) or "not summarized yet (stage 03)",
                "summary_professional": _text(prof) or "not summarized yet (stage 03)",
                "reviewed_by_investigator": bool(record)}))
        # Most matching words first; among equals, the ones the Investigator has reviewed.
        summaries = [s for _, _, s in sorted(summaries, key=lambda x: (-x[0], not x[1], x[2]["investigation"]))[:3]]

    audited = sum(1 for x in shown if x["grade"] != PENDING)
    return {
        "findings": shown,
        "investigation_summaries": summaries,
        "availability": {
            "findings_total": len(paths),
            "findings_shown_audited": audited,
            "rejected_not_shown": rejected,
            "investigator_records": len(list(Path(investigations_dir).glob("PSI-*.json"))) if Path(investigations_dir).is_dir() else 0,
        },
        "no_data": not shown and not summaries,
        "warnings": warnings,
        "source": "findings",
        "preliminary": any(x["grade"] == PENDING for x in shown),
        "note": ("Some findings are pending audit: they have no confidence grade yet."
                 if any(x["grade"] == PENDING for x in shown) else "Findings with their audit grade."),
    }


TOOLS = {"query_tests": query_tests, "check_environment": check_environment, "get_findings": get_findings}


def run(tool: str, args: dict, snapshot_dir: Path = SNAPSHOT_DIR, **paths) -> dict:
    if tool not in TOOLS:
        raise ValueError(f"unknown tool {tool!r}: use {', '.join(TOOLS)}")
    if not isinstance(args, dict):
        raise ValueError("arguments must be a JSON object")
    con = open_snapshot(snapshot_dir)
    try:
        return TOOLS[tool](con, args, **paths)
    finally:
        con.close()


AUDITOR_SETTINGS = ("AUDITOR_URL", "AUDITOR_API_KEY")


def load_auditor_settings(env_file: Path = ROOT / ".env") -> None:
    """Read only AUDITOR_URL and AUDITOR_API_KEY from .env (the dashboard does not export it); never override."""
    try:
        lines = Path(env_file).read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines:
        key, sep, value = line.strip().partition("=")
        if sep and key.strip() in AUDITOR_SETTINGS:
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main(argv: list[str] | None = None) -> int:
    utf8_output()
    load_auditor_settings()
    argv = sys.argv[1:] if argv is None else argv
    try:
        if len(argv) != 2:
            raise ValueError("usage: python -m scripts.chat_tools <tool> '<json arguments>'")
        result = run(argv[0], json.loads(argv[1]))
    except (ValueError, duckdb.Error) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
