"""The snapshot contract: the columns of every table in data/snapshot/.

This module is the single source of truth. build_snapshot writes these columns in
this order, query.py loads them by name and casts them to these types, and
data/snapshot/catalog.md is generated from these lists. The database owner's
export must provide the same column names (order and extra columns do not matter).
"""
from typing import NamedTuple


class Column(NamedTuple):
    name: str
    sql_type: str
    unit: str
    meaning: str


TESTS: list[Column] = [
    Column("test_id", "VARCHAR", "", "Unique id: investigation, table index and row, e.g. PSI-25-T0-R1"),
    Column("investigation", "VARCHAR", "", "PSI investigation id, e.g. PSI-25"),
    Column("source_table", "VARCHAR", "", "Original PSI CSV file name the row comes from"),
    Column("source_row", "INTEGER", "", "Row in that CSV; the first data row after the header is 1"),
    Column("fuel", "VARCHAR", "", "Fuel or sample material, as written in the source table (whitespace collapsed)"),
    Column("phase", "VARCHAR", "", "solid, droplet, gas or smoke"),
    Column("geometry", "VARCHAR", "", "Sample or burner geometry when the table states it (rod, film, fabric, droplet, burner); else empty"),
    Column("o2_pct_min", "DOUBLE", "% O2", "Lowest oxygen level of the row, percent by volume or mole (treated as equal)"),
    Column("o2_pct_max", "DOUBLE", "% O2", "Highest oxygen level of the row; equals o2_pct_min when the row has one value"),
    Column("pressure_atm_min", "DOUBLE", "atm", "Lowest ambient pressure of the row"),
    Column("pressure_atm_max", "DOUBLE", "atm", "Highest ambient pressure of the row"),
    Column("flow_cm_s", "DOUBLE", "cm/s", "Air or inlet flow velocity, when the table gives one value"),
    Column("diluent", "VARCHAR", "", "Gases other than O2 (e.g. N2, N2+CO2, He), or the table's own mixture text"),
    Column("gravity", "VARCHAR", "", "microgravity or earth"),
    Column("outcome", "VARCHAR", "", "Result of the test as the table states it (e.g. extinction), lowercased; empty if none"),
    Column("other", "VARCHAR", "", "JSON object: other measured or controlled values, keyed by original column name"),
    Column("raw", "VARCHAR", "", "JSON object: every original cell of the row, keyed by original column name"),
    Column("field_sources", "VARCHAR", "", "JSON object: normalized field name -> original column name it was read from"),
    Column("problems", "VARCHAR", "", "Cleaning notes for this row, joined with '; '"),
    Column("scope", "VARCHAR", "", "psi for NASA data; user:<name> for a user's dataset"),
]

INVESTIGATIONS: list[Column] = [
    Column("id", "VARCHAR", "", "PSI investigation id, e.g. PSI-25"),
    Column("acronym", "VARCHAR", "", "PSI acronym; empty for most ground studies"),
    Column("label", "VARCHAR", "", "Short display name: the acronym, or the title when there is no acronym"),
    Column("title", "VARCHAR", "", "PSI title"),
    Column("doi", "VARCHAR", "", "DOI of the PSI dataset; cite it with every result"),
    Column("type", "VARCHAR", "", "flight (microgravity investigation) or ground"),
    Column("subarea", "VARCHAR", "", "PSI subResearchArea"),
    Column("platform", "VARCHAR", "", "PSI flightProgram, e.g. International Space Station (ISS)"),
    Column("hardware", "VARCHAR", "", "PSI experimentHardware"),
    Column("tier", "INTEGER", "", "Relevance tier from _config/tiers.md (1 direct, 2 supporting)"),
    Column("tier_reason", "VARCHAR", "", "Why this tier, from _config/tiers.md"),
    Column("boost_environments", "VARCHAR", "", "Comma-separated environments where the tier is raised to 1"),
    Column("pillar", "VARCHAR", "", "prevention, detection or suppression (Investigator); empty until reviewed"),
    Column("environments", "VARCHAR", "", "Comma-separated environments the investigation informs (Investigator)"),
    Column("summary_student", "VARCHAR", "", "Plain-language summary (Investigator)"),
    Column("summary_professional", "VARCHAR", "", "Technical summary (Investigator)"),
    Column("scope", "VARCHAR", "", "psi for NASA data; user:<name> for a user's dataset"),
]

RELATIONS: list[Column] = [
    Column("from_id", "VARCHAR", "", "Investigation id at one end"),
    Column("to_id", "VARCHAR", "", "Investigation id at the other end"),
    Column("type", "VARCHAR", "", "related_in_psi, reuses_flight_data, same_hardware or same_fuel"),
    Column("source", "VARCHAR", "", "Where the connection comes from (a PSI field, or tests.fuel)"),
    Column("scope", "VARCHAR", "", "psi for NASA data; user:<name> for a user's dataset"),
]

TABLES: dict[str, list[Column]] = {"tests": TESTS, "investigations": INVESTIGATIONS, "relations": RELATIONS}


def names(table: list[Column]) -> list[str]:
    return [column.name for column in table]
