"""Download the 24 PSI combustion investigation records and their test tables.

No login is needed. Each record is trimmed to the facts the agents use (the full
response lists hundreds of files) and saved as PSI-XX.json; each experimental
table CSV is saved under its original file name. manifest.csv lists every file
with its URL, SHA-256, size and download time.

Usage: uv run python -m scripts.fetch_psi
"""
import csv
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from scripts.paths import PSI_DIR

COMBUSTION_IDS = [
    "PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159",
    "PSI-69", "PSI-68", "PSI-39", "PSI-26", "PSI-25", "PSI-107",
    "PSI-106", "PSI-98", "PSI-99", "PSI-100", "PSI-102", "PSI-101",
    "PSI-47", "PSI-60", "PSI-62", "PSI-115", "PSI-117", "PSI-142",
]

RECORD_URL = "https://psi.nasa.gov/geode-py/ws/repo/investigations/{accession}"
DOWNLOAD_URL = "https://psi.nasa.gov/geode-py/ws/studies/{accession}/download?source=datamanager&file={file}"
USER_AGENT = "nasatwisters-hackathon/0.1"
TIMEOUT_S = 60

KEEP_FIELDS = [
    "accession", "investigationAcronym", "title", "doi", "projectType", "researchArea",
    "subResearchArea", "flightProgram", "experimentHardware", "managingNasaCenter",
    "investigationStartDate", "investigationEndDate", "objective", "approach", "hypothesis",
    "researchImpacts", "related_glds", "licenseIdentifier", "modifiedDate", "version",
]


def trim_record(record: dict) -> dict:
    """Keep only the facts the agents use; reduce publications and tables."""
    trimmed = {k: record[k] for k in KEEP_FIELDS if k in record}
    trimmed["publications"] = [
        {"title": p.get("title", ""), "authorList": p.get("authorList", ""), "doi": p.get("doi", "")}
        for p in record.get("publications", [])
    ]
    trimmed["experimentalTable"] = table_files(record)
    return trimmed


def table_files(record: dict) -> list[str]:
    return [t["file_name"] for t in record.get("experimentalTable", []) if t.get("file_name")]


def download_url(accession: str, file_name: str) -> str:
    return DOWNLOAD_URL.format(accession=accession, file=urllib.parse.quote(file_name))


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
        return response.read()


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    PSI_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []
    failures = 0
    for accession in COMBUSTION_IDS:
        url = RECORD_URL.format(accession=accession)
        try:
            body = _get(url)
        except Exception as error:  # network errors are reported, not fatal
            print(f"FAILED {accession} record: {error}", file=sys.stderr)
            failures += 1
            continue
        record = json.loads(body.decode("utf-8"))
        trimmed = trim_record(record)
        fetched_at = _now()
        trimmed["_source"] = {"url": url, "sha256": hashlib.sha256(body).hexdigest(), "fetched_at": fetched_at}
        record_path = PSI_DIR / f"{accession}.json"
        record_path.write_text(json.dumps(trimmed, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
                               encoding="utf-8", newline="\n")
        manifest.append({"file": record_path.name, "url": url, "sha256": trimmed["_source"]["sha256"],
                         "bytes": len(body), "fetched_at": fetched_at})
        for file_name in trimmed["experimentalTable"]:
            table_url = download_url(accession, file_name)
            try:
                data = _get(table_url)
            except Exception as error:
                print(f"FAILED {accession} table {file_name}: {error}", file=sys.stderr)
                failures += 1
                continue
            (PSI_DIR / file_name).write_bytes(data)
            manifest.append({"file": file_name, "url": table_url, "sha256": hashlib.sha256(data).hexdigest(),
                             "bytes": len(data), "fetched_at": _now()})
        print(f"ok {accession}: {len(trimmed['experimentalTable'])} table(s)")
    with open(PSI_DIR / "manifest.csv", "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["file", "url", "sha256", "bytes", "fetched_at"], lineterminator="\n")
        writer.writeheader()
        writer.writerows(manifest)
    print(f"{len(manifest)} files in manifest; {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
