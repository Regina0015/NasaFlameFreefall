"""Stand-in Auditor for tests: writes a fixed verdict (grade B) next to the finding it is given."""
import json
import sys
from pathlib import Path

finding_path = Path(sys.argv[1])
finding = json.loads(finding_path.read_text(encoding="utf-8"))
verdict = {"finding": finding["id"], "version": finding["version"], "status": "audited", "grade": "B", "checks": []}
out = finding_path.parent / f"{finding['id']}.v{finding['version']}.audit.json"
out.write_text(json.dumps(verdict), encoding="utf-8")
