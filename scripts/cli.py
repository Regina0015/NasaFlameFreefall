"""Small helpers shared by the command-line tools."""
import sys


def utf8_output() -> None:
    """Print UTF-8 even when Windows would use cp1252 for a pipe (PSI text has characters like ≥ and µ)."""
    for stream in (sys.stdout, sys.stderr):
        encoding = (getattr(stream, "encoding", None) or "").lower().replace("-", "").replace("_", "")
        if hasattr(stream, "reconfigure") and encoding != "utf8":
            stream.reconfigure(encoding="utf-8", errors="replace")
