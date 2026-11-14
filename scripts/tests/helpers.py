"""Test helpers: small snapshots written in the contract format."""
import json
from pathlib import Path

from scripts import contract
from scripts.build_snapshot import write_csv

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
