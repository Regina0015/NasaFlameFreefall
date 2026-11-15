"""Settings, read from the environment (and .env, without overriding real variables)."""
import os
from pathlib import Path

from scripts.paths import ROOT

DEFAULT_GATEWAY_DIR = ROOT / "stages" / "05_auditar" / "output" / "gateway"
MAX_BODY_BYTES = 1_000_000
SYNC_WAIT_S = 30  # POST /audit answers directly if the audit ends within this time, else 202 + job id
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]  # Vite


def load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_key() -> str:
    return os.environ.get("API_KEY", "")


def gateway_dir() -> Path:
    return Path(os.environ.get("AUDITOR_GATEWAY_DIR") or DEFAULT_GATEWAY_DIR)


def cors_origins() -> list[str]:
    extra = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
    return DEV_ORIGINS + extra
