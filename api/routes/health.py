import json
import os
import urllib.request
from importlib.util import find_spec

from fastapi import APIRouter, Request

from api import config
from api.schemas import Health
from scripts.audit_step import PSI_DIR
from scripts.paths import SNAPSHOT_DIR

router = APIRouter()
DEFAULT_MODEL = "gemma4:e4b-it-qat"
DEFAULT_OLLAMA_URL = "http://localhost:11434"


def check_ollama() -> dict:
    url = (os.environ.get("OLLAMA_URL") or DEFAULT_OLLAMA_URL).rstrip("/")
    model = os.environ.get("MODELO_AUDITOR") or DEFAULT_MODEL
    try:
        with urllib.request.urlopen(f"{url}/api/tags", timeout=3) as r:
            names = {m.get("name") for m in json.load(r).get("models", [])}
    except (OSError, ValueError):
        return {"reachable": False, "model": model, "model_available": False}
    return {"reachable": True, "model": model, "model_available": model in names}


@router.get("/health", response_model=Health, summary="Is the Auditor ready? (no API key needed)")
def health(request: Request) -> Health:
    store, queue = request.app.state.store, request.app.state.queue
    ollama = check_ollama()
    duckdb_ok = find_spec("duckdb") is not None
    tables = len(list(PSI_DIR.glob("*.csv"))) - (1 if (PSI_DIR / "manifest.csv").exists() else 0)
    snapshot = (SNAPSHOT_DIR / "tests.csv").is_file()
    ready = ollama["model_available"] and duckdb_ok and tables > 0
    return Health(status="ok" if ready else "degraded", ollama=ollama, duckdb=duckdb_ok, psi_tables=tables,
                  snapshot=snapshot, findings_stored=len(store.finding_ids()), audits_pending=queue.pending(),
                  api_key_set=bool(config.api_key()))
