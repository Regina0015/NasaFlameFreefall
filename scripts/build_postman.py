"""Generate the Postman files for the Auditor gateway.

Usage (from the repository root): uv run python -m scripts.build_postman
Writes postman/NasaFlameFreefall.postman_collection.json, postman/local.postman_environment.json and
postman/openapi.json (the same schema the running gateway serves at /openapi.json).
The sample bodies are real: F-001 from stage 04, and a copy of it with a wrong value that must be rejected.
"""
import copy
import json
import sys
from pathlib import Path

from api.main import create_app
from scripts import findings
from scripts.cli import utf8_output
from scripts.paths import FINDINGS_DIR, ROOT

POSTMAN_DIR = ROOT / "postman"
SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
SAMPLE_ID = "F-001"
BROKEN_ID = "F-900"


def url(path: str, query: dict | None = None) -> dict:
    parts = [p for p in path.strip("/").split("/") if p]
    out = {"raw": "{{base_url}}/" + "/".join(parts), "host": ["{{base_url}}"], "path": parts}
    if query:
        out["query"] = [{"key": k, "value": v} for k, v in query.items()]
        out["raw"] += "?" + "&".join(f"{k}={v}" for k, v in query.items())
    return out


def tests(*lines: str) -> list[dict]:
    return [{"listen": "test", "script": {"type": "text/javascript", "exec": list(lines)}}]


def request(name: str, method: str, path: str, description: str, query: dict | None = None, body: dict | None = None,
            test: list[dict] | None = None, auth: bool = True, response: list | None = None) -> dict:
    req = {"method": method, "header": [], "url": url(path, query), "description": description}
    if body is not None:
        req["header"].append({"key": "Content-Type", "value": "application/json"})
        req["body"] = {"mode": "raw", "raw": json.dumps(body, indent=2, ensure_ascii=False),
                       "options": {"raw": {"language": "json"}}}
    if not auth:
        req["auth"] = {"type": "noauth"}
    item = {"name": name, "request": req, "response": response or []}
    if test:
        item["event"] = test
    return item


def collection(finding: dict) -> dict:
    broken = copy.deepcopy(finding)
    broken["id"] = BROKEN_ID
    broken["values"]["psi25_o2_max"]["value"] = 25.0  # the PSI table's highest O2 is 22.2%: C3 must fail

    audit_ok = tests(
        "pm.test('audited (200) or queued (202)', () => pm.expect([200, 202]).to.include(pm.response.code));",
        "const b = pm.response.json();",
        "pm.collectionVariables.set('finding_id', b.finding_id);",
        "if (b.job_id) pm.collectionVariables.set('job_id', b.job_id);",
        "if (pm.response.code === 200) {",
        "  pm.test('has a grade', () => pm.expect(['A', 'B', 'C', 'no_data', 'rejected']).to.include(b.grade));",
        "  pm.test('lists the checks', () => pm.expect(b.audit.checks.map(c => c.id)).to.include.members(['C0', 'C3']));",
        "}",
    )
    audit_rejected = tests(
        "pm.test('200: rejected is a result, not an error', () => pm.response.to.have.status(200));",
        "const b = pm.response.json();",
        "pm.test('grade is rejected', () => pm.expect(b.grade).to.eql('rejected'));",
        "pm.test('C3 (recalculation) failed', () => pm.expect(b.failed_checks).to.include('C3'));",
        "pm.test('goes back to the Calculator', () => pm.expect(b.send_back_to).to.eql('04_calcular'));",
    )
    return {
        "info": {
            "name": "NasaFlameFreefall - Auditor gateway",
            "description": ("Test the Auditor gateway across machines. Set `base_url` (the Auditor PC's address, for example "
                            "http://100.64.0.1:8000) and `api_key` in the environment. Run folder 'Calculator -> Auditor' "
                            "top to bottom, or any request on its own. Sample findings are real: F-001 and a tampered copy."),
            "schema": SCHEMA,
        },
        "auth": {"type": "apikey", "apikey": [{"key": "key", "value": "X-API-Key", "type": "string"},
                                              {"key": "value", "value": "{{api_key}}", "type": "string"},
                                              {"key": "in", "value": "header", "type": "string"}]},
        "variable": [{"key": "finding_id", "value": SAMPLE_ID}, {"key": "job_id", "value": ""}],
        "item": [
            {"name": "Health", "item": [request(
                "GET /health", "GET", "/health", "No key needed. 'degraded' means Ollama, the model, DuckDB or the PSI tables are missing.",
                auth=False, test=tests(
                    "pm.test('200', () => pm.response.to.have.status(200));",
                    "const b = pm.response.json();",
                    "pm.test('Gemma available', () => pm.expect(b.ollama.model_available).to.be.true);",
                    "pm.test('status ok', () => pm.expect(b.status).to.eql('ok'));"))]},
            {"name": "Audit", "item": [
                request("POST /audit - F-001 with model", "POST", "/audit",
                        "Stores the finding and audits it with Gemma (C8). Answers 200 with the grade, or 202 with a job_id if it takes over 30 s.",
                        body={"finding": finding, "use_model": True}, test=audit_ok),
                request("POST /audit - F-001 code checks only", "POST", "/audit",
                        "use_model=false: C0-C7 and C9 only. C8 stays 'fail' for manual review. reaudit=true audits again even if this exact finding already has an audit.",
                        body={"finding": finding, "use_model": False, "reaudit": True}, test=audit_ok),
                request(f"POST /audit - {BROKEN_ID} tampered (must be rejected)", "POST", "/audit",
                        "F-001 with psi25_o2_max changed to 25.0 (the table says 22.2). Expect grade 'rejected', failed C3, send_back_to 04_calcular.",
                        body={"finding": broken, "use_model": False}, test=audit_rejected),
                request("GET /audits/jobs/{{job_id}}", "GET", "/audits/jobs/{{job_id}}",
                        "Poll a 202 answer. 202 again = still running. Unknown id = 404 (the gateway forgets jobs on restart).",
                        test=tests("pm.test('200 or 202', () => pm.expect([200, 202]).to.include(pm.response.code));")),
            ]},
            {"name": "Findings", "item": [
                request("GET /findings", "GET", "/findings",
                        "Stored findings with grade and failed checks. Rejected ones are hidden (rejected_not_shown counts them).",
                        test=tests("pm.test('200', () => pm.response.to.have.status(200));",
                                   "const b = pm.response.json();",
                                   "pm.test('no rejected finding shown', () => pm.expect(b.findings.map(f => f.grade)).to.not.include('rejected'));")),
                request("GET /findings?include_rejected=true", "GET", "/findings", "Includes rejected findings, for the team (never for the public view).",
                        query={"include_rejected": "true"}, test=tests("pm.test('200', () => pm.response.to.have.status(200));")),
                request("GET /findings?investigation=PSI-25", "GET", "/findings", "Filters: grade (A|B|C|no_data|rejected|pending audit), investigation, include_rejected.",
                        query={"investigation": "PSI-25"}, test=tests("pm.test('200', () => pm.response.to.have.status(200));")),
                request("GET /findings/{{finding_id}}", "GET", "/findings/{{finding_id}}",
                        "One finding with its grade. grade 'pending audit' with stale_audit=true means the stored version has no audit yet.",
                        test=tests("pm.test('200', () => pm.response.to.have.status(200));",
                                   "pm.test('has the finding', () => pm.expect(pm.response.json().finding.id).to.eql(pm.collectionVariables.get('finding_id')));")),
            ]},
            {"name": "Audits", "item": [
                request("GET /audits", "GET", "/audits",
                        "Grade, failed checks, version and SHA-256 of every stored finding. The Chatbot PC matches finding_sha256 against its own copy.",
                        test=tests("pm.test('200', () => pm.response.to.have.status(200));",
                                   "pm.test('rows have a sha', () => pm.response.json().audits.forEach(a => pm.expect(a).to.have.property('finding_sha256')));")),
                request("GET /audits/{{finding_id}}", "GET", "/audits/{{finding_id}}",
                        "The full audit: checks C0-C9 with details, recalculation, text review, model and parameters.",
                        test=tests("pm.test('200', () => pm.response.to.have.status(200));",
                                   "pm.test('has checks', () => pm.expect(pm.response.json().audit.checks.length).to.be.above(0));")),
            ]},
        ],
    }


def environment() -> dict:
    return {
        "name": "NasaFlameFreefall - local",
        "values": [
            {"key": "base_url", "value": "http://localhost:8000", "type": "default", "enabled": True},
            {"key": "api_key", "value": "", "type": "secret", "enabled": True},
            {"key": "finding_id", "value": SAMPLE_ID, "type": "default", "enabled": True},
            {"key": "job_id", "value": "", "type": "default", "enabled": True},
        ],
        "_postman_variable_scope": "environment",
    }


def write(path: Path, data: dict) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")


def main(out_dir: Path = POSTMAN_DIR, findings_dir: Path = FINDINGS_DIR) -> int:
    utf8_output()
    out_dir.mkdir(parents=True, exist_ok=True)
    write(out_dir / "NasaFlameFreefall.postman_collection.json", collection(findings.load(SAMPLE_ID, findings_dir)))
    write(out_dir / "local.postman_environment.json", environment())
    write(out_dir / "openapi.json", create_app(out_dir / ".unused").openapi())
    print(f"Wrote 3 files to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
