from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import HTTPException
from fastapi.responses import FileResponse
from app.runtime.transport import RuntimeErrorSafe

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from app.api import auth, workspace, connect, ai, projects, runtime, deploy, repo_tools, device, automation
from app.core.config import settings
from app.core.database import engine, SessionLocal
from app.models.ai import AIThread
from app.models import entities  # noqa: F401 - register model metadata for migrations


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.app_env in {"development", "desktop"}:
        # One local API process: recover interrupted request locks after restart.
        with SessionLocal() as db:
            db.query(AIThread).filter(AIThread.status != "idle").update({"status": "idle"})
            db.commit()
    yield
    await runtime.shutdown()
    engine.dispose()


app = FastAPI(
    title="DevPulse API",
    version="0.3.0",
    description="A GitHub-connected developer workspace.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.include_router(auth.router, prefix="/auth", tags=["authentication"])
app.include_router(workspace.router, tags=["workspace"])
app.include_router(connect.router, tags=["connection"])
app.include_router(ai.router, tags=["AI workspace"])
for module in (projects, runtime, deploy, repo_tools, device, automation):
    app.include_router(module.router)


@app.middleware("http")
async def private_response_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith(("/api/", "/auth/")):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Pragma"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_request: Request, exc: RequestValidationError):
    # Pydantic errors normally include the rejected input, which may be a token.
    fields = ", ".join(".".join(str(part) for part in error["loc"][1:]) for error in exc.errors())
    return JSONResponse(status_code=422, content={"detail": "Check the supplied fields: " + fields})


@app.get("/health", tags=["operations"])
def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_error(_request: Request, _exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "An unexpected server error occurred."})


@app.exception_handler(RuntimeErrorSafe)
async def runtime_error(_request, exc):
    return JSONResponse(status_code=409, content={"detail": str(exc)})


if settings.devpulse_frontend_dist:
    frontend = Path(settings.devpulse_frontend_dist).resolve()

    @app.get("/{url:path}", include_in_schema=False)
    async def application(url: str):
        if url.split("/")[0] in {"api", "auth"} or ".." in Path(url).parts:
            raise HTTPException(404)
        target = (frontend / url).resolve()
        if not target.is_relative_to(frontend):
            raise HTTPException(404)
        if target.is_file():
            return FileResponse(target)
        if not url or url.split("/")[0] in {"app", "connect", "privacy", "terms"}:
            return FileResponse(frontend / "index.html")
        raise HTTPException(404)
