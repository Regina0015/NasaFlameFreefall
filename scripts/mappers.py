"""One mapper per PSI test table: original cells -> one row of the tests contract.

A mapper is called as mapper(investigation_id, source_row, cells) and returns a
dict with every column of contract.TESTS except test_id and source_table (the
builder fills those), or None to skip the row. Mappers never guess a value: what
they cannot read stays empty and is described in `problems`.
"""
import json
import re
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


def _skip(fuel: str | None, cells: dict[str, str], id_column: str) -> bool:
    """Footnotes and blank lines: no fuel and no test identifier."""
    return fuel is None and not (cells.get(id_column) or "").strip()


def _one_value_range(row: _Row, field_min: str, field_max: str) -> None:
    """Copy a single-value field into its max twin (min = max)."""
    row.data[field_max] = row.data[field_min]
    if field_min in row.sources:
        row.sources[field_max] = row.sources[field_min]


def saffire2(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    if not re.match(r"^\d+-\d+$", (cells.get("Sample Number") or "").strip()):
        return None  # footnote rows ("Note 1 ...") and blank lines
    row = _Row(investigation, source_row, cells)
    if row.text("fuel", "Material") is None:
        row.note("material cell empty (possibly a merged cell in the source)")
    row.data["phase"] = "solid"
    row.number_range("o2_pct_min", "o2_pct_max", "Percent O2 (Note 1)", 1.0, *O2_RANGE)
    row.note("O2 derived from measured CO2 production (table Note 1)")
    row.number("flow_cm_s", "Air Flow (cm/s)", 1.0, *FLOW_RANGE_CM_S)
    row.note("pressure not in table")
    row.keep_other("Samle Thickness", "Sample Length", "Sample Width (cm)", "Ignition Power (W)",
                   "Ignition Time (s)", "Burn Time (s)", "Flow Direction", "?-g Burn Length",
                   "?-g Spread Length", "1-g Burn Length", "1-g Spread Rate")
    return row.done()


def flex2(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if row.text("fuel", "Sample (Fuel Type)") is None:
        return None
    row.data["phase"] = row.data["geometry"] = "droplet"
    row.number_range("o2_pct_min", "o2_pct_max", "Oxygen Mole Fraction", 100.0, *O2_RANGE)
    row.number_range("pressure_atm_min", "pressure_atm_max", "Ambient Pressure (atm)", 1.0, *PRESSURE_RANGE_ATM)
    row.text("diluent", "Ambient Gas Mixture")
    row.keep_other("Initial Droplet Diameter (mm)", "Ambient Temperature (C)", "Flow Velocity (cm/s)")
    row.note("condition matrix row: lists tested values, not one test")
    return row.done()


def cfi(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Fuel"), cells, "Flex Number"):
        return None
    row.data["phase"] = row.data["geometry"] = "droplet"
    row.number("o2_pct_min", "Oxygen", 100.0, *O2_RANGE)
    _one_value_range(row, "o2_pct_min", "o2_pct_max")
    row.number("pressure_atm_min", "Pressure", 1.0, *PRESSURE_RANGE_ATM)
    _one_value_range(row, "pressure_atm_min", "pressure_atm_max")
    _gas_fractions(row, {"N2": "Nitrogen", "He": "Helium"})
    row.keep_other("Flex Number", "CIR", "Fiber")
    return row.done()


def _cfig(investigation: str, source_row: int, cells: dict[str, str], o2_column: str,
          outcome_column: str, other: tuple[str, ...], note: str | None) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Fuel"), cells, "Test"):
        return None
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    row.number("o2_pct_min", o2_column, 100.0, *O2_RANGE)
    _one_value_range(row, "o2_pct_min", "o2_pct_max")
    row.number("pressure_atm_min", "approx p (bar)", ATM_PER_BAR, *PRESSURE_RANGE_ATM)
    _one_value_range(row, "pressure_atm_min", "pressure_atm_max")
    outcome = row.text("outcome", outcome_column)
    row.data["outcome"] = outcome.lower() if outcome else None
    row.keep_other(*other)
    if note:
        row.note(note)
    return row.done()


def cfig_normal(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _cfig(investigation, source_row, cells, "XO2 before test", "Self-ext or flow term",
                 ("Flame Type", "Day", "Test", "Cool flame?", "XO2 after test", "Xf", "mHC (mg/s)", "TFP",
                  "Tad (K)", "Zst", "Hot ignition", "burn time (sec)", "Peak burner T (C )", "Comments"), None)


def cfig_inverse(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _cfig(investigation, source_row, cells, "XO2", "Self -ext or flow term",
                 ("Flame Type", "Day", "Test", "Xf before test", "Xf after test", "HC burnrate (mg/s)",
                  "O2 flow rate (mg/s)", "TFP", "Tad (K)", "Zst", "Hot ignition", "burn time (sec)",
                  "Peak burner Temp (C)", "Peak burner temp (K)", "Color", "Comments"),
                 "inverse flame: O2 is the burner stream, not the chamber")


def bre(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Fuel Bottle"), cells, "Date"):
        return None
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    row.number_range("o2_pct_min", "o2_pct_max", "Oxygen Conc (percent)", 1.0, *O2_RANGE)
    row.note("pressure varied, not in table")
    row.note("test-day row: conditions of several tests")
    row.keep_other("Year", "Month", "Date", "Burner Size (mm)", "Flames Ignited", "Notes")
    return row.done()


def same_r(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Sample Type"), cells, "SAME Test #"):
        return None
    row.data["phase"] = "smoke"
    row.note("O2 not in table")
    row.note("pressure not in table")
    row.number("flow_cm_s", "Inlet velocity (cm/s)", 1.0, *FLOW_RANGE_CM_S)
    row.keep_other("SAME Test #", "Description", "Date", "Rt/R0", "Duration (sec)",
                   "Primary aging time (sec)", "Primary mixing time (sec)", "Net aging time (sec)")
    return row.done()


MAPPERS.update({
    "PSI-99_Experimental table_SAFFIRE-2.csv": saffire2,
    "PSI-68_Experimental table_Flex2.csv": flex2,
    "PSI-39_Experimental table_CFI.csv": cfi,
    "PSI-159_Experimental table_CFI-G_Normal Flames.csv": cfig_normal,
    "PSI-159_Experimental table_CFI-G_Inverse Flames.csv": cfig_inverse,
    "PSI-20_Experimental table_ACME BRE.csv": bre,
    "PSI-101_Experimental table_SAME-R.csv": same_r,
})
