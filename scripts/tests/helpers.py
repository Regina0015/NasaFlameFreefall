"""Test helpers: small snapshots written in the contract format, and a fixture finding."""
import json
import tempfile
from pathlib import Path

from scripts import contract
from scripts.build_snapshot import write_csv
from scripts.write_finding import LUNAR_WARNING

BASS2_TABLE = "PSI-25_Experimental table_BASS-II.csv"
FLEX_TABLE = "PSI-69_Experimental table_FLEX.csv"
BASS2_O2 = "Calibrated initial O2 % by vol"
FLEX_O2 = "O initial ambient composition; mole fraction"
FLEX_P = "Ambient pressure; mmHg"


def fixture_test(inv, table, row, phase, o2, pressure=None, sources=None, scope="psi"):
    return {"test_id": f"{inv}-T0-R{row}", "investigation": inv, "source_table": table, "source_row": row,
            "fuel": "fixture fuel", "phase": phase, "o2_pct_min": o2, "o2_pct_max": o2,
            "pressure_atm_min": pressure, "pressure_atm_max": pressure, "gravity": "microgravity",
            "field_sources": json.dumps(sources or {}), "raw": "{}", "other": "{}", "scope": scope}


FIXTURE_TESTS = [
    fixture_test("PSI-25", BASS2_TABLE, 1, "solid", 21.0, sources={"o2_pct_min": BASS2_O2, "o2_pct_max": BASS2_O2}),
    fixture_test("PSI-25", BASS2_TABLE, 2, "solid", 22.2, sources={"o2_pct_min": BASS2_O2, "o2_pct_max": BASS2_O2}),
    fixture_test("PSI-69", FLEX_TABLE, 1, "droplet", 34.0, 0.5,
                 sources={"o2_pct_min": FLEX_O2, "o2_pct_max": FLEX_O2, "pressure_atm_min": FLEX_P, "pressure_atm_max": FLEX_P}),
]
FIXTURE_INVESTIGATIONS = [
    {"id": "PSI-25", "acronym": "BASS-II", "label": "BASS-II", "doi": "10.60555/4qc4-de67", "type": "flight", "tier": 1, "scope": "psi"},
    {"id": "PSI-69", "acronym": "FLEX", "label": "FLEX", "doi": "10.60555/mbq8-0451", "type": "flight", "tier": 1, "scope": "psi"},
]
FIXTURE_RELATIONS = [
    {"from_id": "PSI-25", "to_id": "PSI-26", "type": "related_in_psi", "source": "related_glds", "scope": "psi"},
]


def make_snapshot(directory: Path, tests: list[dict], investigations: list[dict], relations: list[dict]) -> Path:
    """Write the three snapshot CSVs (missing columns become empty cells)."""
    directory = Path(directory)
    write_csv(directory / "tests.csv", contract.names(contract.TESTS), tests)
    write_csv(directory / "investigations.csv", contract.names(contract.INVESTIGATIONS), investigations)
    write_csv(directory / "relations.csv", contract.names(contract.RELATIONS), relations)
    return directory


def make_fixture_snapshot(directory: Path, extra_tests: list[dict] | None = None) -> Path:
    return make_snapshot(directory, FIXTURE_TESTS + (extra_tests or []), FIXTURE_INVESTIGATIONS, FIXTURE_RELATIONS)


def fixture_calc(function: str, *args) -> dict:
    """A calc result of `scripts.functions.<function>(con, *args)` on the fixture snapshot."""
    from scripts import functions
    from scripts.query import open_snapshot
    with tempfile.TemporaryDirectory() as d:
        snap = make_fixture_snapshot(Path(d) / "snapshot")
        con = open_snapshot(snap, user_root=Path(d) / "user")
        try:
            return getattr(functions, function)(con, *args)
        finally:
            con.close()


def fixture_o2_calc() -> dict:
    return fixture_calc("o2_range", ["PSI-25", "PSI-69"], 30)


TIERS = {"PSI-25": 1, "PSI-69": 1}
NOW = "2026-11-14T12:00:00Z"
NO_OFFER = {"chart": {"available": False, "idea": None}, "graph": {"available": False, "idea": None}, "footnote": None}
FIXTURE_TEXT = {
    "question": "Did any BASS-II or FLEX test reach the lunar habitat oxygen level (30% or more)?",
    "status": "has_data",
    "claim": "None of the 2 BASS-II solid-fuel tests reached 30% oxygen (maximum 22.2%); FLEX droplet tests reached up to 34%.",
    "summary_student": "Solid materials like plastics and fabrics were never burned in space at the oxygen level planned "
                       "for a Moon base. Only liquid fuel droplets were tested that high.",
    "summary_professional": "BASS-II initial O2: 21–22.2% vol (n = 2). FLEX initial O2: 34% mole fraction (n = 1). "
                            "No solid-fuel test in these two investigations at ≥30% O2.",
    "assumptions": ["Uses the initial O2 of each test.", "Mole fraction and volume fraction are treated as equal (ideal gas)."],
    "limitations": ["Covers only BASS-II and FLEX, not every solid-fuel investigation in PSI.",
                    "No test at 30% means no data, not that these materials are safe or unsafe at 30%."],
    "warnings": [LUNAR_WARNING],
    "environments": ["lunar_base", "pressurized_rover"],
    "pillar": "prevention",
    "visual_offer": {"chart": {"available": True, "idea": "Range bars of the O2 levels tested by BASS-II and FLEX, with a dashed line at the 30% lunar target."},
                     "graph": {"available": False, "idea": None},
                     "footnote": "Want a visual? I can draw a chart comparing the oxygen levels tested by BASS-II and FLEX against the 30% lunar habitat target."},
}


def fixture_finding(calc: dict | None = None, fid: str = "F-001", **text) -> dict:
    """A checked finding built from the fixture calc and text (raises if write_finding finds problems)."""
    from scripts.write_finding import build_finding
    finding, problems = build_finding(calc or fixture_o2_calc(), dict(FIXTURE_TEXT, **text), TIERS, "claude-opus-5-5", NOW, fid)
    if problems:
        raise AssertionError(problems)
    return finding
