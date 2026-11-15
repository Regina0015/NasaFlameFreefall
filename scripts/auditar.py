"""Etapa 05 — Auditor: comprueba cada hallazgo (finding) por un camino independiente
y le asigna un grado de confianza. No corrige nada: solo reporta.

Leer antes: stages/05_auditar/CONTEXT.md, _config/confidence.md y
stages/05_auditar/references/lista-revision.md.

Lee:
  stages/04_calcular/output/findings/F-XXX.json  (forma: schemas/finding.schema.json)
  stages/01_ingesta/output/psi/                   (CSV ORIGINALES de PSI, no los normalizados,
                                                   y las fichas PSI-XX.json: DOI, acrónimo y tablas)
  stages/01_ingesta/output/psi/manifest.csv       (opcional: nombre original del CSV -> archivo guardado)
Escribe:
  stages/05_auditar/output/audits/F-XXX.json     (forma: schemas/audit.schema.json)
  stages/05_auditar/output/summary.md

Independencia: este archivo NO importa nada de calculos.py, calcular.py ni
normalizar_tablas.py. Lee y convierte las celdas originales con su propio código.

El modelo local (Ollama) solo contesta Q3-Q7 de la revisión del texto (C8), en inglés.
Nunca elige el grado ni anula una comprobación de código.

Solo biblioteca estándar de Python (3.9 o más).

Uso:
  python3 scripts/auditar.py               # audita todo, con el modelo local
  python3 scripts/auditar.py --no-model    # sin modelo: C8 queda en 'fail' para revisión manual
  python3 scripts/auditar.py --only F-001
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS = ROOT / "schemas"
PSI_DIR = ROOT / "stages/01_ingesta/output/psi"  # etapa 01: CSV originales y fichas PSI-XX.json juntos
REFERENCES = ROOT / "stages/05_auditar/references"
COVERAGE_FILE = REFERENCES / "cobertura-tablas.json"   # fase, columna de O2 y de presión de cada tabla PSI
ENVIRONMENTS_MD = ROOT / "_config/environments.md"     # atmósfera de cada ambiente habitado
SNAPSHOT_DIR = ROOT / "data/snapshot"                  # tablas normalizadas del Calculador (para sql_query)
# Tipos de las columnas del snapshot que no son texto (copiados de scripts/contract.py, sin importarlo).
SNAPSHOT_TYPES = {
    "tests": {"source_row": "INTEGER", "o2_pct_min": "DOUBLE", "o2_pct_max": "DOUBLE",
              "pressure_atm_min": "DOUBLE", "pressure_atm_max": "DOUBLE", "flow_cm_s": "DOUBLE"},
    "investigations": {"tier": "INTEGER"},
}
SQL_COLUMNS = ("name", "value", "unit", "investigation", "source_table", "source_rows", "source_columns")
SQL_TIMEOUT_S = 30
SQL_MAX_ROWS = 10_000
HUMAN_SQL_QUESTION = ("Does the SQL in method.params answer the finding's question, and do its filters keep every "
                      "test they should (for example, rows with NULL are dropped by NOT IN)? The code only checks "
                      "that the numbers come from the data; a person must read the SQL.")
PRESSURE_TO_PSI = {"psi": 1.0, "atm": 14.6959, "bar": 14.5038, "kpa": 0.145038, "mmhg": 0.0193368, "torr": 0.0193368}

# --- Umbrales PROVISIONALES (ver _config/confidence.md; el equipo puede cambiarlos) ---
RECALC_REL_TOL = 1e-6      # C3: tolerancia relativa del recálculo. Los conteos deben ser exactos.
SUPPORT_BROAD_MIN = 30     # C5: pruebas mínimas para "soporte amplio".
QUALITY_MINOR_MIN = 0.90   # C7: fracción mínima de celdas legibles para "problemas menores".

# --- Modelo local (ver _config/models.md) ---
DEFAULT_MODEL = "gemma4:e4b-it-qat"
DEFAULT_OLLAMA_URL = "http://localhost:11434"
MODEL_OPTIONS = {"temperature": 0, "seed": 42, "num_ctx": 8192}
# "reason" va antes que "answer": Ollama genera los campos en este orden, así el modelo
# razona primero y decide después (con "answer" primero se contradecía).
ANSWER_SCHEMA = {
    "type": "object",
    "properties": {"reason": {"type": "string"}, "answer": {"enum": ["yes", "no"]}},
    "required": ["reason", "answer"],
}

CHECK_NAMES = {
    "C0": "format",
    "C1": "traceability",
    "C2": "fidelity",
    "C3": "recalculation",
    "C4": "units_and_ranges",
    "C5": "support",
    "C6": "tested_range",
    "C7": "data_quality",
    "C8": "faithful_text",
    "C9": "chart_consistency",
}
CHECK_DONE_BY = {c: "code" for c in CHECK_NAMES}
CHECK_DONE_BY["C8"] = "code+model"
HARD_CHECKS = ("C0", "C1", "C2", "C3", "C4", "C9")  # si una falla: rejected
TEXT_FIELDS = ("claim", "summary_student", "summary_professional")
PARTIAL_GRAVITY_ENVS = {"lunar_base", "mars_base"}

# Preguntas de C8 (texto en inglés porque el modelo trabaja en inglés).
CODE_QUESTIONS = [
    ("Q1", "Does every number in the text come from values, n_tests, method params, "
           "the cited rows or the recalculation?", "yes"),
    ("Q2", "Do the units of the numbers in the text (%) agree with the units of their sources?", "yes"),
]
MODEL_QUESTIONS_PER_FIELD = [
    ("Q3", "Does the TEXT name a fuel, material, experiment, investigation or test condition that does not "
           "appear in CITED INVESTIGATIONS, EVIDENCE, VALUES, ASSUMPTIONS or LIMITATIONS? "
           "Ignore numbers: they are checked separately.", "no"),
    ("Q4", "Is every statement in the TEXT limited to tests of the CITED INVESTIGATIONS? "
           "Answer yes if the text only talks about those investigations, for example 'none of the 129 BASS-II tests' "
           "or 'in these two investigations'. Answer no if it talks about a wider group, such as 'solid materials', "
           "'materials in space' or 'all PSI tests'.", "yes"),
    ("Q5", "Does the TEXT present a lack of tests as if it were a safety result "
           "(for example, calling something safe or unsafe because it was not tested)?", "no"),
    ("Q6", "Does the TEXT predict or describe how fire or combustion behaves under lunar or Martian gravity? "
           "Saying that there is no data for lunar or Martian gravity does not count.", "no"),
]
MODEL_QUESTION_ONCE = (
    "Q7", "Does at least one LIMITATIONS item name something specific that this finding does NOT let you "
          "conclude (for example an investigation, material, condition or environment it does not cover)? "
          "Saying where the data come from is not a limitation.", "yes",
)
SYSTEM_PROMPT = (
    "You are a strict fact-checking auditor for NASA microgravity combustion findings. "
    "You only see one finding and its evidence. Judge only what is written; do not use outside knowledge. "
    "First write one short sentence of reasoning, then answer the QUESTION with \"yes\" or \"no\", as JSON: "
    "{\"reason\": \"...\", \"answer\": \"yes\" | \"no\"}. The answer must agree with the reason."
)
RETRY_REMINDER = "Reply ONLY with JSON of the form {\"reason\": \"one sentence\", \"answer\": \"yes\" or \"no\"}."

COUNT_UNITS = {"tests", "test", "count", "rows", "days", "test days"}
POSITIVE_UNITS = {"atm", "psi", "kpa", "pa", "cm/s", "mm/s", "m/s", "mm", "cm", "m", "s", "ms",
                  "k", "ppm", "w", "kw", "g", "mg"}


# =============================================================================
# Validador mínimo de JSON Schema (solo lo que usan los esquemas del repo)
# =============================================================================

def _is_type(x, t: str) -> bool:
    if t == "null":
        return x is None
    if t == "boolean":
        return isinstance(x, bool)
    if t == "integer":
        return isinstance(x, int) and not isinstance(x, bool)
    if t == "number":
        return isinstance(x, (int, float)) and not isinstance(x, bool)
    if t == "string":
        return isinstance(x, str)
    if t == "array":
        return isinstance(x, list)
    if t == "object":
        return isinstance(x, dict)
    raise ValueError(f"unsupported schema type: {t}")


def _same(a, b) -> bool:
    # En Python True == 1; en JSON Schema no son iguales.
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    return a == b


def validate(instance, schema: dict, root: dict | None = None, path: str = "$") -> list[str]:
    """Devuelve la lista de errores (vacía si el documento cumple el esquema)."""
    root = schema if root is None else root
    if "$ref" in schema:
        node = root
        for part in schema["$ref"].removeprefix("#/").split("/"):
            node = node[part]
        return validate(instance, node, root, path)
    errors: list[str] = []
    if "oneOf" in schema:
        n = sum(1 for s in schema["oneOf"] if not validate(instance, s, root, path))
        if n != 1:
            errors.append(f"{path}: must match exactly one oneOf option (matches {n})")
    if "const" in schema and not _same(instance, schema["const"]):
        errors.append(f"{path}: must be {schema['const']!r}")
    if "enum" in schema and not any(_same(instance, e) for e in schema["enum"]):
        errors.append(f"{path}: {instance!r} is not one of {schema['enum']}")
    if "type" in schema:
        types = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        if not any(_is_type(instance, t) for t in types):
            return errors + [f"{path}: expected type {types}"]
    if isinstance(instance, dict):
        for k in schema.get("required", []):
            if k not in instance:
                errors.append(f"{path}: missing '{k}'")
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for k, v in instance.items():
            if k in props:
                errors += validate(v, props[k], root, f"{path}.{k}")
            elif extra is False:
                errors.append(f"{path}: field not allowed '{k}'")
            elif isinstance(extra, dict):
                errors += validate(v, extra, root, f"{path}.{k}")
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(f"{path}: needs at least {schema['minItems']} items")
        if schema.get("uniqueItems"):
            seen = [json.dumps(i, sort_keys=True) for i in instance]
            if len(seen) != len(set(seen)):
                errors.append(f"{path}: items must be unique")
        if "items" in schema:
            for i, v in enumerate(instance):
                errors += validate(v, schema["items"], root, f"{path}[{i}]")
    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errors.append(f"{path}: too short")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(f"{path}: does not match {schema['pattern']}")
    if _is_type(instance, "number"):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(f"{path}: below minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append(f"{path}: above maximum {schema['maximum']}")
        if "exclusiveMinimum" in schema and instance <= schema["exclusiveMinimum"]:
            errors.append(f"{path}: must be greater than {schema['exclusiveMinimum']}")
    return errors


def load_schema(name: str) -> dict:
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


# =============================================================================
# Lectura de los CSV originales (código propio, independiente de la etapa 02)
# =============================================================================

def norm_col(name: str) -> str:
    """Nombre de columna comparable: sin espacios repetidos ni al inicio o al final."""
    return " ".join(name.split())


_PLAIN_NUMBER = re.compile(r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$")


def parse_number(cell: str) -> float | None:
    """Solo acepta un número limpio. Rangos, texto, '~', 'none' o vacío -> None (ilegible)."""
    s = cell.strip()
    return float(s) if _PLAIN_NUMBER.match(s) else None


_NUM = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?"


def parse_o2_cell(cell: str) -> tuple[list[float], str]:
    """Lectura para cálculos de cobertura (o2_range), un poco más amplia que parse_number:
      '22.2'            -> [22.2], 'exact'
      '~ 22.1'          -> [22.1], 'imprecise'   (aproximado: Saffire-II)
      '22.1 to 22.0'    -> [22.1, 22.0], 'imprecise'   (también '21.5 - 21.7': Saffire-I)
      '21; 26.5; 40'    -> [21, 26.5, 40], 'imprecise'  (varios niveles en un día: BRE)
    Todo lo demás ('3400%', texto, vacío) -> [], 'unreadable'. Nunca corrige un dato."""
    s = cell.strip()
    x = parse_number(s)
    if x is not None:
        return [x], "exact"
    m = re.fullmatch(rf"~\s*({_NUM})", s)
    if m:
        return [float(m.group(1))], "imprecise"
    if ";" in s or re.search(r"\sto\s|\s-\s", s):
        parts = [p for p in re.split(r"\s*;\s*(?:or\s+)?|\s+to\s+|\s+-\s+", s) if p != ""]  # '2.0; or 3.0': FLEX-2
        vals = [parse_number(p) for p in parts]
        if len(vals) >= 2 and all(v is not None for v in vals):
            return vals, "imprecise"
    return [], "unreadable"


def load_units(path) -> dict[tuple[str, str], dict]:
    """Lee references/unidades-columnas.json: unidad de columnas cuyo encabezado no la dice.
    Clave: (nombre del CSV, nombre de columna normalizado)."""
    if not path or not Path(path).is_file():
        return {}
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    out = {}
    for table, cols in (data.get("tables") or {}).items():
        for col, entry in cols.items():
            out[(table, norm_col(col))] = entry
    return out


def column_unit(sources, table_name: str, header: str) -> tuple[str | None, str]:
    """Unidad de una columna de O2: 'percent' o 'fraction'. Primero el encabezado; si no la dice,
    el archivo de unidades aprobado por una persona. Devuelve (None, motivo) si no se sabe."""
    h = norm_col(header).lower()
    from_header = "percent" if ("%" in h or "percent" in h) else "fraction" if "fraction" in h else None
    entry = sources.units.get((table_name, norm_col(header))) if sources else None
    if entry and entry.get("unit") not in ("percent", "fraction"):
        return None, f"unidades-columnas.json gives an unknown unit for '{norm_col(header)}': {entry.get('unit')!r}"
    if entry and not str(entry.get("approved_by", "")).strip():
        return None, (f"unit of column '{norm_col(header)}' is proposed in unidades-columnas.json "
                      "but not approved yet (approved_by is empty)")
    if entry and from_header and entry["unit"] != from_header:
        return None, (f"column '{norm_col(header)}': the header says {from_header} but "
                      f"unidades-columnas.json says {entry['unit']}")
    if from_header:
        return from_header, ""
    if entry:
        return entry["unit"], ""
    return None, (f"cannot tell the unit of column '{norm_col(header)}'; add it to "
                  "stages/05_auditar/references/unidades-columnas.json for a person to approve")


@dataclass
class Table:
    path: Path
    encoding: str
    header: list[str]
    rows: list[list[str]]  # rows[0] es la fila 1 (la primera después del encabezado)

    def col_index(self, name: str) -> int | None:
        target = norm_col(name)
        hits = [i for i, h in enumerate(self.header) if norm_col(h) == target]
        return hits[0] if len(hits) == 1 else None

    def cell(self, row_number: int, col: int) -> str:
        r = self.rows[row_number - 1]
        return r[col] if col < len(r) else ""


def read_table(path: Path) -> Table:
    raw = path.read_bytes()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):  # FLEX (PSI-69) viene en Windows-1252
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    records = list(csv.reader(io.StringIO(text, newline="")))
    if not records:
        raise ValueError("empty CSV")
    return Table(path, enc, records[0], records[1:])


def norm_doi(doi: str) -> str:
    d = doi.strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi.org/", "doi:"):
        if d.startswith(prefix):
            d = d[len(prefix):]
    return d


class Sources:
    """Acceso a los archivos de la etapa 01 (tablas originales y fichas)."""

    def __init__(self, tables_dir: Path, fiches_dir: Path, manifest_path: Path | None = None,
                 units_path: Path | None = None, coverage_path: Path | None = None,
                 environments_path: Path | None = None):
        self.tables_dir = Path(tables_dir)
        self.fiches_dir = Path(fiches_dir)
        self._manifest = self._load_manifest(manifest_path)
        self.units = load_units(units_path)
        self.coverage_path = Path(coverage_path) if coverage_path else None
        self.environments_path = Path(environments_path) if environments_path else None
        self.snapshot_dir = SNAPSHOT_DIR
        self._tables: dict[str, tuple[Table | None, str]] = {}
        self._fiches: dict[str, dict | None] = {}

    def table_names(self) -> list[str]:
        """Todos los CSV de PSI que hay en la carpeta de la etapa 01."""
        return sorted(p.name for p in self.tables_dir.glob("*.csv") if p.name.lower() != "manifest.csv")

    @staticmethod
    def _load_manifest(path) -> dict[str, str]:
        """Mapa nombre original del CSV -> archivo guardado, si la etapa 01 lo da.
        Acepta una lista de entradas (o {"files": [...]}) con 'original_name' o 'file_name',
        y 'path' o 'saved_as'."""
        if not path or not Path(path).is_file():
            return {}
        text = Path(path).read_text(encoding="utf-8-sig")
        if Path(path).suffix.lower() == ".csv":  # manifest.csv de la etapa 01: file,url,sha256,bytes,fetched_at
            entries = list(csv.DictReader(io.StringIO(text)))
        else:
            data = json.loads(text)
            entries = data.get("files", []) if isinstance(data, dict) else data
        mapping = {}
        for e in entries if isinstance(entries, list) else []:
            if isinstance(e, dict):
                orig = e.get("original_name") or e.get("file_name") or e.get("file")
                saved = e.get("path") or e.get("saved_as") or e.get("file")
                if orig and saved:
                    mapping[orig] = saved
        return mapping

    def table_path(self, name: str) -> Path | None:
        direct = self.tables_dir / name
        if direct.is_file():
            return direct
        saved = self._manifest.get(name)
        if saved:
            p = Path(saved)
            for cand in (p, self.tables_dir / p.name, ROOT / p):
                if cand.is_file():
                    return cand
        return None

    def table(self, name: str) -> tuple[Table | None, str]:
        if name not in self._tables:
            path = self.table_path(name)
            if path is None:
                self._tables[name] = (None, f"file not found in {_show(self.tables_dir)} or the manifest")
            else:
                try:
                    self._tables[name] = (read_table(path), "")
                except (OSError, ValueError, csv.Error) as e:
                    self._tables[name] = (None, f"cannot read {path.name}: {e}")
        return self._tables[name]

    def fiche(self, investigation: str) -> dict | None:
        if investigation not in self._fiches:
            path = self.fiches_dir / f"{investigation}.json"
            try:
                self._fiches[investigation] = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                self._fiches[investigation] = None
        return self._fiches[investigation]

    def acronym(self, investigation: str) -> str | None:
        f = self.fiche(investigation)
        return f.get("investigationAcronym") if f else None

    def brief(self, investigation: str, limit: int = 400) -> tuple[str, str]:
        """Título y comienzo del objetivo de la ficha PSI, sin HTML, para dar contexto al modelo."""
        f = self.fiche(investigation) or {}
        title = " ".join(str(f.get("title") or "").split())
        objective = " ".join(re.sub(r"<[^>]+>", " ", str(f.get("objective") or "")).split())
        if len(objective) > limit:
            objective = objective[:limit].rsplit(" ", 1)[0] + "…"
        return title, objective


def cited_rows(table: Table, rows_spec) -> tuple[list[int], list[int]]:
    """Filas citadas que existen, y filas citadas que no existen.
    'all' = todas las filas que tienen algo escrito; las filas completamente vacías no son pruebas
    (CFI-G Inverse trae 861 al final). La numeración no cambia."""
    if rows_spec == "all":
        return [r for r in range(1, len(table.rows) + 1) if any(c.strip() for c in table.rows[r - 1])], []
    ok = [r for r in rows_spec if 1 <= r <= len(table.rows)]
    bad = [r for r in rows_spec if not 1 <= r <= len(table.rows)]
    return ok, bad


# =============================================================================
# Números y unidades
# =============================================================================

def unit_kind(unit: str) -> str:
    u = unit.strip().lower()
    if u.startswith("%") or "percent" in u:
        return "percent"
    if "fraction" in u:
        return "fraction"
    return "other"


def to_percent(value: float, unit: str) -> float:
    return value * 100.0 if unit_kind(unit) == "fraction" else value


def close(a: float | None, b: float | None, exact: bool = False) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if exact:
        return a == b
    return abs(a - b) <= max(RECALC_REL_TOL * max(abs(a), abs(b)), 1e-12)


@dataclass
class Known:
    """Un número con fuente, contra el que se comparan textos y gráficas."""
    value: float
    kind: str   # percent | fraction | other | any (número del SQL: la unidad no se sabe)
    label: str


# Números del texto. Se ignoran los pegados a letras (O2, CO2, 4b) y los de identificadores (PSI-25, F-001).
_TEXT_NUM = re.compile(r"(?<![A-Za-z0-9.])(?<![A-Za-z]-)(\d+(?:\.\d+)?)(?![A-Za-z0-9])(\s*%)?")


def _decimals(s: str) -> int:
    return len(s.split(".")[1]) if "." in s else 0


def text_matches(num: str, value: float) -> bool:
    """¿El número escrito en el texto es este valor, quizá redondeado?"""
    t = float(num)
    return abs(round(value, _decimals(num)) - t) < 1e-9 or abs(value - t) <= 1e-9 * max(1.0, abs(t))


def _fmt(x: float) -> str:
    return str(int(x)) if float(x).is_integer() else repr(float(x))


def check_text_numbers(text: str, known: list[Known]) -> tuple[list[str], list[str]]:
    """Q1: números sin fuente. Q2: números con '%' cuya fuente no es un porcentaje."""
    missing, bad_unit = [], []
    for m in _TEXT_NUM.finditer(text):
        num, has_pct = m.group(1), bool(m.group(2))
        as_pct = [k for k in known
                  if (k.kind in ("percent", "any") and text_matches(num, k.value))
                  or (k.kind == "fraction" and text_matches(num, k.value * 100))]
        any_src = as_pct or [k for k in known if text_matches(num, k.value)]
        if not any_src:
            missing.append(num + ("%" if has_pct else ""))
        elif has_pct and not as_pct:
            bad_unit.append(f"{num}% (source is not a percentage: {any_src[0].label})")
    return missing, bad_unit


def _numbers_in(obj, path=""):
    if isinstance(obj, bool):
        return
    if isinstance(obj, (int, float)):
        yield path, float(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            yield from _numbers_in(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _numbers_in(v, f"{path}[{i}]")


def chart_numbers(chart: dict):
    """Números que la gráfica presenta como datos: data.values y cada 'datum' numérico.
    No se revisan ajustes de dibujo (dominio de ejes, strokeDash, dx...)."""
    yield from _numbers_in(chart.get("data", {}).get("values", []), "chart.data.values")

    def walk(o, path):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == "datum" and isinstance(v, (int, float)) and not isinstance(v, bool):
                    yield f"{path}.datum", float(v)
                else:
                    yield from walk(v, f"{path}.{k}")
        elif isinstance(o, list):
            for i, v in enumerate(o):
                yield from walk(v, f"{path}[{i}]")

    yield from walk({k: v for k, v in chart.items() if k != "data"}, "chart")


# =============================================================================
# Recálculo independiente (un recalculador por función del catálogo de la etapa 04)
# =============================================================================

@dataclass
class Quantity:
    investigation: str
    stat: str                 # min | max | count_at_or_above
    value: float | None       # min/max en %; conteos en pruebas
    kind: str                 # percent | other
    table: str = ""
    column: str = ""
    rows: list[int] = field(default_factory=list)  # filas donde está el valor (min/max)
    scale: float = 1.0        # celda * scale = valor en %
    cell_text: str = ""       # texto de la celda de la primera fila de 'rows'
    cell_values: list[float] = field(default_factory=list)  # lo que se leyó de esa celda (sin escalar)
    scope: str = "investigation"  # 'investigation': lo que se compara con 'values'; 'table': parcial de una tabla
    n_tables: int = 1


@dataclass
class Recalc:
    quantities: list[Quantity] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    cells_total: int = 0
    cells_readable: int = 0      # incluye las imprecisas
    cells_imprecise: int = 0     # '~ x', 'a to b', 'a; b; c': legibles, pero no un número exacto
    used_percent_values: list[tuple[str, int, float]] = field(default_factory=list)
    tested_range_ok: bool | None = None
    tested_range_detail: str = ""
    # Recalculadores que nombran sus resultados igual que 'values' (coverage_by_environment, sql_query):
    named: dict[str, float] | None = None
    fidelity_notes: list[str] = field(default_factory=list)     # C2 cuando el recalculador lo hace solo
    fidelity_problems: list[str] = field(default_factory=list)
    human_checks: list[tuple[str, str]] = field(default_factory=list)  # (pregunta, contexto) para una persona
    c3_summary: str = ""                                         # cómo se recalculó, para el detalle de C3


def recalc_o2_range(finding: dict, sources: Sources) -> Recalc:
    """Recalcula o2_range: mínimo y máximo de O2 por investigación y cuántas pruebas
    llegan al umbral, leyendo las celdas originales del CSV."""
    out = Recalc()
    params = finding["method"]["params"]
    invs = params.get("investigations") or ([params["investigation"]] if "investigation" in params else [])
    threshold = params.get("threshold_pct")
    covered = set()
    for ev in finding["evidence"]:
        inv = ev["investigation"]
        if invs and inv not in invs:
            continue
        covered.add(inv)
        table, err = sources.table(ev["table"])
        if table is None:
            out.problems.append(f"{inv}: cannot read table '{ev['table']}' ({err})")
            continue
        if len(ev["columns"]) != 1:
            out.problems.append(f"{inv}: o2_range expects exactly one O2 column, got {len(ev['columns'])}")
            continue
        col = table.col_index(ev["columns"][0])
        if col is None:
            out.problems.append(f"{inv}: column '{ev['columns'][0]}' not found in {ev['table']}")
            continue
        unit, why = column_unit(sources, ev["table"], table.header[col])
        if unit is None:
            out.problems.append(f"{inv}: {why}")
            continue
        scale = 100.0 if unit == "fraction" else 1.0
        rows, _ = cited_rows(table, ev["rows"])
        nums, per_row = [], {}
        for r in rows:
            out.cells_total += 1
            vals, kind = parse_o2_cell(table.cell(r, col))
            if kind == "unreadable":
                continue
            out.cells_readable += 1
            out.cells_imprecise += kind == "imprecise"
            per_row[r] = vals
            for v in vals:
                nums.append((r, v * scale))
                out.used_percent_values.append((inv, r, v * scale))
        common = dict(investigation=inv, table=ev["table"], column=table.header[col], scale=scale)
        if not nums:
            out.quantities += [Quantity(stat="min", value=None, kind="percent", **common),
                               Quantity(stat="max", value=None, kind="percent", **common)]
        else:
            for stat, target in (("min", min(v for _, v in nums)), ("max", max(v for _, v in nums))):
                where = sorted({r for r, v in nums if v == target})
                out.quantities.append(Quantity(stat=stat, value=target, kind="percent", rows=where,
                                               cell_text=table.cell(where[0], col).strip(),
                                               cell_values=per_row[where[0]], **common))
        if threshold is not None:
            # Una fila cuenta si alguno de sus valores llega al umbral (en BRE cada fila es un día de pruebas).
            n = sum(1 for r in per_row if any(v * scale >= threshold for v in per_row[r]))
            out.quantities.append(Quantity(stat="count_at_or_above", value=float(n), kind="other", **common))
    for inv in sorted(set(invs) - covered):
        out.problems.append(f"{inv} is in method.params but has no evidence entry")
    out.quantities = by_investigation(out.quantities)
    out.tested_range_ok = True
    out.tested_range_detail = ("Coverage calculation: it reports the O2 range that was tested "
                               "and does not predict untested conditions.")
    return out


def by_investigation(quantities: list[Quantity]) -> list[Quantity]:
    """Junta las cantidades por investigación. Una llave como 'psi159_n_at_or_above' habla de toda
    la investigación: si cita varias tablas (CFI-G: Normal e Inverse), se compara con el total
    (mínimo de los mínimos, máximo de los máximos, suma de los conteos), no con cada tabla.
    Las cantidades de cada tabla se conservan con scope='table'."""
    groups: dict[tuple[str, str], list[Quantity]] = {}
    for q in quantities:
        groups.setdefault((q.investigation, q.stat), []).append(q)
    out = []
    for (inv, stat), qs in groups.items():
        if len(qs) == 1:
            out.append(qs[0])
            continue
        for q in qs:
            q.scope = "table"
        out += qs
        known = [q for q in qs if q.value is not None]
        if stat == "count_at_or_above":
            agg = Quantity(investigation=inv, stat=stat, value=float(sum(q.value for q in known)) if known else None,
                           kind="other")
        else:
            best = (min if stat == "min" else max)(known, key=lambda q: q.value) if known else None
            agg = Quantity(**{**best.__dict__}) if best else Quantity(investigation=inv, stat=stat, value=None,
                                                                    kind="percent")
        agg.scope, agg.n_tables = "investigation", len(qs)
        out.append(agg)
    return out


def parse_pressure_cell(cell: str, unit: str) -> tuple[list[float], str]:
    """Como parse_o2_cell, pero acepta la unidad escrita en la celda ('1 atm' en CFI)."""
    s = re.sub(rf"\s*{re.escape(unit)}\s*$", "", cell.strip(), flags=re.I)
    return parse_o2_cell(s)


def read_environments(path) -> dict[str, dict]:
    """Tabla 'Sourced atmospheres' de _config/environments.md, leída con código propio."""
    if not path or not Path(path).is_file():
        return {}
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    out = {}
    for i, line in enumerate(lines):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if line.lstrip().startswith("|") and cells[:2] == ["environment", "o2_min_pct"]:
            for row in lines[i + 2:]:
                if not row.lstrip().startswith("|"):
                    break
                vals = dict(zip(cells, [c.strip() for c in row.strip().strip("|").split("|")]))
                env = {"source": vals.get("source", "")}
                for k in ("o2_min_pct", "o2_max_pct", "pressure_min_psi", "pressure_max_psi"):
                    env[k] = float(vals[k]) if vals.get(k) else None
                out[vals["environment"]] = env
            break
    return out


def recalc_coverage_by_environment(finding: dict, sources: Sources) -> Recalc:
    """Recalcula coverage_by_environment recorriendo TODAS las tablas de PSI (no solo las citadas):
    por fase de combustible, cuántas pruebas llegaron al O2 del ambiente, cuántas además a su presión,
    y de cuántas no se sabe la presión. Así también se comprueban los ceros.
    Fase y columnas de cada tabla: references/cobertura-tablas.json (aprobado por una persona)."""
    out = Recalc(named={})
    params = finding["method"]["params"]
    envs = read_environments(sources.environments_path)
    env = envs.get(params.get("environment"))
    if env is None:
        out.problems.append(f"environment {params.get('environment')!r} is not in the sourced table of "
                            "_config/environments.md")
        return out
    for k in ("o2_min_pct", "pressure_max_psi"):
        if env[k] is None or params.get(k) is None or not close(float(params[k]), env[k]):
            out.problems.append(f"params.{k} = {params.get(k)} but _config/environments.md says {env[k]}")
    for k in ("o2_max_pct", "pressure_min_psi"):
        if env[k] is not None:
            out.problems.append(f"{k} is set in _config/environments.md; this recalculator does not handle it yet")
    if out.problems:
        return out
    o2_min, p_max = env["o2_min_pct"], env["pressure_max_psi"]

    cov = None
    if sources.coverage_path and sources.coverage_path.is_file():
        cov = json.loads(sources.coverage_path.read_text(encoding="utf-8"))
    if cov is None:
        out.problems.append("stages/05_auditar/references/cobertura-tablas.json is missing")
        return out
    if not str(cov.get("approved_by", "")).strip():
        out.problems.append("cobertura-tablas.json is not approved yet (approved_by is empty)")
        return out
    phases = {inv: e.get("phase") for inv, e in cov.get("investigations", {}).items()}
    tables = cov.get("tables", {})
    unmapped = [t for t in sources.table_names() if t not in tables]
    if unmapped:
        out.problems.append("tables in stage 01 not described in cobertura-tablas.json, so zero counts cannot be "
                            f"verified: {', '.join(unmapped)}")

    stats: dict[str, dict[str, int]] = {}
    matched: dict[str, set[int]] = {}
    for tname, entry in tables.items():
        inv = tname.split("_")[0]
        phase = phases.get(inv)
        if not phase:
            continue  # sin fase en el inventario (p. ej. estudios en tierra): no entra en ninguna fase
        if entry.get("o2_is_burner_stream"):
            continue  # llama inversa: el O2 es el chorro del quemador, no el ambiente; no es una atmósfera
        st = stats.setdefault(phase, {"tests": 0, "o2_match": 0, "o2_and_pressure_match": 0,
                                      "pressure_unknown": 0, "o2_unknown": 0})
        table, err = sources.table(tname)
        if table is None:
            out.problems.append(f"{tname}: {err}")
            continue
        o2cols = []
        for c in entry.get("o2", []):
            i = table.col_index(c)
            unit, why = (column_unit(sources, tname, table.header[i]) if i is not None
                         else (None, f"column '{c}' not found"))
            if unit is None:
                out.problems.append(f"{tname}: {why}")
                continue
            o2cols.append((i, 100.0 if unit == "fraction" else 1.0))
        pcol = None
        if entry.get("pressure"):
            pc = entry["pressure"]
            i, factor = table.col_index(pc.get("column", "")), PRESSURE_TO_PSI.get(str(pc.get("unit", "")).lower())
            if i is None or factor is None:
                out.problems.append(f"{tname}: pressure column {pc} not found or unit not known")
            else:
                pcol = (i, factor, pc["unit"])
        rows, bad = cited_rows(table, entry.get("rows", "all"))
        if bad:
            out.problems.append(f"{tname}: rows {bad} in cobertura-tablas.json do not exist")
        for r in rows:
            st["tests"] += 1
            o2 = []
            for i, scale in o2cols:
                out.cells_total += 1
                vals, kind = parse_o2_cell(table.cell(r, i))
                if kind != "unreadable":
                    out.cells_readable += 1
                    out.cells_imprecise += kind == "imprecise"
                    o2 += [v * scale for v in vals]
                    out.used_percent_values += [(inv, r, v * scale) for v in vals]
            if not o2:
                st["o2_unknown"] += 1
                continue
            if max(o2) < o2_min:  # como el Calculador: el O2 más alto de la prueba
                continue
            st["o2_match"] += 1
            matched.setdefault(tname, set()).add(r)
            pvals = parse_pressure_cell(table.cell(r, pcol[0]), pcol[2])[0] if pcol else []
            if not pvals:
                st["pressure_unknown"] += 1
            elif min(pvals) * pcol[1] <= p_max + 1e-9:  # la presión más baja de la prueba
                st["o2_and_pressure_match"] += 1

    for phase, st in stats.items():
        for k in ("o2_match", "o2_and_pressure_match", "pressure_unknown"):
            out.named[f"{phase}_{k}"] = float(st[k])
        if st["o2_match"] and f"{phase}_o2_match" not in finding["values"]:
            out.problems.append(f"{st['o2_match']} {phase} tests reach {_fmt(o2_min)}% O2 but the finding "
                                f"does not report {phase}_o2_match")
    # Fila por fila: lo citado debe ser exactamente lo que cumple el umbral.
    cited: dict[str, set[int]] = {}
    for ev in finding["evidence"]:
        t, _ = sources.table(ev["table"])
        if t is not None:
            cited.setdefault(ev["table"], set()).update(cited_rows(t, ev["rows"])[0])
    for tname in sorted(set(cited) | set(matched)):
        c, m = cited.get(tname, set()), matched.get(tname, set())
        if c != m:
            out.problems.append(f"{tname}: {len(m)} rows meet the threshold, the evidence cites {len(c)}"
                                + (f" (missing e.g. rows {sorted(m - c)[:5]})" if m - c else "")
                                + (f" (extra e.g. rows {sorted(c - m)[:5]})" if c - m else ""))
    # C6: un cero con pruebas sin dato de O2 no es un cero.
    weak = [f"{ph}: 0 of {st['tests']} tests reached {_fmt(o2_min)}% O2, but {st['o2_unknown']} have no readable O2"
            for ph, st in stats.items()
            if st["o2_match"] == 0 and st["o2_unknown"] and f"{ph}_o2_match" in finding["values"]]
    summary = "; ".join(f"{ph}: {st['o2_match']} of {st['tests']} tests at >= {_fmt(o2_min)}% O2"
                        f" ({st['o2_unknown']} without O2 data)" for ph, st in sorted(stats.items()))
    out.tested_range_ok = not weak
    out.tested_range_detail = ("A zero is not a zero when tests lack O2 data: " + "; ".join(weak)) if weak else \
        f"Scanned every PSI table in cobertura-tablas.json. {summary}."
    return out


def _import_duckdb():
    """DuckDB solo hace falta para sql_query; el resto del auditor es biblioteca estándar."""
    try:
        import duckdb
        return duckdb
    except ImportError:
        return None


def open_snapshot_readonly(duckdb, snapshot_dir: Path):
    """Carga cada CSV del snapshot como tabla, con código propio, y cierra la conexión:
    sin acceso a archivos externos y con la configuración bloqueada."""
    con = duckdb.connect(":memory:")
    found = sorted(Path(snapshot_dir).glob("*.csv"))
    if not found:
        raise FileNotFoundError(f"no CSV files in {_show(snapshot_dir)}")
    for path in found:
        lit = "'" + str(path).replace("'", "''") + "'"
        source = f"read_csv({lit}, header = true, all_varchar = true)"
        cols = [d[0] for d in con.execute(f"SELECT * FROM {source} LIMIT 0").description]
        types = SNAPSHOT_TYPES.get(path.stem, {})
        select = ", ".join(f'CAST("{c}" AS {types[c]}) AS "{c}"' if c in types else f'"{c}"' for c in cols)
        con.execute(f'CREATE TABLE "{path.stem}" AS SELECT {select} FROM {source}')
    con.execute("SET memory_limit = '2GB'")
    con.execute("SET enable_external_access = false")
    con.execute("SET lock_configuration = true")
    return con


def run_select(duckdb, con, sql: str) -> tuple[list[str], list[tuple]]:
    """Una sola sentencia SELECT, con límite de tiempo y de filas."""
    import threading
    statements = duckdb.extract_statements(sql)
    if len(statements) != 1 or statements[0].type != duckdb.StatementType.SELECT:
        raise ValueError("method.params.sql must be exactly one SELECT statement")
    timer = threading.Timer(SQL_TIMEOUT_S, con.interrupt)
    timer.start()
    try:
        cur = con.execute(sql)
        rows = cur.fetchmany(SQL_MAX_ROWS + 1)
    finally:
        timer.cancel()
    if len(rows) > SQL_MAX_ROWS:
        raise ValueError(f"the SQL returned more than {SQL_MAX_ROWS} rows")
    return [d[0] for d in cur.description], rows


def recalc_sql_query(finding: dict, sources: Sources) -> Recalc:
    """sql_query: 'reproducir y anclar'.
    1. Reproducir: correr el SQL del hallazgo sobre el snapshot del Calculador (solo lectura).
    2. Anclar: cada fila y columna que el SQL dice haber usado existe en el CSV ORIGINAL y no está vacía;
       cada conteo es igual a su número de filas; cada mínimo o máximo es una celda original.
    3. Que el SQL responda la pregunta no lo puede saber el código: queda una pregunta para una persona (Q8)."""
    out = Recalc(named={})
    out.human_checks.append((HUMAN_SQL_QUESTION, "Pending: a person must read the SQL and dismiss this alert if it "
                                                 "is right."))
    duckdb = _import_duckdb()
    if duckdb is None:
        out.problems.append("duckdb is not installed in this Python; run the auditor with the venv "
                            "that has it (for example ~/prueba-auditor/venv/bin/python)")
        return out
    sql = finding["method"]["params"].get("sql")
    if not isinstance(sql, str) or not sql.strip():
        out.problems.append("method.params.sql is missing")
        return out
    try:
        con = open_snapshot_readonly(duckdb, sources.snapshot_dir)
        try:
            columns, records = run_select(duckdb, con, sql)
        finally:
            con.close()
    except Exception as e:  # cualquier error de DuckDB o del snapshot: no se pudo reproducir
        out.problems.append(f"could not run the SQL over {_show(sources.snapshot_dir)}: {type(e).__name__}: {e}")
        return out
    missing = [c for c in SQL_COLUMNS if c not in columns]
    if missing:
        out.problems.append(f"the SQL result lacks column(s) {missing}")
        return out
    # Contexto para quien revise Q8: qué parte de PSI ve el snapshot.
    try:
        con = open_snapshot_readonly(duckdb, sources.snapshot_dir)
        try:
            in_snapshot = {r[0] for r in con.execute("SELECT DISTINCT source_table FROM tests").fetchall()}
        finally:
            con.close()
        absent = [t for t in sources.table_names() if t not in in_snapshot]
        if absent:
            out.human_checks[0] = (HUMAN_SQL_QUESTION,
                                   f"Pending. The snapshot covers {len(in_snapshot)} of {len(sources.table_names())} "
                                   f"PSI tables; a claim about 'PSI' or 'no test' does not see: {', '.join(absent)}.")
    except Exception:
        pass
    idx = {c: columns.index(c) for c in SQL_COLUMNS}
    if finding["status"] == "no_data" and records:
        out.problems.append(f"no-data finding, but its SQL returns {len(records)} row(s)")
    used: dict[str, set[int]] = {}
    for rec in records:
        name, value, unit = rec[idx["name"]], rec[idx["value"]], rec[idx["unit"]]
        inv, tname, rows, cols = (rec[idx["investigation"]], rec[idx["source_table"]],
                                  rec[idx["source_rows"]], rec[idx["source_columns"]])
        if name in out.named:
            out.problems.append(f"the SQL returns the name {name!r} twice")
            continue
        out.named[name] = None if value is None else float(value)
        if name not in finding["values"]:
            out.problems.append(f"the SQL returns {name} = {value} but the finding does not report it")
        table, err = sources.table(str(tname))
        if table is None:
            out.problems.append(f"{name}: source table {tname!r}: {err}")
            continue
        if not str(tname).startswith(f"{inv}_"):
            out.problems.append(f"{name}: table {tname} does not belong to {inv}")
        rows = list(rows or [])
        blank = {r for r in range(1, len(table.rows) + 1) if not any(c.strip() for c in table.rows[r - 1])}
        bad = [r for r in rows if not isinstance(r, int) or not 1 <= r <= len(table.rows) or r in blank]
        if bad:
            out.problems.append(f"{name}: rows {bad[:5]} do not exist (or are empty) in the original {tname}")
        used.setdefault(str(tname), set()).update(r for r in rows if isinstance(r, int))
        names = [c for part in (cols or []) for c in str(part).split(" | ") if c]
        idxs = []
        for c in names:
            i = table.col_index(c)
            if i is None:
                out.problems.append(f"{name}: column {c!r} is not in the header of the original {tname}")
            else:
                idxs.append((c, i))
        good = [r for r in rows if r not in bad]
        for _, i in idxs:
            for r in good:
                out.cells_total += 1
                out.cells_readable += bool(table.cell(r, i).strip())
        if unit in COUNT_UNITS:
            if value != len(rows) or len(set(rows)) != len(rows):
                out.problems.append(f"{name} = {value} {unit} but the SQL lists {len(set(rows))} distinct rows")
        elif value is not None and unit_kind(str(unit)) == "percent":
            hits = []
            for c, i in idxs:
                u, _ = column_unit(sources, str(tname), table.header[i])
                if u is None:
                    continue
                scale = 100.0 if u == "fraction" else 1.0
                for r in good:
                    vals, kind = parse_o2_cell(table.cell(r, i))
                    if any(abs(v * scale - float(value)) <= max(RECALC_REL_TOL * abs(float(value)), 1e-9)
                           for v in vals):
                        hits.append((r, c, table.cell(r, i).strip()))
            if hits:
                r, c, txt = hits[0]
                out.fidelity_notes.append(f"{name} = {value} {unit} <- cell '{txt}' ({c}) at row {r} of {tname}")
            else:
                out.fidelity_problems.append(f"{name} = {value} {unit} is not an original cell of {tname} "
                                             f"in columns {names}")
    # Las filas que usó el SQL deben estar en la evidencia.
    cited: dict[str, set[int]] = {}
    for ev in finding["evidence"]:
        t, _ = sources.table(ev["table"])
        if t is not None:
            cited.setdefault(ev["table"], set()).update(cited_rows(t, ev["rows"])[0])
    for tname, rws in used.items():
        extra = sorted(rws - cited.get(tname, set()))
        if extra:
            out.problems.append(f"the SQL uses rows of {tname} that the evidence does not cite: {extra[:5]}")
    out.c3_summary = (f"All {{n}} values reproduced by running the finding's SQL over {_show(sources.snapshot_dir)} "
                      "(read-only); every source row and column it reports exists in the original CSVs")
    return out


RECALCULATORS = {
    "o2_range": recalc_o2_range,
    "coverage_by_environment": recalc_coverage_by_environment,
    "sql_query": recalc_sql_query,
}


def value_stat(key: str) -> str | None:
    k = key.lower()
    if re.search(r"_(min|minimum)$", k):
        return "min"
    if re.search(r"_(max|maximum)$", k):
        return "max"
    if re.search(r"(count|n|tests)_(at_or_above|above|ge|over)", k):
        return "count_at_or_above"
    if re.search(r"(^|_)(n_tests|n|tests|test_count|num_tests)$", k):
        return "n_tests"  # pruebas citadas (filas) de una investigación, o el total si la llave es genérica
    return None


_ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6", "vii": "7", "viii": "8", "ix": "9", "x": "10"}


def _name_forms(name: str) -> set[str]:
    """'BASS-II' -> {'bassii', 'bass2'}; 'PSI-25' -> {'psi25'};
    'ACME CFI-G' -> {'acmecfig', 'cfig'} (PSI antepone la familia de hardware al acrónimo)."""
    low = name.lower().strip()
    variants = {low}
    if " " in low:
        variants.add(low.split()[-1])
    forms = set()
    for v in variants:
        forms.add(re.sub(r"[^a-z0-9]", "", v))
        m = re.match(r"^(.*?)[-\s](x|ix|viii|vii|vi|v|iv|iii|ii|i)$", v)
        if m:
            forms.add(re.sub(r"[^a-z0-9]", "", m.group(1)) + _ROMAN[m.group(2)])
    return forms


_GENERIC_TOKENS = {"o2", "oxygen", "min", "max", "minimum", "maximum", "count", "n", "tests", "all", "total"}


def value_investigation(key: str, candidates: list[str], sources: Sources) -> str | None:
    """A qué investigación se refiere una llave de 'values' (por su prefijo).
    Devuelve el ID, None si la llave no nombra ninguna (p. ej. 'o2_max'),
    o '?<prefijo>' si nombra algo que no es una investigación citada."""
    token = key.lower().split("_")[0]
    hits = []
    for inv in candidates:
        names = _name_forms(inv)
        acr = sources.acronym(inv)
        if acr:
            names |= _name_forms(acr)
        if token in names:
            hits.append(inv)
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        return f"?{token} (matches {', '.join(hits)})"
    return None if token in _GENERIC_TOKENS else f"?{token}"


def _show(path: Path) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return Path(path).name + "/"


# =============================================================================
# Modelo local
# =============================================================================

class ModelUnavailable(Exception):
    pass


class OllamaModel:
    def __init__(self, url: str, name: str, timeout: float = 120):
        self.url = url.rstrip("/") + "/api/chat"
        self.name = name
        self.timeout = timeout

    def ask(self, system: str, user: str) -> tuple[dict | None, int]:
        """Devuelve ({answer, reason} o None, intentos). Repite una vez si la respuesta no sirve."""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        for attempt in (1, 2):
            body = {"model": self.name, "stream": False, "think": False, "format": ANSWER_SCHEMA,
                    "options": MODEL_OPTIONS, "messages": messages}
            req = urllib.request.Request(self.url, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    resp = json.load(r)
            except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
                raise ModelUnavailable(f"{self.name} at {self.url}: {e}") from e
            try:
                out = json.loads(resp["message"]["content"])
                if out.get("answer") in ("yes", "no") and isinstance(out.get("reason"), str):
                    return {"answer": out["answer"], "reason": out["reason"].strip()}, attempt
            except (KeyError, TypeError, ValueError):
                pass
            # Con temperatura 0 la misma pregunta da la misma respuesta: se cambia el mensaje.
            messages = messages + [{"role": "user", "content": RETRY_REMINDER}]
        return None, 2


# Qué ve el modelo en cada pregunta. Menos contexto = menos distracción: con todo el hallazgo
# a la vista, el modelo de 4B contestaba sobre las advertencias en vez de sobre el texto.
QUESTION_CONTEXT = {
    "Q3": ("cited", "evidence", "values", "assumptions", "limitations"),
    "Q4": ("cited",),
    "Q5": (),
    "Q6": (),
    "Q7": ("limitations",),
}
ALL_CONTEXT = ("cited", "evidence", "values", "assumptions", "limitations", "warnings")


def build_model_prompt(finding: dict, field_name: str, text: str, question: str, sources: Sources,
                       qid: str | None = None) -> str:
    parts = QUESTION_CONTEXT.get(qid, ALL_CONTEXT)
    lines = []
    if field_name != "limitations":
        lines += [f"TEXT ({field_name}):", text, ""]
    if "cited" in parts:
        lines.append("CITED INVESTIGATIONS:")
        seen = set()
        for ev in finding["evidence"]:
            inv = ev["investigation"]
            if inv in seen:
                continue
            seen.add(inv)
            acr = sources.acronym(inv)
            title, objective = sources.brief(inv)
            line = f"- {acr} ({inv})" if acr else f"- {inv}"
            if title:
                line += f": {title}."
            if objective and "evidence" in parts:  # el objetivo solo hace falta para Q3
                line += f" Objective (from PSI): {objective}"
            lines.append(line)
        if not seen:
            lines.append("- (none)")
        lines.append("")
    if "evidence" in parts:
        lines.append("EVIDENCE:")
        for ev in finding["evidence"]:
            acr = sources.acronym(ev["investigation"])
            name = f"{ev['investigation']} ({acr})" if acr else ev["investigation"]
            lines.append(f"- {name}; table {ev['table']}; columns {ev['columns']}; rows {ev['rows']}")
    if "values" in parts:
        lines.append("VALUES:")
        lines += [f"- {k} = {v['value']} {v['unit']}" for k, v in finding["values"].items()]
    for title, key in (("ASSUMPTIONS", "assumptions"), ("LIMITATIONS", "limitations"), ("WARNINGS", "warnings")):
        if key in parts:
            lines.append(f"{title}:")
            lines += [f"- {x}" for x in finding[key]] or ["- (none)"]
    lines += ["", f"QUESTION: {question}"]
    return "\n".join(lines)


# =============================================================================
# Auditoría de un hallazgo
# =============================================================================

class _ModelSlot:
    """Deja de llamar al modelo en cuanto falla la conexión, y recuerda por qué."""

    def __init__(self, model):
        self.model = model
        self.error = "" if model else "model not run (--no-model)"

    def ask(self, system, user):
        if self.model is None:
            return None, 0
        try:
            return self.model.ask(system, user)
        except ModelUnavailable as e:
            self.error = f"model unavailable: {e}"
            self.model = None
            return None, 0


def sql_number_literals(sql: str) -> list[float]:
    """Números escritos en el SQL, fuera de los textos entre comillas ('PSI-25' no cuenta)."""
    bare = re.sub(r"'(?:[^']|'')*'|\"(?:[^\"]|\"\")*\"", " ", sql)
    return [float(m) for m in re.findall(r"(?<![A-Za-z0-9_.])\d+(?:\.\d+)?(?![A-Za-z0-9_])", bare)]


def _known_numbers(finding: dict, recalc: Recalc | None, row_counts: dict[str, int]) -> list[Known]:
    known = []
    for k, v in finding["values"].items():
        if v["value"] is not None:
            known.append(Known(float(v["value"]), unit_kind(v["unit"]), f"values.{k}"))
    known.append(Known(float(finding["n_tests"]), "other", "n_tests"))
    for path, x in _numbers_in(finding["method"]["params"], "params"):
        kind = "percent" if re.search(r"(pct|percent)", path.lower()) else "other"
        known.append(Known(x, kind, path))
    sql = finding["method"]["params"].get("sql")
    if isinstance(sql, str):  # los números del SQL (umbrales) también son parámetros del método
        for x in sql_number_literals(sql):
            known.append(Known(x, "any", "number in method.params.sql"))
    for inv, n in row_counts.items():
        known.append(Known(float(n), "other", f"cited rows of {inv}"))
    if recalc and recalc.named:
        for name, v in recalc.named.items():
            known.append(Known(v, "other", f"recalculated {name}"))
    if recalc:
        for q in recalc.quantities:
            if q.value is not None:
                known.append(Known(q.value, q.kind, f"recalculated {q.stat} of {q.investigation}"))
    return known


def _check(cid: str, result: str, detail: str) -> dict:
    return {"id": cid, "name": CHECK_NAMES[cid], "done_by": CHECK_DONE_BY[cid], "result": result, "detail": detail}


def is_review_flag(t: dict) -> bool:
    """Lo que una persona puede confirmar o descartar: una alerta del modelo, o una pregunta para una persona."""
    if t["done_by"] == "human":
        return True
    return t["done_by"] == "model" and t["answer"] is not None and t["answer"] != t["expected"]


def apply_review(text_review: list[dict], review: dict | None, finding_sha: str) -> str:
    """Marca como 'dismissed' las alertas del modelo que una persona descartó.
    Devuelve una nota si la revisión no se pudo usar. Nunca toca respuestas de código."""
    if not review:
        return ""
    errors = validate(review, load_schema("review.schema.json"))
    if errors:
        return f"Review file ignored: it does not match schemas/review.schema.json ({errors[0]})"
    if review["finding_sha256"] != finding_sha:
        return "Review file ignored: it is for another version of the finding (SHA-256 differs); review it again"
    decisions = {(r["question_id"], r["field"]): r for r in review["flags"]}
    incomplete = []
    for t in text_review:
        if not is_review_flag(t):
            continue
        r = decisions.get((t["question_id"], t["field"]))
        if r and r["decision"] in ("dismiss", "confirm"):
            if r["reviewer"].strip() and r["note"].strip():
                key = "dismissed" if r["decision"] == "dismiss" else "confirmed"
                t[key] = {"reviewer": r["reviewer"].strip(), "note": r["note"].strip()}
            elif r["decision"] == "dismiss":
                incomplete.append(f"{t['question_id']}/{t['field']}")
    if incomplete:
        return f"Dismissals without reviewer or note were ignored: {', '.join(incomplete)}"
    return ""


def review_template(audit: dict, existing: dict | None) -> dict | None:
    """Plantilla de revisión con cada alerta del modelo en 'pending'. Conserva las decisiones
    que ya existan para la misma versión del hallazgo. None si no hay nada que revisar."""
    keep = {}
    if existing and existing.get("finding_sha256") == audit["finding_sha256"]:
        keep = {(r.get("question_id"), r.get("field")): r for r in existing.get("flags", []) if isinstance(r, dict)}
    flags = []
    for t in audit["text_review"]:
        if is_review_flag(t):
            old = keep.get((t["question_id"], t["field"]))
            flags.append(old or {"question_id": t["question_id"], "field": t["field"], "model_reason": t["reason"],
                                 "decision": "pending", "reviewer": "", "note": ""})
    if not flags:
        return None
    return {"finding_id": audit["finding_id"], "finding_sha256": audit["finding_sha256"], "flags": flags}


def assign_grade(status: str, results: dict[str, str], quality: str | None) -> tuple[str, list[str]]:
    """Reglas de _config/confidence.md. quality: clean | minor | many | None."""
    failed = {c for c, r in results.items() if r == "fail"}
    hard = sorted(failed & set(HARD_CHECKS))
    if hard:
        return "rejected", [f"{c} ({CHECK_NAMES[c]}) failed; the finding cannot be published." for c in hard]
    if status == "no_data":
        if "C8" in failed:
            return "rejected", ["C8 failed on a no-data finding: the text of a knowledge gap must be exact."]
        return "no_data", ["No test answers the question; published as a knowledge gap."]
    reasons = []
    if "C6" in failed:
        reasons.append("C6 failed: the finding goes beyond the tested conditions; published as an indication, not a conclusion.")
    if "C8" in failed:
        reasons.append("C8 failed: the text says more than the evidence supports, or it was not reviewed.")
    if quality == "many":
        reasons.append(f"C7: fewer than {QUALITY_MINOR_MIN:.0%} of the needed cells could be read.")
    if reasons:
        return "C", reasons
    if "C5" in failed:
        reasons.append(f"C5: limited support (fewer than {SUPPORT_BROAD_MIN} tests).")
    if quality == "minor":
        reasons.append("C7: some needed cells could not be read (minor data problems).")
    if reasons:
        return "B", reasons
    return "A", ["All checks passed, with broad support and clean data."]


def audit_finding(finding: dict, file_bytes: bytes, file_stem: str, sources: Sources, model=None,
                  review: dict | None = None) -> dict:
    """review: contenido de output/reviews/F-XXX.json, si existe (ver schemas/review.schema.json)."""
    slot = model if isinstance(model, _ModelSlot) else _ModelSlot(model)
    checks: dict[str, dict] = {}
    recalculation: list[dict] = []
    text_review: list[dict] = []

    # --- C0: formato -----------------------------------------------------------
    errors = validate(finding, load_schema("finding.schema.json"))
    if finding.get("id") != file_stem:
        errors.append(f"file name {file_stem}.json does not match id {finding.get('id')!r}")
    if errors:
        checks["C0"] = _check("C0", "fail", "; ".join(errors[:10]))
        for cid in CHECK_NAMES:
            if cid != "C0":
                checks[cid] = _check(cid, "not_applicable", "Skipped: the finding format is invalid (C0).")
        return _assemble(finding, file_bytes, checks, recalculation, text_review, None, slot)
    checks["C0"] = _check("C0", "pass", "Matches schemas/finding.schema.json.")

    # --- C1: trazabilidad ------------------------------------------------------
    c1_problems, c1_ok, row_counts = [], [], {}
    for i, ev in enumerate(finding["evidence"]):
        where = f"evidence[{i}] {ev['investigation']}"
        fiche = sources.fiche(ev["investigation"])
        if fiche is None:
            c1_problems.append(f"{where}: PSI fiche not found (stage 01)")
        else:
            if norm_doi(fiche.get("doi", "")) != norm_doi(ev["doi"]):
                c1_problems.append(f"{where}: DOI {ev['doi']} does not match the PSI fiche ({fiche.get('doi')})")
            listed = [t.get("file_name") for t in fiche.get("experimentalTable", []) if isinstance(t, dict)]
            if listed and ev["table"] not in listed:
                c1_problems.append(f"{where}: table '{ev['table']}' is not listed in the PSI fiche")
        table, err = sources.table(ev["table"])
        if table is None:
            c1_problems.append(f"{where}: {err}")
            continue
        missing_cols = [c for c in ev["columns"] if table.col_index(c) is None]
        if missing_cols:
            c1_problems.append(f"{where}: columns not found in the CSV header: {missing_cols}")
        rows, bad = cited_rows(table, ev["rows"])
        if bad:
            c1_problems.append(f"{where}: rows {bad} do not exist (the table has {len(table.rows)} rows)")
        row_counts[ev["investigation"]] = row_counts.get(ev["investigation"], 0) + len(rows)
        c1_ok.append(f"{ev['investigation']}: {len(rows)} rows in {ev['table']}")
    if not finding["evidence"] and finding["status"] == "has_data":
        c1_problems.append("status is has_data but there is no evidence")
    checks["C1"] = _check("C1", "fail" if c1_problems else "pass",
                          "; ".join(c1_problems) if c1_problems else
                          ("Rows, columns and DOI found: " + "; ".join(c1_ok)) if c1_ok else "No evidence cited.")

    # --- C3 (y C2, C7): recálculo independiente ---------------------------------
    func = finding["method"]["function"]
    recalc = None
    if finding["status"] == "no_data" and not finding["evidence"] and func != "sql_query":
        for cid in ("C2", "C3", "C7"):
            checks[cid] = _check(cid, "not_applicable", "No-data finding without evidence: nothing to recompute.")
    elif func not in RECALCULATORS:
        checks["C2"] = _check("C2", "not_applicable", "No independent recalculator for this function.")
        checks["C3"] = _check("C3", "fail", f"No independent recalculator for method.function '{func}'. "
                                            "The auditor team must add one before this finding can pass.")
        checks["C7"] = _check("C7", "not_applicable", "No independent recalculator for this function.")
    else:
        recalc = RECALCULATORS[func](finding, sources)
        for inv, n in row_counts.items():
            recalc.quantities.append(Quantity(investigation=inv, stat="n_tests", value=float(n), kind="other"))
        recalc.quantities.append(Quantity(investigation="ALL", stat="n_tests",
                                          value=float(sum(row_counts.values())), kind="other"))
        c3_problems = list(recalc.problems)
        c2_problems, c2_notes = [], []
        candidates = sorted({ev["investigation"] for ev in finding["evidence"]})
        if recalc.named is not None:  # el recalculador devuelve valores con el mismo nombre que 'values'
            for key, obj in finding["values"].items():
                got = recalc.named.get(key)
                ok = got is not None and obj["value"] is not None and close(float(obj["value"]), got,
                                                                            exact=obj["unit"] in COUNT_UNITS)
                recalculation.append({"value_name": key, "finding_value": obj["value"], "recalculated_value": got,
                                      "unit": obj["unit"], "match": ok,
                                      "detail": "recomputed over every PSI table" if got is not None else
                                      "no recalculated value with this name"})
                if not ok:
                    c3_problems.append(f"values.{key} = {obj['value']} {obj['unit']}, recalculated "
                                       f"{'nothing' if got is None else _fmt(got)}")
        for key, obj in ([] if recalc.named is not None else finding["values"].items()):
            stat = value_stat(key)
            if stat is None:
                c3_problems.append(f"values.{key}: cannot tell which statistic it is (expected a _min, _max or count suffix)")
                recalculation.append({"value_name": key, "finding_value": obj["value"], "recalculated_value": None,
                                      "unit": obj["unit"], "match": False, "detail": "not recomputed"})
                continue
            inv = value_investigation(key, candidates, sources)
            if inv is not None and inv.startswith("?"):
                no_fiche = [c for c in candidates if sources.acronym(c) is None]
                why = (f"prefix '{inv[1:]}' names more than one cited investigation" if "(matches" in inv else
                       f"prefix '{inv[1:]}' does not name any cited investigation")
                if no_fiche:
                    why += f" (acronyms come from the PSI fiches; missing for {', '.join(no_fiche)})"
                c3_problems.append(f"values.{key}: {why}")
                recalculation.append({"value_name": key, "finding_value": obj["value"], "recalculated_value": None,
                                      "unit": obj["unit"], "match": False, "detail": why})
                continue
            cands = [q for q in recalc.quantities if q.stat == stat and q.scope == "investigation"
                     and (inv is None or q.investigation == inv)]
            exact = stat in ("count_at_or_above", "n_tests")
            fv = None if obj["value"] is None else (obj["value"] if exact else to_percent(obj["value"], obj["unit"]))
            hit = next((q for q in cands if close(fv, q.value, exact)), None)
            q = hit or (cands[0] if cands else None)
            back = None
            if q is not None and q.value is not None:
                back = q.value if exact or unit_kind(obj["unit"]) != "fraction" else q.value / 100.0
            note = ""
            if q is not None and inv is None:
                note = "matched by value only: the key does not name the investigation"
            recalculation.append({"value_name": key, "finding_value": obj["value"], "recalculated_value": back,
                                  "unit": obj["unit"], "match": hit is not None,
                                  "detail": f"{stat} of {q.investigation}"
                                  + (f" over its {q.n_tables} cited tables" if q.n_tables > 1 else "")
                                  + (f"; {note}" if note else "") if q else
                                  "no recalculated quantity of this kind"})
            if hit is None:
                c3_problems.append(f"values.{key} = {obj['value']} {obj['unit']}, recalculated "
                                   f"{'nothing' if back is None else _fmt(back)}")
                continue
            if stat in ("min", "max") and hit.value is not None:
                r, cell = hit.rows[0], hit.cell_text
                if not any(abs(v * hit.scale - fv) <= 1e-9 * max(1.0, abs(fv)) for v in hit.cell_values):
                    c2_problems.append(f"values.{key} = {obj['value']} but the original cell at row {r} says '{cell}'")
                else:
                    exact_cell = parse_number(cell) is not None
                    c2_notes.append(f"{key} = {obj['value']} {obj['unit']} <- cell '{cell}' at row {r} of {hit.table}"
                                    + ("" if exact_cell else " (approximate or multi-value cell)"))
        total_rows = sum(row_counts.values())
        n_ok = finding["n_tests"] == total_rows
        recalculation.append({"value_name": "n_tests", "finding_value": finding["n_tests"],
                              "recalculated_value": total_rows, "unit": "tests", "match": n_ok,
                              "detail": "sum of the cited rows over all evidence"})
        if not n_ok:
            c3_problems.append(f"n_tests = {finding['n_tests']} but the evidence cites {total_rows} rows")
        checks["C3"] = _check("C3", "fail" if c3_problems else "pass",
                              "; ".join(c3_problems) if c3_problems else
                              (recalc.c3_summary.format(n=len(recalculation)) + "." if recalc.c3_summary else
                               f"All {len(recalculation)} numbers recomputed from the original cells match "
                               f"(relative tolerance {RECALC_REL_TOL:g}, counts exact)."))
        if recalc.named is not None:
            c2_problems += recalc.fidelity_problems
            c2_notes += recalc.fidelity_notes
        checks["C2"] = _check("C2", "fail" if c2_problems else ("pass" if c2_notes else "not_applicable"),
                              "; ".join(c2_problems or c2_notes) or "No extreme value to compare with a single cell.")
        # C7: calidad de las celdas que hicieron falta
        if recalc.cells_total:
            frac = recalc.cells_readable / recalc.cells_total
            if frac < QUALITY_MINOR_MIN:
                level = "many"
            elif frac < 1.0 or recalc.cells_imprecise:
                level = "minor"  # una celda aproximada o con varios valores no es un dato limpio
            else:
                level = "clean"
            imprecise = (f", {recalc.cells_imprecise} of them approximate or multi-value"
                         if recalc.cells_imprecise else "")
            checks["C7"] = _check("C7", "pass" if level == "clean" else "fail",
                                  f"{recalc.cells_readable} of {recalc.cells_total} needed cells readable "
                                  f"({frac:.1%}){imprecise}; level: {level}.")
        else:
            checks["C7"] = _check("C7", "not_applicable", "No cells were needed.")

    # --- C4: unidades y rangos -------------------------------------------------
    c4 = []
    for key, obj in finding["values"].items():
        v, unit = obj["value"], obj["unit"]
        if v is None:
            continue
        kind = unit_kind(unit)
        if kind == "percent" and not 0 <= v <= 100:
            c4.append(f"values.{key} = {v} {unit} is outside 0-100")
        elif kind == "fraction" and not 0 <= v <= 1:
            c4.append(f"values.{key} = {v} {unit} is outside 0-1")
        elif kind == "other":
            u = unit.strip().lower()
            if u in COUNT_UNITS:
                if v < 0 or not float(v).is_integer():
                    c4.append(f"values.{key} = {v} {unit} is not a whole, non-negative count")
            elif u in POSITIVE_UNITS:
                if v <= 0:
                    c4.append(f"values.{key} = {v} {unit} must be positive")
            else:
                c4.append(f"values.{key}: unit '{unit}' is not in the auditor's unit table")
    if recalc:
        for inv, r, v in recalc.used_percent_values:
            if not 0 <= v <= 100:
                c4.append(f"{inv} row {r}: O2 = {v}% is physically impossible")
    checks["C4"] = _check("C4", "fail" if c4 else "pass",
                          "; ".join(c4) if c4 else "Every value is in a known unit and a possible range.")

    # --- C5: soporte -----------------------------------------------------------
    if finding["status"] == "no_data":
        checks["C5"] = _check("C5", "not_applicable", "No-data finding.")
    else:
        n = finding["n_tests"]
        checks["C5"] = _check("C5", "pass" if n >= SUPPORT_BROAD_MIN else "fail",
                              f"{n} tests; broad support starts at {SUPPORT_BROAD_MIN} (provisional).")

    # --- C6: rango probado -----------------------------------------------------
    c6_bad, c6_ok = [], []
    envs = PARTIAL_GRAVITY_ENVS & set(finding["environments"])
    if envs:
        if any("partial" in w.lower() and "gravity" in w.lower() for w in finding["warnings"]):
            c6_ok.append(f"{sorted(envs)}: the partial-gravity warning is present")
        else:
            c6_bad.append(f"{sorted(envs)} listed but no warning says PSI has no partial-gravity data")
    if recalc and recalc.tested_range_ok is not None:
        (c6_ok if recalc.tested_range_ok else c6_bad).append(recalc.tested_range_detail)
    if c6_bad or c6_ok:
        checks["C6"] = _check("C6", "fail" if c6_bad else "pass", "; ".join(c6_bad or c6_ok))
    else:
        checks["C6"] = _check("C6", "not_applicable", "No tested-range rule applies.")

    # --- C8: texto fiel (código Q1-Q2, modelo Q3-Q7) ---------------------------
    known = _known_numbers(finding, recalc, row_counts)
    for fname in TEXT_FIELDS:
        missing, bad_unit = check_text_numbers(finding[fname], known)
        text_review.append({"question_id": "Q1", "question": CODE_QUESTIONS[0][1], "field": fname,
                            "done_by": "code", "expected": "yes", "answer": "no" if missing else "yes",
                            "reason": f"No source for: {', '.join(missing)}" if missing else
                                      "Every number has a source.", "attempts": 0})
        text_review.append({"question_id": "Q2", "question": CODE_QUESTIONS[1][1], "field": fname,
                            "done_by": "code", "expected": "yes", "answer": "no" if bad_unit else "yes",
                            "reason": "; ".join(bad_unit) if bad_unit else "Units agree.", "attempts": 0})
    asks = [(qid, q, exp, f, finding[f]) for f in TEXT_FIELDS for qid, q, exp in MODEL_QUESTIONS_PER_FIELD]
    asks.append((*MODEL_QUESTION_ONCE, "limitations", ""))
    for qid, question, expected, fname, text in asks:
        out, attempts = slot.ask(SYSTEM_PROMPT, build_model_prompt(finding, fname, text, question, sources, qid))
        text_review.append({"question_id": qid, "question": question, "field": fname, "done_by": "model",
                            "expected": expected, "answer": out["answer"] if out else None,
                            "reason": out["reason"] if out else (slot.error or "no valid answer after 2 attempts"),
                            "attempts": attempts})
    for question, context in (recalc.human_checks if recalc else []):
        text_review.append({"question_id": "Q8", "question": question, "field": "method", "done_by": "human",
                            "expected": "yes", "answer": None, "attempts": 0, "reason": context})
    review_note = apply_review(text_review, review, hashlib.sha256(file_bytes).hexdigest())
    dismissed = [t for t in text_review if t.get("dismissed")]
    wrong = [f"{t['question_id']}/{t['field']}" for t in text_review
             if t["answer"] != t["expected"] and not t.get("dismissed")]
    unanswered = [t for t in text_review if t["answer"] is None and t["done_by"] == "model"]
    if wrong:
        detail = f"{len(wrong)} of {len(text_review)} answers differ from the expected one: {', '.join(wrong)}"
        if unanswered:
            detail += f". {len(unanswered)} unanswered ({slot.error or 'invalid answers'}); needs manual review"
    else:
        detail = f"All {len(text_review)} answers are the expected ones"
    if dismissed:
        detail += (f". {len(dismissed)} model flag(s) dismissed by a person: "
                   + ", ".join(f"{t['question_id']}/{t['field']} ({t['dismissed']['reviewer']})" for t in dismissed))
    if review_note:
        detail += f". {review_note}"
    checks["C8"] = _check("C8", "fail" if wrong else "pass", detail + ".")

    # --- C9: gráfica ------------------------------------------------------------
    if finding["chart"] is None:
        checks["C9"] = _check("C9", "not_applicable", "No chart.")
    else:
        untraced = [f"{p} = {_fmt(x)}" for p, x in chart_numbers(finding["chart"])
                    if not any(close(x, k.value) or (k.kind == "fraction" and close(x, k.value * 100))
                               for k in known)]
        checks["C9"] = _check("C9", "fail" if untraced else "pass",
                              ("Chart numbers without a source: " + "; ".join(untraced)) if untraced else
                              "Every number in the chart data matches the finding or the recalculation.")

    quality = None
    if checks["C7"]["result"] != "not_applicable":
        quality = re.search(r"level: (\w+)", checks["C7"]["detail"]).group(1)
    return _assemble(finding, file_bytes, checks, recalculation, text_review, quality, slot)


def _assemble(finding, file_bytes, checks, recalculation, text_review, quality, slot) -> dict:
    results = {cid: c["result"] for cid, c in checks.items()}
    grade, reasons = assign_grade(finding.get("status", "has_data"), results, quality)
    model_used = any(t["done_by"] == "model" and t["attempts"] > 0 for t in text_review)
    model_name = getattr(slot.model, "name", None) if slot.model else None
    if model_used and model_name is None:  # se cayó a mitad de la auditoría
        model_name = "unknown (connection lost)"
    return {
        "finding_id": finding["id"],
        "finding_version": finding["version"],
        "finding_sha256": hashlib.sha256(file_bytes).hexdigest(),
        "checks": [checks[c] for c in CHECK_NAMES],
        "recalculation": recalculation,
        "text_review": text_review,
        "grade": grade,
        "reasons": reasons,
        "send_back_to": "04_calcular" if grade == "rejected" else None,
        "audited_by": {
            "script": "scripts/auditar.py",
            "model": model_name if model_used else None,
            "model_params": ({"think": False, **MODEL_OPTIONS} if model_used else None),
            "date": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        },
    }


# =============================================================================
# Programa
# =============================================================================

def load_dotenv(path: Path) -> None:
    """Lee KEY=VALUE de .env sin pisar variables que ya existan."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def write_summary(path: Path, audits: list[dict], unreadable: list[str], model_note: str) -> None:
    grades = ["A", "B", "C", "no_data", "rejected"]
    count = {g: sum(1 for a in audits if a["grade"] == g) for g in grades}
    lines = [
        "# Audit summary",
        "",
        f"Generated by `scripts/auditar.py` on {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC. {model_note}",
        "",
        "| Grade | Findings |",
        "|---|---|",
        *[f"| {g} | {count[g]} |" for g in grades],
        "",
        "| Finding | Version | Grade | Failed checks | Back to |",
        "|---|---|---|---|---|",
    ]
    for a in audits:
        failed = ", ".join(c["id"] for c in a["checks"] if c["result"] == "fail") or "none"
        lines.append(f"| {a['finding_id']} | {a['finding_version']} | {a['grade']} | {failed} | "
                     f"{a['send_back_to'] or '—'} |")
    if unreadable:
        lines += ["", "## Could not be audited", "", *[f"- {u}" for u in unreadable]]
    not_a = [a for a in audits if a["grade"] != "A"]
    if not_a:
        lines += ["", "## Why not grade A", ""]
        for a in not_a:
            lines.append(f"### {a['finding_id']} v{a['finding_version']}: {a['grade']}")
            lines += [f"- {r}" for r in a["reasons"]]
            lines += [f"- **{c['id']} {c['name']}**: {c['detail']}" for c in a["checks"] if c["result"] == "fail"]
            wrong = [t for t in a["text_review"] if t["answer"] != t["expected"]]
            if wrong:
                lines += ["", "| Question | By | Field | Expected | Got | Reason | Human review |",
                          "|---|---|---|---|---|---|---|"]
                lines += [f"| {t['question_id']} | {t['done_by']} | {t['field']} | {t['expected']} | "
                          f"{t['answer'] or '—'} | {t['reason'].replace('|', '/')} | "
                          + (f"dismissed by {t['dismissed']['reviewer']}" if t.get("dismissed") else
                             f"confirmed by {t['confirmed']['reviewer']}" if t.get("confirmed") else
                             "pending" if is_review_flag(t) else "—")
                          + " |" for t in wrong]
                if any(is_review_flag(t) and not t.get("dismissed") and not t.get("confirmed") for t in wrong):
                    lines += ["", f"Model flags marked *pending* can be confirmed or dismissed in "
                                  f"`output/reviews/{a['finding_id']}.json` (decision, reviewer, note); "
                                  f"then run `auditar.py` again. Code answers cannot be dismissed."]
            lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Stage 05: audit the Calculator's findings.")
    ap.add_argument("--findings", type=Path, default=ROOT / "stages/04_calcular/output/findings")
    ap.add_argument("--tables", type=Path, default=PSI_DIR, help="original PSI CSVs (default: %(default)s)")
    ap.add_argument("--fiches", type=Path, default=PSI_DIR, help="PSI-XX.json fiches (default: %(default)s)")
    ap.add_argument("--manifest", type=Path, default=PSI_DIR / "manifest.csv")
    ap.add_argument("--out", type=Path, default=ROOT / "stages/05_auditar/output")
    ap.add_argument("--units", type=Path, default=REFERENCES / "unidades-columnas.json")
    ap.add_argument("--coverage", type=Path, default=COVERAGE_FILE)
    ap.add_argument("--environments", type=Path, default=ENVIRONMENTS_MD)
    ap.add_argument("--snapshot", type=Path, default=SNAPSHOT_DIR, help="Calculator snapshot, for sql_query")
    ap.add_argument("--only", help="audit only this finding id, e.g. F-001")
    ap.add_argument("--no-model", action="store_true", help="do not call the local model (C8 fails, manual review)")
    args = ap.parse_args(argv)

    load_dotenv(ROOT / ".env")
    model = None
    if not args.no_model:
        model = OllamaModel(os.environ.get("OLLAMA_URL") or DEFAULT_OLLAMA_URL,
                            os.environ.get("MODELO_AUDITOR") or DEFAULT_MODEL)
    slot = _ModelSlot(model)

    files = sorted(args.findings.glob("F-*.json"))
    if args.only:
        files = [f for f in files if f.stem == args.only]
    if not files:
        print(f"No findings to audit in {args.findings}", file=sys.stderr)
        return 2

    sources = Sources(args.tables, args.fiches, args.manifest, args.units, args.coverage, args.environments)
    sources.snapshot_dir = args.snapshot
    audit_schema = load_schema("audit.schema.json")
    audits_dir = args.out / "audits"
    reviews_dir = args.out / "reviews"
    audits_dir.mkdir(parents=True, exist_ok=True)
    audits, unreadable = [], []
    for f in files:
        raw = f.read_bytes()
        try:
            finding = json.loads(raw.decode("utf-8"))
        except ValueError as e:
            unreadable.append(f"{f.name}: not valid JSON ({e})")
            continue
        if not isinstance(finding, dict) or not re.fullmatch(r"F-\d{3}", str(finding.get("id", ""))) \
                or not _is_type(finding.get("version"), "integer") or finding["version"] < 1:
            unreadable.append(f"{f.name}: missing a valid 'id' or 'version', so the audit cannot point to it")
            continue
        review_path = reviews_dir / f"{finding['id']}.json"
        review = None
        if review_path.is_file():
            try:
                review = json.loads(review_path.read_text(encoding="utf-8"))
            except ValueError as e:
                print(f"{review_path.name}: not valid JSON, ignored ({e})", file=sys.stderr)
        audit = audit_finding(finding, raw, f.stem, sources, slot, review)
        template = review_template(audit, review)
        if template and template != review:
            reviews_dir.mkdir(parents=True, exist_ok=True)
            if review and review.get("finding_sha256") != audit["finding_sha256"]:
                review_path.rename(review_path.with_suffix(".old.json"))  # se guarda, no se borra
            review_path.write_text(json.dumps(template, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        errs = validate(audit, audit_schema)
        if errs:  # error del auditor, no del hallazgo
            raise RuntimeError(f"auditar.py produced an invalid audit for {f.name}: {errs[:5]}")
        (audits_dir / f"{finding['id']}.json").write_text(
            json.dumps(audit, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        audits.append(audit)
        failed = [c["id"] for c in audit["checks"] if c["result"] == "fail"]
        print(f"{finding['id']} v{finding['version']}: {audit['grade']}"
              + (f"  (failed: {', '.join(failed)})" if failed else ""))

    model_note = (f"Model: {model.name}." if model and not slot.error else
                  f"Model not used: {slot.error}. C8 needs manual review.")
    write_summary(args.out / "summary.md", audits, unreadable, model_note)
    for u in unreadable:
        print(f"NOT AUDITED  {u}", file=sys.stderr)
    if slot.error:
        print(f"Note: {slot.error}", file=sys.stderr)
    print(f"Wrote {len(audits)} audits to {audits_dir} and {args.out / 'summary.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
