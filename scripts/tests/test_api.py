"""Tests for the Auditor gateway (api/). They run the real auditar.py with --no-model on a real finding."""
import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

_ENV = dict(os.environ)
from api.main import create_app  # noqa: E402  importing api.main builds the app, which reads .env
os.environ.clear()
os.environ.update(_ENV)
from scripts.paths import FINDINGS_DIR

KEY = {"X-API-Key": "test-key"}
FINDING = json.loads((FINDINGS_DIR / "F-001.json").read_text(encoding="utf-8"))


def tampered(fid: str = "F-900") -> dict:
    """A copy of F-001 whose highest O2 is not in the PSI table: the recalculation (C3) must fail."""
    f = copy.deepcopy(FINDING)
    f["id"] = fid
    f["values"]["psi25_o2_max"]["value"] = 25.0
    return f


# Tests never read the developer's real .env (it can hold AUDITOR_URL, which would leak into later tests).
_NO_DOTENV = [mock.patch("api.config.load_dotenv", lambda *a, **k: None),
              mock.patch("scripts.auditar.load_dotenv", lambda *a, **k: None)]


def setUpModule():
    for patch in _NO_DOTENV:
        patch.start()


def tearDownModule():
    for patch in _NO_DOTENV:
        patch.stop()


class GatewayCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.env = mock.patch.dict(os.environ, {"API_KEY": "test-key"})
        cls.env.start()
        cls.client = TestClient(create_app(Path(cls.tmp.name)))
        cls.audit = cls.client.post("/audit", json={"finding": FINDING, "use_model": False}, headers=KEY)
        cls.rejected = cls.client.post("/audit", json={"finding": tampered(), "use_model": False}, headers=KEY)

    @classmethod
    def tearDownClass(cls):
        cls.env.stop()
        cls.tmp.cleanup()


class AuthTest(GatewayCase):
    def test_health_is_open(self):
        with mock.patch("api.routes.health.check_ollama", return_value={"reachable": False, "model": "m", "model_available": False}):
            r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "degraded")

    def test_everything_else_needs_the_key(self):
        for path in ("/audits", "/findings", "/audits/F-001", "/findings/F-001"):
            self.assertEqual(self.client.get(path).status_code, 401, path)
            self.assertEqual(self.client.get(path, headers={"X-API-Key": "wrong"}).status_code, 401, path)
        self.assertEqual(self.client.post("/audit", json={"finding": FINDING}).status_code, 401)

    def test_no_key_configured_refuses(self):
        with mock.patch.dict(os.environ, {"API_KEY": ""}):
            self.assertEqual(self.client.get("/audits", headers=KEY).status_code, 503)


class AuditTest(GatewayCase):
    def test_audit_returns_a_grade_with_its_checks(self):
        body = self.audit.json()
        self.assertEqual(self.audit.status_code, 200)
        self.assertEqual((body["status"], body["stored"], body["model_used"]), ("done", "new", False))
        self.assertIn(body["grade"], ("A", "B", "C", "no_data", "rejected"))
        self.assertEqual({c["id"] for c in body["audit"]["checks"]} >= {"C0", "C1", "C2", "C3"}, True)

    def test_no_model_leaves_c8_for_a_person(self):
        self.assertIn("C8", self.audit.json()["failed_checks"])

    def test_rejected_is_a_result_not_an_error(self):
        body = self.rejected.json()
        self.assertEqual(self.rejected.status_code, 200)
        self.assertEqual(body["grade"], "rejected")
        self.assertIn("C3", body["failed_checks"])
        self.assertEqual(body["send_back_to"], "04_calcular")

    def test_resending_the_same_finding_uses_the_audit_on_file(self):
        r = self.client.post("/audit", json={"finding": FINDING, "use_model": False}, headers=KEY)
        self.assertEqual((r.status_code, r.json()["cached"], r.json()["stored"]), (200, True, "same"))

    def test_same_version_with_other_content_is_a_conflict(self):
        other = copy.deepcopy(FINDING)
        other["claim"] = other["claim"] + " (edited)"
        r = self.client.post("/audit", json={"finding": other, "use_model": False}, headers=KEY)
        self.assertEqual(r.status_code, 409)

    def test_older_version_is_a_conflict(self):
        older = copy.deepcopy(FINDING)
        older["version"] = 1
        r = self.client.post("/audit", json={"finding": older, "use_model": False}, headers=KEY)
        self.assertEqual(r.status_code, 409)

    def test_bad_id_or_version_is_422(self):
        for change in ({"id": "F-1"}, {"version": 0}, {"version": "2"}):
            r = self.client.post("/audit", json={"finding": {**FINDING, **change}, "use_model": False}, headers=KEY)
            self.assertEqual(r.status_code, 422, change)

    def test_a_schema_invalid_finding_is_audited_and_rejected(self):
        broken = {"id": "F-901", "version": 1, "claim": "x"}
        r = self.client.post("/audit", json={"finding": broken, "use_model": False}, headers=KEY)
        self.assertEqual((r.status_code, r.json()["grade"]), (200, "rejected"))
        self.assertIn("C0", r.json()["failed_checks"])

    def test_unknown_job(self):
        self.assertEqual(self.client.get("/audits/jobs/nope", headers=KEY).status_code, 404)

    def test_oversized_body(self):
        r = self.client.post("/audit", content=b"x", headers={**KEY, "content-length": "9999999"})
        self.assertEqual(r.status_code, 413)


class ReadTest(GatewayCase):
    def test_audits_lists_grade_and_sha(self):
        rows = {a["finding_id"]: a for a in self.client.get("/audits", headers=KEY).json()["audits"]}
        self.assertEqual(rows["F-900"]["grade"], "rejected")
        self.assertEqual(rows["F-001"]["finding_sha256"], self.audit.json()["finding_sha256"])
        self.assertFalse(rows["F-001"]["stale_audit"])

    def test_findings_hide_rejected_unless_asked(self):
        shown = self.client.get("/findings", headers=KEY).json()
        self.assertNotIn("F-900", [f["finding_id"] for f in shown["findings"]])
        self.assertGreaterEqual(shown["rejected_not_shown"], 1)
        everything = self.client.get("/findings?include_rejected=true", headers=KEY).json()
        self.assertIn("F-900", [f["finding_id"] for f in everything["findings"]])

    def test_findings_filters(self):
        self.assertEqual([f["finding_id"] for f in self.client.get("/findings?investigation=PSI-25", headers=KEY).json()["findings"]], ["F-001"])
        self.assertEqual(self.client.get("/findings?investigation=PSI-999", headers=KEY).json()["findings"], [])
        self.assertEqual(self.client.get("/findings?grade=bogus", headers=KEY).status_code, 422)

    def test_one_finding_and_one_audit(self):
        f = self.client.get("/findings/F-001", headers=KEY).json()
        self.assertEqual(f["finding"]["id"], "F-001")
        self.assertEqual(self.client.get("/audits/F-001", headers=KEY).json()["finding_sha256"], f["finding_sha256"])
        self.assertEqual(self.client.get("/findings/F-404", headers=KEY).status_code, 404)
        self.assertEqual(self.client.get("/audits/bad", headers=KEY).status_code, 404)

    def test_not_found_never_shows_a_path_on_the_gateway_pc(self):
        for path in ("/findings/F-404", "/audits/F-404"):
            detail = self.client.get(path, headers=KEY).json()["detail"]
            self.assertIn("F-404", detail, path)
            self.assertNotIn(self.tmp.name, detail, path)
            self.assertNotIn(os.sep + "findings", detail, path)


class StaleAuditTest(unittest.TestCase):
    def test_a_new_version_has_no_grade_until_it_is_audited(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"API_KEY": "test-key"}):
            client = TestClient(create_app(Path(tmp)))
            client.post("/audit", json={"finding": FINDING, "use_model": False}, headers=KEY)
            store = client.app.state.store
            newer = copy.deepcopy(FINDING)
            newer["version"] = FINDING["version"] + 1
            store.save_finding(newer)  # stored, not audited
            row = client.get("/audits", headers=KEY).json()["audits"][0]
            self.assertEqual((row["grade"], row["stale_audit"]), ("pending audit", True))
            self.assertTrue((Path(tmp) / "findings" / "history" / f"F-001.v{FINDING['version']}.json").is_file())
            self.assertEqual(client.get("/audits/F-001", headers=KEY).json()["grade"], "pending audit")


if __name__ == "__main__":
    unittest.main()
