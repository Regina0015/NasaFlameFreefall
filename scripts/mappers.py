"""One mapper per PSI test table: original cells -> one row of the tests contract.

A mapper is called as mapper(investigation_id, source_row, cells) and returns a
dict with every column of contract.TESTS except test_id and source_table (the
builder fills those), or None to skip the row. Mappers never guess a value: what
they cannot read stays empty and is described in `problems`.
"""
import json
from typing import Callable

from scripts import contract
from scripts.cells import parse_list, parse_number

Mapper = Callable[[str, int, dict[str, str]], dict | None]

O2_RANGE = (0.0, 100.0)
PRESSURE_RANGE_ATM = (0.0, 50.0)
FLOW_RANGE_CM_S = (0.0, 1000.0)
MMHG_PER_ATM = 760.0
ATM_PER_BAR = 0.986923


def check_range(field: str, value: float | None, lo: float, hi: float, problems: list[str]) -> float | None:
    """Null a value outside its physical range and note why."""
    if value is None:
        return None
    if not lo <= value <= hi:
        problems.append(f"out of physical range: {field}={value:g}")
        return None
    return round(value, 6)


class _Row:
    """Collects one output row while a mapper reads the cells."""

    def __init__(self, investigation: str, source_row: int, cells: dict[str, str]):
        self.cells = cells
        self.data = {name: None for name in contract.names(contract.TESTS)}
        self.data.update(investigation=investigation, source_row=source_row, gravity="microgravity", scope="psi")
        self.problems: list[str] = []
        self.sources: dict[str, str] = {}
        self.other: dict[str, str] = {}

    def text(self, field: str, column: str) -> str | None:
        value = " ".join((self.cells.get(column) or "").split()) or None
        self.data[field] = value
        if value is not None:
            self.sources[field] = column
        return value

    def number(self, field: str, column: str, scale: float, lo: float, hi: float) -> float | None:
        value, notes = parse_number(self.cells.get(column, ""))
        self.problems.extend(f"{column}: {n}" for n in notes)
        if value is not None:
            value = check_range(field, value * scale, lo, hi, self.problems)
        self.data[field] = value
        if value is not None:
            self.sources[field] = column
        return value

    def number_range(self, field_min: str, field_max: str, column: str, scale: float,
                     lo: float, hi: float) -> None:
        """A cell holding one value, a list or a range -> min and max fields."""
        values, notes = parse_list(self.cells.get(column, ""))
        self.problems.extend(f"{column}: {n}" for n in notes)
        kept = [v for v in (check_range(field_min, x * scale, lo, hi, self.problems) for x in values) if v is not None]
        if kept:
            self.data[field_min], self.data[field_max] = min(kept), max(kept)
            self.sources[field_min] = self.sources[field_max] = column

    def keep_other(self, *columns: str) -> None:
        for column in columns:
            value = (self.cells.get(column) or "").strip()
            if value:
                self.other[column] = value

    def note(self, problem: str) -> None:
        self.problems.append(problem)

    def done(self) -> dict:
        self.data["raw"] = json.dumps(self.cells, ensure_ascii=False, sort_keys=True)
        self.data["other"] = json.dumps(self.other, ensure_ascii=False, sort_keys=True)
        self.data["field_sources"] = json.dumps(self.sources, ensure_ascii=False, sort_keys=True)
        self.data["problems"] = "; ".join(self.problems) or None
        return self.data


def _gas_fractions(row: _Row, columns: dict[str, str]) -> None:
    """Diluent = the non-O2 gases whose mole fraction is above zero, joined with '+'."""
    names = []
    for gas, column in columns.items():
        value, _ = parse_number(row.cells.get(column, ""))
        if value:
            names.append(gas)
    row.data["diluent"] = "+".join(names) or None
    if names:
        row.sources["diluent"] = ", ".join(columns[g] for g in names)


def bass2(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    fuel = row.text("fuel", "Fuel Sample Material")
    if fuel is None and not cells.get("Test #", "").strip():
        return None
    row.data["phase"] = "solid"
    lowered = (fuel or "").lower()
    row.data["geometry"] = ("rod" if "rod" in lowered else "film" if "film" in lowered
                            else "fabric" if "sibal" in lowered else None)
    o2 = row.number("o2_pct_min", "Calibrated initial O2 % by vol", 1.0, *O2_RANGE)
    row.data["o2_pct_max"] = o2
    if o2 is not None:
        row.sources["o2_pct_max"] = "Calibrated initial O2 % by vol"
    row.note("pressure not in table")
    row.keep_other("Flow restrictor", "Fan display", "Air display", "Calibrated final O2 % by vol",
                   "Initial CO2 % by vol", "Final CO2 % by vol", "Initial CO (ppm)", "Final CO (ppm)")
    return row.done()


def flex(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    fuel = row.text("fuel", "Fuel")
    if fuel is None and not cells.get("FLEX Test #", "").strip():
        return None
    row.data["phase"] = row.data["geometry"] = "droplet"
    o2_column = "O initial ambient composition; mole fraction"
    o2 = row.number("o2_pct_min", o2_column, 100.0, *O2_RANGE)
    row.data["o2_pct_max"] = o2
    if o2 is not None:
        row.sources["o2_pct_max"] = o2_column
    pressure = row.number("pressure_atm_min", "Ambient pressure; mmHg", 1 / MMHG_PER_ATM, *PRESSURE_RANGE_ATM)
    row.data["pressure_atm_max"] = pressure
    if pressure is not None:
        row.sources["pressure_atm_max"] = "Ambient pressure; mmHg"
    _gas_fractions(row, {"N2": "N initial ambient composition; mole fraction",
                         "CO2": "CO initial ambient composition; mole fraction",
                         "He": "He initial ambient composition; mole fraction"})
    outcome = row.text("outcome", "Test end")
    row.data["outcome"] = outcome.lower() if outcome else None
    row.keep_other("Droplet initial diameter; mm", "Visible flame extinction diameter; mm",
                   "Burning rate; mm", "Burn time; s")
    return row.done()


MAPPERS: dict[str, Mapper] = {
    "PSI-25_Experimental table_BASS-II.csv": bass2,
    "PSI-69_Experimental table_FLEX.csv": flex,
}
