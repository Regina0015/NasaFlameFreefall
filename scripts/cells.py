"""Read PSI CSV tables and parse their messy cells.

PSI tables mix numbers with units ("20 cm/s"), approximations ("~ 21.5"),
lists ("0.17; 0.21;0.25; 0.3") and ranges ("1.5 - 5"). Parsers never guess:
they return the value(s) they can read plus notes describing anything unusual.
"""
import csv
import io
import re
from pathlib import Path

EMPTY_MARKERS = {"", "n/a", "na", "none", "-", "--", "null", "nan"}
_NUMBER = re.compile(r"^[-+]?(?:\d+\.?\d*|\.\d+)")
_RANGE = re.compile(r"^\s*(\d+\.?\d*|\.\d+)\s*(?:[-–]|to)\s*(\d+\.?\d*|\.\d+)\s*([^\d\s].*)?$")


def normalize_header(header: str) -> str:
    """Collapse repeated whitespace to one space and strip the ends."""
    return " ".join(header.split())


def _decode(data: bytes) -> str:
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252", errors="replace")


def read_table(path: Path) -> list[tuple[int, dict[str, str]]]:
    """Return (source_row, cells) pairs. source_row 1 is the first data row.

    Rows whose cells are all empty are left out, but keep their numbering.
    Keys are normalized headers; empty or repeated headers get a unique name.
    """
    text = _decode(Path(path).read_bytes())
    rows = list(csv.reader(io.StringIO(text, newline="")))
    if not rows:
        return []
    headers: list[str] = []
    for index, raw in enumerate(rows[0]):
        name = normalize_header(raw) or f"column_{index + 1}"
        base, n = name, 2
        while name in headers:
            name = f"{base} ({n})"
            n += 1
        headers.append(name)
    result = []
    for source_row, cells in enumerate(rows[1:], start=1):
        if all(not c.strip() for c in cells):
            continue
        padded = cells + [""] * (len(headers) - len(cells))
        result.append((source_row, dict(zip(headers, padded))))
    return result


def parse_number(cell: str) -> tuple[float | None, list[str]]:
    """Read one number at the start of a cell; trailing unit text is ignored."""
    text = (cell or "").strip()
    if text.lower() in EMPTY_MARKERS:
        return None, []
    notes: list[str] = []
    if text.startswith("~"):
        text = text[1:].strip()
        notes.append("approximate value (~)")
    match = _NUMBER.match(text)
    if not match:
        return None, [f"not a number: '{cell.strip()}'"]
    rest = text[match.end():].strip()
    if any(ch.isdigit() for ch in rest):
        return None, [f"not a single number: '{cell.strip()}'"]
    return float(match.group(0)), notes


def parse_list(cell: str) -> tuple[list[float], list[str]]:
    """Read a list ("a; b; or c") or a range ("a - b", "a to b") of numbers."""
    text = (cell or "").strip()
    if text.lower() in EMPTY_MARKERS:
        return [], []
    range_match = _RANGE.match(text)
    if range_match:
        return [float(range_match.group(1)), float(range_match.group(2))], [f"range cell: '{text}'"]
    values: list[float] = []
    notes: list[str] = []
    for part in re.split(r";|\bor\b", text):
        part = part.strip()
        if not part:
            continue
        value, part_notes = parse_number(part)
        notes.extend(part_notes)
        if value is not None:
            values.append(value)
    return values, notes
