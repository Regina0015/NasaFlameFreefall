"""Auditor gateway. Run from the repository root:

  uv run uvicorn api.main:app --host <this PC's Tailscale/LAN address> --port 8000

Needs API_KEY in .env (every route except /health requires it in the X-API-Key header).
"""
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api import config
from api.jobs import AuditQueue
from api.routes import audit, findings, health
from api.security import require_key
from api.store import Store


def create_app(gateway_dir=None) -> FastAPI:
    config.load_dotenv()
    app = FastAPI(
        title="NasaFlameFreefall Auditor gateway",
        version="0.1.0",
        description="Send a finding to the Auditor (stage 05) and read grades. The Auditor reports; it never fixes.",
    )
    app.state.store = Store(gateway_dir or config.gateway_dir())
    app.state.queue = AuditQueue(app.state.store)

    app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins(), allow_methods=["GET", "POST"],
                       allow_headers=["X-API-Key", "Content-Type"])

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        if int(request.headers.get("content-length") or 0) > config.MAX_BODY_BYTES:
            return JSONResponse({"detail": "Request body too large."}, status_code=413)
        return await call_next(request)

    app.include_router(health.router)
    for router in (audit.router, findings.router):
        app.include_router(router, dependencies=[Depends(require_key)])
    return app


app = create_app()
