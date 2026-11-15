"""Stand-in for scripts/auditar.py in tests: writes a grade-B verdict for --only into <--out>/audits/."""
import argparse
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
for name in ("--only", "--findings", "--out", "--tables", "--fiches"):
    parser.add_argument(name)
args, _ = parser.parse_known_args()
data = (Path(args.findings) / f"{args.only}.json").read_bytes()
finding = json.loads(data)
verdict = {"finding_id": finding["id"], "finding_version": finding["version"],
           "finding_sha256": hashlib.sha256(data).hexdigest(), "grade": "B",
           "checks": [{"id": "C5", "result": "fail"}]}
out = Path(args.out) / "audits"
out.mkdir(parents=True, exist_ok=True)
(out / f"{args.only}.json").write_text(json.dumps(verdict), encoding="utf-8")
