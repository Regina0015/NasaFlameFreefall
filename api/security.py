"""API key check. Every route except /health needs the X-API-Key header."""
import hmac

from fastapi import Header, HTTPException

from api import config


def require_key(x_api_key: str | None = Header(default=None)) -> None:
    expected = config.api_key()
    if not expected:
        raise HTTPException(503, "API_KEY is not set on the gateway, so it refuses requests. Set it in .env.")
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), expected.encode()):
        raise HTTPException(401, "Missing or wrong X-API-Key header.")
