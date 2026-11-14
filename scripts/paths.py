"""All repository paths in one place. Every script imports its folders from here."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

PSI_DIR = ROOT / "stages" / "01_ingesta" / "output" / "psi"
SNAPSHOT_DIR = ROOT / "data" / "snapshot"
USER_DIR = ROOT / "data" / "user"
CONFIG_DIR = ROOT / "_config"
SCHEMAS_DIR = ROOT / "schemas"
INVESTIGATOR_OUT = ROOT / "stages" / "03_investigar" / "output"
FINDINGS_DIR = ROOT / "stages" / "04_calcular" / "output" / "findings"
CALCS_DIR = ROOT / "stages" / "04_calcular" / "output" / "calcs"
QUERIES_DIR = ROOT / "stages" / "04_calcular" / "output" / "queries"
