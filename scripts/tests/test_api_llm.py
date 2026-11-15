"""Tests for the gateway's /llm pass-through (api/routes/llm.py), against a fake Ollama on a local port."""
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

_ENV = dict(os.environ)
from api.main import create_app  # noqa: E402  importing api.main builds the app, which reads .env
os.environ.clear()
os.environ.update(_ENV)

KEY = {"X-API-Key": "test-key"}
MODEL = "gemma4:e4b-it-qat"


class FakeOllama(BaseHTTPRequestHandler):
    received: list = []

    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/tags":
            return self._send(200, {"models": [{"name": MODEL, "model": MODEL}, {"name": "other:7b", "model": "other:7b"}]})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeOllama.received.append((self.path, body))
        if self.path == "/api/chat":
            return self._send(200, {"message": {"role": "assistant", "content": "ok"}, "done": True})
        if self.path == "/api/generate":
            return self._send(200, {"done": True})
        self._send(404, {"error": "not found"})

    def log_message(self, *args):
        pass


class LlmPassThrough(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FakeOllama)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.patches = [
            mock.patch("api.config.load_dotenv", lambda *a, **k: None),
            mock.patch.dict(os.environ, {"API_KEY": "test-key", "MODELO_AUDITOR": MODEL,
                                         "OLLAMA_URL": f"http://127.0.0.1:{cls.server.server_port}"}),
        ]
        for p in cls.patches:
            p.start()
        os.environ.pop("CHAT_MODEL", None)
        cls.client = TestClient(create_app(Path(cls.tmp.name)))

    @classmethod
    def tearDownClass(cls):
        for p in reversed(cls.patches):
            p.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.tmp.cleanup()

    def setUp(self):
        FakeOllama.received.clear()

    def chat(self, **body):
        return self.client.post("/llm/api/chat", json={"model": MODEL, "messages": [{"role": "user", "content": "hi"}],
                                                       **body}, headers=KEY)

    def test_needs_the_key(self):
        self.assertEqual(self.client.get("/llm/api/tags").status_code, 401)
        self.assertEqual(self.client.post("/llm/api/chat", json={"model": MODEL}).status_code, 401)
        self.assertEqual(FakeOllama.received, [])

    def test_tags_show_only_the_allowed_model(self):
        r = self.client.get("/llm/api/tags", headers=KEY)
        self.assertEqual(r.status_code, 200)
        self.assertEqual([m["name"] for m in r.json()["models"]], [MODEL])

    def test_chat_is_passed_on_and_never_streamed(self):
        r = self.chat(stream=True, think=False, options={"temperature": 0})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["message"]["content"], "ok")
        path, sent = FakeOllama.received[0]
        self.assertEqual(path, "/api/chat")
        self.assertIs(sent["stream"], False)

    def test_other_models_and_unknown_fields_are_refused(self):
        self.assertEqual(self.chat(model="other:7b").status_code, 403)
        self.assertEqual(self.chat(raw=True).status_code, 400)
        self.assertEqual(self.client.post("/llm/api/chat", content=b"not json",
                                          headers={**KEY, "Content-Type": "application/json"}).status_code, 400)
        self.assertEqual(FakeOllama.received, [])

    def test_generate_only_preloads(self):
        ok = self.client.post("/llm/api/generate", json={"model": MODEL, "keep_alive": "30m"}, headers=KEY)
        self.assertEqual(ok.status_code, 200)
        refused = self.client.post("/llm/api/generate", json={"model": MODEL, "prompt": "write anything"}, headers=KEY)
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(len(FakeOllama.received), 1)

    def test_ollama_down_is_a_503(self):
        with mock.patch.dict(os.environ, {"OLLAMA_URL": "http://127.0.0.1:9"}):
            self.assertEqual(self.chat().status_code, 503)


if __name__ == "__main__":
    unittest.main()
