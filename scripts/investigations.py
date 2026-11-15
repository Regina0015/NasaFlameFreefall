"""Investigation facts, the team's tiers, and the relations PSI states.

Everything here is deterministic: facts are copied from the PSI record, tiers
come from _config/tiers.md, and every relation says where it comes from.
The Investigator agent adds only summaries, pillar and environments (Task 7).
"""
import itertools
import json
import re
from pathlib import Path

from scripts.mdtable import parse_table

HARDWARE_KEYWORDS = {
    "MSG": "microgravity science glovebox",
    "CIR": "combustion integrated rack",
    "ACME": "acme",
    "MDCA": "droplet combustion ap",
    "Saffire": "saffire",
}

FUEL_KEYWORDS = {
    "pmma": r"\bpmma\b",
    "methanol": r"\bmethanol\b",
    "heptane": r"\bheptane\b",
    "ethylene": r"\b(ethylene|c2h4)\b",
    "methane": r"\b(methane|ch4)\b",
    "ethane": r"\bethane\b",
    "kapton": r"\bkapton\b",
    "silicone": r"\bsilicone\b",
    "sibal": r"\bsibal\b",
    "dodecane": r"\b(dodecane|c12h26)\b",
    "isooctane": r"\biso-?octane\b",
}


def _number(investigation: str) -> int:
    return int(investigation.split("-")[1])


def _clean(value: str | None) -> str:
    return " ".join((value or "").split())


def facts(record: dict) -> dict:
    """The investigation columns that come straight from the PSI record."""
    acronym = _clean(record.get("investigationAcronym"))
    title = _clean(record.get("title"))
    return {
        "id": record["accession"],
        "acronym": acronym,
        "label": acronym or title,
        "title": title,
        "doi": _clean(record.get("doi")),
        "type": "flight" if record.get("projectType") == "Microgravity Investigation" else "ground",
        "subarea": _clean(record.get("subResearchArea")),
        "platform": _clean(record.get("flightProgram")),
        "hardware": _clean(record.get("experimentHardware")),
        "scope": "psi",
    }


def load_tiers(path: Path) -> dict[str, dict]:
    rows = parse_table(Path(path).read_text(encoding="utf-8"), "Tier table")
    return {
        row["investigation"]: {
            "tier": int(row["tier"]) if row["tier"] else None,
            "reason": row["reason"],
            "boost": [b.strip() for b in row["boost"].split(",") if b.strip()],
        }
        for row in rows
    }


def reviewed_fields(record: dict) -> dict:
    """The investigations columns an Investigator record fills (the rest are copied from PSI)."""
    return {"pillar": record["pillar"]["value"],
            "environments": ",".join(e["environment"] for e in record["environments"]) or None,
            "summary_student": record["summary_student"]["text"],
            "summary_professional": record["summary_professional"]["text"]}


def load_investigator_records(directory: Path) -> dict[str, dict]:
    """Investigator records (stages/03_investigar/output/investigations/*.json); empty if none."""
    folder = Path(directory) / "investigations"
    if not folder.is_dir():
        return {}
    return {p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("PSI-*.json"))}


def _pair(a: str, b: str) -> tuple[str, str]:
    return (a, b) if _number(a) <= _number(b) else (b, a)


def _edge(from_id: str, to_id: str, kind: str, source: str) -> dict:
    return {"from_id": from_id, "to_id": to_id, "type": kind, "source": source, "scope": "psi"}


def derive_relations(records: list[dict], tests: list[dict]) -> list[dict]:
    by_id = {r["accession"]: r for r in records}
    kind_of = {i: facts(r)["type"] for i, r in by_id.items()}
    edges: dict[tuple, dict] = {}

    for rid, record in by_id.items():
        for other in (o.strip() for o in (record.get("related_glds") or "").split(",")):
            if other not in by_id or other == rid:
                continue
            if {kind_of[rid], kind_of[other]} == {"ground", "flight"}:
                ground, flight = (rid, other) if kind_of[rid] == "ground" else (other, rid)
                edges[(ground, flight, "reuses_flight_data")] = _edge(
                    ground, flight, "reuses_flight_data", "related_glds + projectType")
            else:
                a, b = _pair(rid, other)
                edges[(a, b, "related_in_psi")] = _edge(a, b, "related_in_psi", "related_glds")

    hardware = {i: {k for k, phrase in HARDWARE_KEYWORDS.items() if phrase in (r.get("experimentHardware") or "").lower()}
                for i, r in by_id.items()}
    fuels: dict[str, set[str]] = {i: set() for i in by_id}
    for test in tests:
        inv = test.get("investigation")
        if inv in fuels:
            text = (test.get("fuel") or "").lower()
            fuels[inv] |= {k for k, pattern in FUEL_KEYWORDS.items() if re.search(pattern, text)}

    for a, b in itertools.combinations(sorted(by_id, key=_number), 2):
        shared_hw = sorted(hardware[a] & hardware[b])
        if shared_hw:
            edges[(a, b, "same_hardware")] = _edge(a, b, "same_hardware", "experimentHardware: " + ", ".join(shared_hw))
        shared_fuel = sorted(fuels[a] & fuels[b])
        if shared_fuel:
            edges[(a, b, "same_fuel")] = _edge(a, b, "same_fuel", "tests.fuel: " + ", ".join(shared_fuel))

    return sorted(edges.values(), key=lambda e: (e["type"], _number(e["from_id"]), _number(e["to_id"])))
