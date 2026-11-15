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
        row.sources["diluent"] = contract.SOURCE_SEPARATOR.join(columns[g] for g in names)


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


# --- Tables added by the database owner (stage 02) -------------------------------

def _solid_geometry(fuel: str | None) -> str | None:
    """Geometry words the BASS / Saffire tables write inside the material text."""
    lowered = (fuel or "").lower()
    for word, geometry in (("sphere", "sphere"), ("rod", "rod"), ("film", "film"), ("slab", "slab"),
                           ("sheet", "sheet"), ("candle", "candle"), ("fabric", "fabric"),
                           ("sibal", "fabric"), ("nomex", "fabric")):
        if word in lowered:
            return geometry
    return None


def _not_in_table(row: _Row, *fields: str) -> None:
    for field in fields:
        row.note(f"{field} not in table")


def _flame_design_pressure(row: _Row) -> None:
    """Mean chamber pressure; when that cell is empty, the initial pressure (they differ by about 0.5%
    in the rows that have both), as the Auditor reads it next to the initial O2."""
    if (row.cells.get("pmean (atm)") or "").strip():
        row.number("pressure_atm_min", "pmean (atm)", 1.0, *PRESSURE_RANGE_ATM)
    elif row.number("pressure_atm_min", "pinit (atm)", 1.0, *PRESSURE_RANGE_ATM) is not None:
        row.note("pmean (atm) empty: pressure is pinit (atm)")
    _one_value_range(row, "pressure_atm_min", "pressure_atm_max")


def flame_design_normal(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Fuel"), cells, "Test"):
        return None
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    row.number("o2_pct_min", "XO2 (init)", 100.0, *O2_RANGE)
    _one_value_range(row, "o2_pct_min", "o2_pct_max")
    _flame_design_pressure(row)
    row.keep_other("Flame Type", "Day", "Test", "Xfuel", "mfuel (mg/s)", "mN2 (mg/s)", "mtot (mg/s)",
                   "XO2 (final)", "pinit (atm)", "pfinal (atm)", "mean Zst", "Tad (K)")
    if any((cells.get(c) or "").strip().upper() == "RAMPED" for c in cells):
        row.note("some cells say RAMPED: the value changed during the test")
    return row.done()


def flame_design_inverse(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if not (cells.get("Test") or "").strip():
        return None
    # The table has no Fuel column; its headers (XC2H4 initial/final) name the chamber fuel.
    row.data["fuel"] = "C2H4"
    row.sources["fuel"] = "XC2H4 initial"
    row.note("fuel read from the column header XC2H4 (the table has no Fuel column)")
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    row.number("o2_pct_min", "XO2", 100.0, *O2_RANGE)
    _one_value_range(row, "o2_pct_min", "o2_pct_max")
    row.note("inverse flame: O2 is the burner stream, not the chamber")
    _flame_design_pressure(row)
    row.keep_other("Flame Type", "Day", "Test", "mO2 (mg/s)", "mN2 (mg/s)", "mtot (mg/s)", "XC2H4 initial",
                   "XC2H4 final", "pinit (atm)", "pfinal (atm)", "mean Zst", "Tad (K)")
    return row.done()


def spice(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Fuel"), cells, "GMT ignition"):
        return None
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    row.number("flow_cm_s", "Air Rate (cm/s)", 1.0, *FLOW_RANGE_CM_S)
    _not_in_table(row, "O2", "pressure")
    row.keep_other("GMT date", "GMT ignition", "GMT Flame Off", "Nozzle (mm)", "Fuel Rate (sccm)",
                   "Fuel Rate (mg/s)", "HC Fuel Rate (mg/s)")
    return row.done()


def slice_(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Fuel Type"), cells, "Test Date"):
        return None
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    _not_in_table(row, "O2", "pressure")
    row.note("test-day row: conditions of several tests")
    row.keep_other("Test Date")
    return row.done()


def _acme_test_day(investigation: str, source_row: int, cells: dict[str, str], day_column: str,
                   other: tuple[str, ...], extra_note: str | None = None) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if not (cells.get(day_column) or "").strip():
        return None  # rows that only continue the Notes column
    row.text("fuel", "Fuel Bottle")
    row.data["phase"], row.data["geometry"] = "gas", "burner"
    _not_in_table(row, "O2", "pressure")
    row.note("test-day row: conditions of several tests")
    if extra_note:
        row.note(extra_note)
    row.keep_other(*other)
    return row.done()


def cld(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _acme_test_day(investigation, source_row, cells, "Test Day",
                          ("Test Type", "Test Day", "Fuel MFC", "N2 MFC", "Fuel conc. Range",
                           "Flames ignited", "Notes"))


def efield(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _acme_test_day(investigation, source_row, cells, "Test Day",
                          ("Test Type", "Test Day", "Year", "Month", "Date", "Mesh Polarity",
                           "Fuel Conc", "Flames Ignited", "Notes"))


def s_flame(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _acme_test_day(investigation, source_row, cells, "Test Day*",
                          ("Test Type", "Test Day*", "Year", "Month", "Date", "Atmosphere*",
                           "Flames Ignited*", "Notes"),
                          "atmosphere given only as text in 'Atmosphere*' (about 21% O2 and 1 atm per the table note)")


def bass(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    fuel = row.text("fuel", "Fuel Sample Material")
    if _skip(fuel, cells, "As Run Test #"):
        return None
    row.data["phase"] = "solid"
    row.data["geometry"] = _solid_geometry(fuel)
    if fuel and "soot cleaning" in fuel.lower():
        row.note("maintenance run (soot cleaning), not a burn")
    _not_in_table(row, "O2", "pressure")
    row.keep_other("Date", "GMT", "As Run Test #", "Test #", "Sample #")
    return row.done()


def _saffire_large(investigation: str, source_row: int, cells: dict[str, str], flow_column: str,
                   o2_column: str | None, other: tuple[str, ...]) -> dict | None:
    if not re.match(r"^S\d+$", (cells.get("Sample Number") or "").strip()):
        return None  # pre-test flow-visualization rows (F1C1 ...) and blank lines
    row = _Row(investigation, source_row, cells)
    fuel = row.text("fuel", "Material")
    row.data["phase"] = "solid"
    row.data["geometry"] = _solid_geometry(fuel)
    if o2_column:
        row.number_range("o2_pct_min", "o2_pct_max", o2_column, 1.0, *O2_RANGE)
    else:
        row.note("O2 not in table")
    row.number("flow_cm_s", flow_column, 1.0, *FLOW_RANGE_CM_S)
    row.note("pressure not in table")
    row.keep_other(*other)
    return row.done()


def saffire1(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _saffire_large(investigation, source_row, cells, "Air Flow (cm/s)", "Percent O2",
                          ("Sample Thickness (cm)", "Sample Length (cm)", "Sample Width (cm)",
                           "Ignition Power (W)", "Ignition Time (s)", "Burn Time (s)", "Flow Direction"))


def saffire3(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    return _saffire_large(investigation, source_row, cells, "Air Flow", None,
                          ("Sample Thickness", "Sample Length", "Sample Width", "Direction"))


def same(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    material = row.text("fuel", "Sample Material")
    if _skip(material, cells, "Sample #"):
        return None
    if material and ":" in material:
        # Rows 5-8 read e.g. "Kapton: same conditions as 1-4". The conditions are not copied.
        name, remark = material.split(":", 1)
        row.data["fuel"] = name.strip()
        row.note(f"table says '{remark.strip()}'; those values are not copied into this row")
    row.data["phase"] = "smoke"
    row.number("flow_cm_s", "Air Flow (cm/s)", 1.0, *FLOW_RANGE_CM_S)
    _not_in_table(row, "O2", "pressure")
    row.keep_other("Sample #", "Weight loss rate (mg/min)", "Aging Duration (minutes)")
    return row.done()


def daft(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    row = _Row(investigation, source_row, cells)
    if _skip(row.text("fuel", "Sample Material"), cells, "Session Name"):
        return None
    row.note("dust aerosol for an instrument test, no combustion: phase left empty")
    _not_in_table(row, "O2", "pressure")
    row.keep_other("Session Name", "Actual Day", "Hardware Description", "Sampled Location")
    return row.done()


def figure_index(investigation: str, source_row: int, cells: dict[str, str]) -> dict | None:
    """PSI-142's table lists figures of a publication, not tests: no row enters tests."""
    return None


MAPPERS.update({
    "PSI-10_Experimental table_Flame Design_Normal Flame.csv": flame_design_normal,
    "PSI-10_Experimental table_Flame Design_Inverse Flame.csv": flame_design_inverse,
    "PSI-107_Experimental table_Spice.csv": spice,
    "PSI-106_Experimental table_Slice.csv": slice_,
    "PSI-21_Experimental table_CLD Flame.csv": cld,
    "PSI-22_Experimental table_ACME E-FIELD Flames.csv": efield,
    "PSI-23_Experimental table_ACME s-Flame.csv": s_flame,
    "PSI-26_Experimental table_BASS.csv": bass,
    "PSI-98_Experimental table_SAFFIRE-1.csv": saffire1,
    "PSI-100_Experimental table_SAFFIRE-3.csv": saffire3,
    "PSI-102_Experimental table_SAME.csv": same,
    "PSI-47_Experimental table_DAFT.csv": daft,
    "PSI-142_Experimental table_Data Summary Table.csv": figure_index,
})
