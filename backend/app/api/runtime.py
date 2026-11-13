import asyncio
import json
from contextlib import suppress
from pathlib import Path
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.api.deps import require_same_origin
from app.api.local_access import local_owner
from app.api.projects import get_project
from app.api.ai import connection
from app.core.security import decrypt_secret
from app.core.database import get_db
from app.runtime.adapters import CodexAdapter, CursorAdapter
from app.runtime.claude import ClaudeAdapter
from app.runtime.transport import RuntimeErrorSafe
from app.runtime.state import RuntimeState, now, redact

state = RuntimeState()
adapters = {}
active = {}
loaded = set()
provider_types = {"codex": CodexAdapter, "claude": ClaudeAdapter, "cursor": CursorAdapter}
router = APIRouter(prefix="/api/runtime", dependencies=[Depends(local_owner)])
write = [Depends(require_same_origin)]


def adapter(provider, owner):
    if provider not in provider_types:
        raise HTTPException(404, "Unknown provider.")
    key = (owner, provider)
    if key not in adapters:
        adapters[key] = provider_types[provider](owner, state)
    return adapters[key]


def session_for(provider, sid, owner):
    session = state.sessions.get(sid)
    if not session or session["owner"] != owner or session["provider"] != provider:
        raise HTTPException(404, "Session not found.")
    return session


def forget_loaded(owner, provider):
    loaded.difference_update({k for k in loaded if k[:2] == (owner, provider)})


@router.get("/providers")
async def providers(user=Depends(local_owner)):
    return [adapter(p, user.id).info() for p in provider_types]


@router.get("/activity")
async def activity(user=Depends(local_owner)):
    return [state.public(s) for s in state.sessions.values() if s["owner"] == user.id and not s.get("hidden")]


@router.get("/approvals")
async def approvals(user=Depends(local_owner)):
    return [{k: v for k, v in row.items() if k not in {"request_id", "owner"}} for row in state.approvals.values() if row["owner"] == user.id]


class Decision(BaseModel):
    decision: Literal["approve", "reject"]
    option_id: str | None = None


@router.post("/approvals/{aid}", dependencies=write)
async def decide(aid: str, body: Decision, user=Depends(local_owner)):
    row = state.approvals.get(aid)
    if not row or row["owner"] != user.id:
        raise HTTPException(404, "Approval expired.")
    await adapter(row["provider"], user.id).decide(row, body.decision, body.option_id)
    state.approvals.pop(aid, None)
    session = state.sessions.get(row["session_id"])
    if session and session["status"] == "awaiting_approval":
        session["status"] = "running"
    return {"ok": True}


@router.get("/events")
async def events(request: Request, after: int = 0, user=Depends(local_owner)):
    owner = user.id
    async def stream():
        cursor = max(after, int(request.headers.get("last-event-id", "0") or 0))
        if cursor > state.sequence:
            cursor = 0
        while not await request.is_disconnected():
            state.changed.clear()
            for e in list(state.events):
                if e["seq"] > cursor and e["owner"] == owner:
                    yield f"id: {e['seq']}\ndata: {json.dumps(state.public(e))}\n\n"
            cursor = state.sequence
            try:
                await asyncio.wait_for(state.changed.wait(), 12)
            except TimeoutError:
                yield ": keepalive\n\n"
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})


@router.post("/{provider}/connect", dependencies=write)
async def connect(provider: str, user=Depends(local_owner), db=Depends(get_db)):
    a = adapter(provider, user.id)
    if provider == "claude":
        a.key = decrypt_secret(connection(db, user, "anthropic").encrypted_key)
    try:
        return await a.connect()
    except Exception as exc:
        await a.dispose()
        a.status = "connection_error"
        a.error = str(exc) if isinstance(exc, RuntimeErrorSafe) else "Connection failed. Check runtime installation, credentials and network access."
        raise HTTPException(409, a.error) from exc


@router.post("/{provider}/login", dependencies=write)
async def login(provider: str, user=Depends(local_owner)):
    a = adapter(provider, user.id)
    if not hasattr(a, "login"):
        raise HTTPException(409, "Configure an API key in Integrations.")
    return await a.login()


@router.post("/{provider}/disconnect", dependencies=write)
async def disconnect(provider: str, user=Depends(local_owner)):
    await adapter(provider, user.id).dispose()
    forget_loaded(user.id, provider)
    for aid, row in list(state.approvals.items()):
        if (row["owner"], row["provider"]) == (user.id, provider):
            state.approvals.pop(aid)
    return {"ok": True}


class SessionBody(BaseModel):
    project_id: str
    model: str | None = Field(default=None, max_length=160)
    mode: str = Field(default="ask", max_length=40)


def validate_options(a, model, mode):
    a.assert_connected()
    if mode not in a.capabilities["modes"] or model and not any(m["id"] == model for m in a.models):
        raise HTTPException(422, "Choose an available mode and model.")


@router.get("/{provider}/sessions")
async def sessions(provider: str, project_id: str, user=Depends(local_owner), db=Depends(get_db)):
    project = get_project(db, user, project_id)
    a = adapter(provider, user.id)
    if a.status == "connected":
        for row in await a.list_sessions(project.path):
            if row.get("cwd") and Path(row["cwd"]).resolve() == Path(project.path).resolve() and row["id"] not in state.sessions:
                state.register(user.id, provider, row["id"], project.id, project.path, title=row.get("title") or "Imported session")
    return {"items": [state.public(s) for s in state.sessions.values() if s["project_id"] == project_id and s["owner"] == user.id and s["provider"] == provider and not s.get("hidden")]}


@router.post("/{provider}/sessions", dependencies=write)
async def create(provider: str, body: SessionBody, user=Depends(local_owner), db=Depends(get_db)):
    project = get_project(db, user, body.project_id)
    a = adapter(provider, user.id)
    validate_options(a, body.model, body.mode)
    sid = await a.create(project.path, body.model, body.mode)
    loaded.add((user.id, provider, sid))
    return state.public(state.register(user.id, provider, sid, project.id, project.path, body.model, body.mode))


@router.get("/{provider}/sessions/{sid}")
async def read(provider: str, sid: str, user=Depends(local_owner)):
    s = session_for(provider, sid, user.id)
    a = adapter(provider, user.id)
    result = state.public(s)
    if a.status == "connected" and not s["messages"]:
        with suppress(RuntimeErrorSafe):
            result["raw_history"] = redact(await a.read(sid))
    return result


@router.post("/{provider}/sessions/{sid}/resume", dependencies=write)
async def resume(provider: str, sid: str, body: SessionBody, user=Depends(local_owner), db=Depends(get_db)):
    s = session_for(provider, sid, user.id)
    project = get_project(db, user, body.project_id)
    if project.id != s["project_id"] or Path(project.path) != Path(s["cwd"]):
        raise HTTPException(409, "Select the project associated with this thread.")
    a = adapter(provider, user.id)
    a.assert_connected()
    if (user.id, provider, sid) not in loaded:
        await a.resume(sid, project.path, s["mode"], s["model"])
        loaded.add((user.id, provider, sid))
    return state.public(s)


class Message(BaseModel):
    text: str = Field(min_length=1, max_length=50000)
    mode: str = "ask"
    model: str | None = None


@router.post("/{provider}/sessions/{sid}/messages", dependencies=write)
async def send(provider: str, sid: str, body: Message, user=Depends(local_owner), db=Depends(get_db)):
    s = session_for(provider, sid, user.id)
    get_project(db, user, s["project_id"])
    a = adapter(provider, user.id)
    validate_options(a, body.model, body.mode)
    if s["archived"] or s.get("hidden"):
        raise HTTPException(409, "Restore this conversation first.")
    if (user.id, provider, sid) not in loaded:
        await a.resume(sid, s["cwd"], body.mode, body.model)
        loaded.add((user.id, provider, sid))
    try:
        state.acquire(s)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    s.update(mode=body.mode, model=body.model)
    s["messages"].append({"role": "user", "text": redact(body.text), "timestamp": now()})
    if s["title"] == "New conversation":
        s["title"] = redact(body.text)[:80]
    state.save()
    async def turn():
        try:
            await a.send_message(s, body.text, body.model, body.mode)
        except Exception as exc:
            a.emit(sid, "error", {"message": str(exc) if isinstance(exc, RuntimeErrorSafe) else "The provider could not complete this turn. Check authentication and reconnect."})
            state.release(sid, "error")
        finally:
            active.pop(sid, None)
    active[sid] = asyncio.create_task(turn())
    return {"accepted": True}


@router.post("/{provider}/sessions/{sid}/interrupt", dependencies=write)
async def interrupt(provider: str, sid: str, user=Depends(local_owner)):
    session_for(provider, sid, user.id)
    await adapter(provider, user.id).interrupt(sid)
    return {"ok": True}


class Edit(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    pinned: bool | None = None
    archived: bool | None = None
    hidden: bool | None = None


@router.patch("/{provider}/sessions/{sid}", dependencies=write)
async def update(provider: str, sid: str, body: Edit, user=Depends(local_owner)):
    s = session_for(provider, sid, user.id)
    if s["status"] in {"running", "awaiting_approval"} and (body.hidden or body.archived):
        raise HTTPException(409, "Interrupt the turn first.")
    s.update(body.model_dump(exclude_none=True))
    state.save()
    return state.public(s)


@router.post("/{provider}/sessions/{sid}/archive", dependencies=write)
async def archive(provider: str, sid: str, user=Depends(local_owner)):
    s = session_for(provider, sid, user.id)
    if s["status"] in {"running", "awaiting_approval"}:
        raise HTTPException(409, "Interrupt the turn first.")
    a = adapter(provider, user.id)
    if a.capabilities.get("archive"):
        a.assert_connected()
        await a.archive(sid)
        loaded.discard((user.id, provider, sid))
    s["archived"] = True
    state.save()
    return {"ok": True}


async def shutdown():
    for a in list(adapters.values()):
        with suppress(Exception):
            await a.dispose()
    for task in list(active.values()):
        task.cancel()

