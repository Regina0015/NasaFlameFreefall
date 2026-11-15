"""Find the numbers a text states, so they can be checked against computed values.

Numbers that are part of identifiers are not counted: PSI ids (PSI-25), finding
ids (F-001), acronyms with numbers (FLEX-2), DOIs, chemical formulas (O2, CO2,
C2H4) and gravity levels written as 1 g / 1-g.
"""
import re

_IDENTIFIERS = [
    re.compile(r"\b10\.\d{4,9}/\S+"),                       # DOIs
    re.compile(r"\b[A-Za-z]+-\d+(?:-[A-Za-z]\d+)*\b"),      # PSI-25, F-001, FLEX-2, PSI-25-T0-R1
    re.compile(r"\b1\s?-?\s?g\b"),                          # 1 g, 1-g, 1g
    re.compile(r"\b[A-Za-z]\w*\d\w*\b"),                     # O2, CO2, C2H4, C12H26, B1 (start with a letter)
]
# Sign (only after a space, a bracket or the start), digits or .5, optional exponent. A unit
# glued after the number (45pct, 101kPa) does not hide it.
_NUMBER = re.compile(r"(?<![\w.])([-−]?)((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)([eE][+-]?\d+)?")


def canonical(value: float | int | str) -> str:
    """One spelling per number: 12.0 -> '12', 0.30 -> '0.3', '1,015' -> '1015'."""
    if isinstance(value, str):
        value = float(value.replace(",", ""))
    return f"{float(value):.10g}"


def numbers_in(text: str) -> list[str]:
    """Canonical numbers stated in the text, in reading order."""
    cleaned = text or ""
    for pattern in _IDENTIFIERS:
        cleaned = pattern.sub(" ", cleaned)
    return [canonical(("-" if m.group(1) else "") + m.group(2) + (m.group(3) or "")) for m in _NUMBER.finditer(cleaned)]


def collect(obj) -> set[str]:
    """Canonical numbers found anywhere in a nested JSON value (numbers and strings)."""
    found: set[str] = set()
    if isinstance(obj, bool) or obj is None:
        return found
    if isinstance(obj, (int, float)):
        found.add(canonical(obj))
    elif isinstance(obj, str):
        found.update(numbers_in(obj))
    elif isinstance(obj, dict):
        for value in obj.values():
            found |= collect(value)
    elif isinstance(obj, (list, tuple)):
        for value in obj:
            found |= collect(value)
    return found
