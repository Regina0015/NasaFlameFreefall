"""Auditor gateway. Run from the repository root:

  uv run uvicorn api.main:app --host <this PC's Tailscale/LAN address> --port 8000

Needs API_KEY in .env (every route except /health requires it in the X-API-Key header).
"""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import config
from api.jobs import AuditQueue
from api.routes import audit, findings, health, llm
from api.security import require_key
from api.store import Store


class BodyLimit:
    """Refuses a request body over max_bytes by counting the bytes that arrive, so a body sent in
    chunks (no Content-Length) is limited too. The body is read here and handed to the app whole."""

    def __init__(self, app, max_bytes: int):
        self.app, self.max_bytes = app, max_bytes

    @staticmethod
    async def refuse(send, status: int, detail: str) -> None:
        await JSONResponse({"detail": detail}, status_code=status)({"type": "http"}, None, send)

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        length = dict(scope.get("headers") or []).get(b"content-length")
        if length is not None and not length.strip().isdigit():
            return await self.refuse(send, 400, "Content-Length is not a number.")
        if length is not None and int(length) > self.max_bytes:
            return await self.refuse(send, 413, "Request body too large.")
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.max_bytes:
                return await self.refuse(send, 413, "Request body too large.")
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        replayed = False

        async def replay():
            nonlocal replayed
            if replayed:
                return await receive()
            replayed = True
            return {"type": "http.request", "body": b"".join(chunks), "more_body": False}

        await self.app(scope, replay, send)


def create_app(gateway_dir=None) -> FastAPI:
    config.load_dotenv()
    app = FastAPI(
        title="NasaFlameFreefall Auditor gateway",
        version="0.1.0",
        description="Send a finding to the Auditor (stage 05) and read grades. The Auditor reports; it never fixes.",
    )
    app.state.store = Store(gateway_dir or config.gateway_dir())
    app.state.queue = AuditQueue(app.state.store)

    app.add_middleware(BodyLimit, max_bytes=config.MAX_BODY_BYTES)  # added first: CORS wraps its answers
    app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["GET", "POST"],
                       allow_headers=["X-API-Key", "Content-Type"])

    app.include_router(health.router)
    for router in (audit.router, findings.router, llm.router):
        app.include_router(router, dependencies=[Depends(require_key)])
    return app


app = create_app()
