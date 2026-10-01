"""Vercel entry point: the whole FastAPI app runs as one serverless function."""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.app.config import get_settings  # noqa: E402
from backend.app.database import engine  # noqa: E402
from backend.app.main import app  # noqa: E402,F401
from backend.app.migrations import migrate_schema  # noqa: E402

settings = get_settings()
if os.environ.get("VERCEL"):
    # Fail at start with a readable reason instead of on the first request.
    if settings.database_url.startswith("sqlite"):
        raise RuntimeError("Set DATABASE_URL to the Neon connection string: the function's disk is read-only.")
    if len(settings.session_secret) < 32:
        raise RuntimeError("Set SESSION_SECRET to a random string of at least 32 characters.")


async def _prepare() -> None:
    # The serverless runtime may not run ASGI startup events, so create the tables on cold start.
    async with engine.begin() as connection:
        await connection.run_sync(migrate_schema)
    await engine.dispose()


asyncio.run(_prepare())
