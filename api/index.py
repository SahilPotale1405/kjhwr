"""
Vercel Serverless Function Entrypoint for FastAPI Backend
"""
import sys
from pathlib import Path

# Add project root directory to sys.path so 'backend' package imports resolve
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.main import app as fastapi_app


class VercelPathNormalizer:
    """
    Normalizes ASGI request paths on Vercel so both stripped paths (/health)
    and preserved paths (/api/health) resolve correctly to FastAPI route handlers.
    """
    def __init__(self, asgi_app):
        self.app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            path = scope.get("path", "")
            if not path.startswith("/api") and path not in ("/docs", "/openapi.json", "/redoc"):
                scope["path"] = f"/api{path}"
        await self.app(scope, receive, send)


app = VercelPathNormalizer(fastapi_app)

__all__ = ["app"]
