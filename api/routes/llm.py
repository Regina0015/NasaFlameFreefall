"""The dashboard chat's model, reached through the gateway: a narrow pass-through to this PC's Ollama.

The dashboard chat (dashboard/chat/) talks the Ollama API. With OLLAMA_URL=http://<gateway>:8000/llm and the
gateway key in OLLAMA_API_KEY, it uses the model on this PC without opening Ollama's own port, which has no
password. Like every route but /health, these need the X-API-Key header (mounted with require_key in main.py).

Only three calls are passed on, and only for the configured model (MODELO_AUDITOR, or CHAT_MODEL if set):
  GET  /llm/api/tags      -> which models exist (filtered to the allowed one)
  POST /llm/api/chat      -> one chat answer, never streamed
  POST /llm/api/generate  -> only to preload the model ({model, keep_alive}); no prompt is accepted
Nothing is stored.
"""
import json
import os
import urllib.error
import urllib.request

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from api.routes.health import DEFAULT_MODEL, DEFAULT_OLLAMA_URL

router = APIRouter(prefix="/llm")
CHAT_TIMEOUT_S = 180  # a first answer can include loading the model on the GPU
CHAT_KEYS = {"model", "messages", "stream", "think", "options", "keep_alive", "tools", "format"}


def _ollama_url() -> str:
    return (os.environ.get("OLLAMA_URL") or DEFAULT_OLLAMA_URL).rstrip("/")


def allowed_model() -> str:
    return os.environ.get("CHAT_MODEL") or os.environ.get("MODELO_AUDITOR") or DEFAULT_MODEL


def _forward(method: str, path: str, body: dict | None, timeout: float):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{_ollama_url()}{path}", data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as error:
        try:
            detail = json.load(error)
        except ValueError:
            detail = {"error": f"Ollama answered {error.code}"}
        return error.code, detail
    except (OSError, ValueError):
        raise HTTPException(503, "Ollama is not responding on the gateway PC.") from None


async def _json_body(request: Request) -> dict:
    try:
        body = await request.json()
    except ValueError:
        raise HTTPException(400, "The request body is not JSON.") from None
    if not isinstance(body, dict):
        raise HTTPException(400, "The request body must be a JSON object.")
    if body.get("model") != allowed_model():
        raise HTTPException(403, f"Only the model {allowed_model()} is available here.")
    return body


@router.get("/api/tags", summary="Models the chat may use (only the allowed one)")
def tags():
    status, body = _forward("GET", "/api/tags", None, timeout=5)
    if status != 200:
        return JSONResponse(body, status_code=status)
    models = [m for m in body.get("models", []) if allowed_model() in (m.get("name"), m.get("model"))]
    return {"models": models}


@router.post("/api/chat", summary="One chat answer from the allowed model (not streamed)")
async def chat(request: Request):
    body = await _json_body(request)
    unknown = set(body) - CHAT_KEYS
    if unknown:
        raise HTTPException(400, f"Fields not accepted: {', '.join(sorted(unknown))}.")
    body["stream"] = False
    status, answer = _forward("POST", "/api/chat", body, timeout=CHAT_TIMEOUT_S)
    return JSONResponse(answer, status_code=status)


@router.post("/api/generate", summary="Preload the allowed model on the GPU (no prompt)")
async def preload(request: Request):
    body = await _json_body(request)
    if set(body) - {"model", "keep_alive"}:
        raise HTTPException(400, "Only {model, keep_alive} is accepted here: this call only preloads the model.")
    status, answer = _forward("POST", "/api/generate", {**body, "stream": False}, timeout=60)
    return JSONResponse(answer, status_code=status)
