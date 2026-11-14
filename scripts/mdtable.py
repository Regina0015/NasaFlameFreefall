"""Parse a markdown table that sits under a given `## heading`."""


def _cells(line: str) -> list[str]:
    inner = line.strip()
    if inner.startswith("|"):
        inner = inner[1:]
    if inner.endswith("|"):
        inner = inner[:-1]
    return [c.strip() for c in inner.split("|")]


def parse_table(text: str, heading: str) -> list[dict[str, str]]:
    """Rows of the first table under `## heading`, as dicts keyed by the header cells."""
    lines = text.splitlines()
    try:
        start = next(i for i, line in enumerate(lines) if line.strip() == f"## {heading}")
    except StopIteration:
        raise ValueError(f"heading not found: ## {heading}") from None
    i = start + 1
    while i < len(lines) and not lines[i].strip().startswith("|"):
        if lines[i].startswith("## "):
            raise ValueError(f"no table under: ## {heading}")
        i += 1
    if i >= len(lines):
        raise ValueError(f"no table under: ## {heading}")
    header = _cells(lines[i])
    rows = []
    for line in lines[i + 2:]:
        if not line.strip().startswith("|"):
            break
        values = _cells(line)
        values += [""] * (len(header) - len(values))
        rows.append(dict(zip(header, values)))
    return rows
