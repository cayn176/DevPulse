import asyncio
import json
import os
from pathlib import Path
import re
from datetime import datetime, timezone
from collections import deque


def now():
    return datetime.now(timezone.utc).isoformat()


def redact(value):
    if isinstance(value, dict):
        return {k: ("[redacted]" if any(word in k.lower().replace("_", "") for word in ("apikey", "accesstoken", "refreshtoken", "idtoken", "secret", "authorization", "cookie")) else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return re.sub(r"(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|github_pat_[A-Za-z0-9_]{15,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9_.-]{20,})", "[redacted]", value)[:200000]
    return value


class RuntimeState:
    def __init__(self, path=None):
        self.path = Path(path) if path else Path(os.environ.get("DEVPULSE_DATA_DIR", Path(__file__).resolve().parents[2] / "data")) / "runtime-sessions.json"
        self.sessions = {}
        self.events = deque(maxlen=2000)
        self.sequence = 0
        self.changed = asyncio.Event()
        self.approvals = {}
        self.locks = {}
        if self.path.exists():
            try:
                self.sessions = json.loads(self.path.read_text(encoding="utf-8"))
                for session in self.sessions.values():
                    if session.get("status") in {"running", "awaiting_approval"}:
                        session["status"] = "interrupted"
            except (ValueError, OSError):
                self.sessions = {}

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(redact(self.sessions), ensure_ascii=False), encoding="utf-8")
        temporary.replace(self.path)

    def emit(self, owner, provider, session_id, kind, data):
        self.sequence += 1
        event = {"seq": self.sequence, "owner": owner, "provider": provider, "session_id": session_id, "type": kind, "data": redact(data), "timestamp": now()}
        self.events.append(event)
        self.changed.set()
        session = self.sessions.get(session_id)
        if session:
            session["updated_at"] = now()
            session["events"] = [*session.get("events", []), {k: v for k, v in event.items() if k != "owner"}][-300:]
        return event

    def register(self, owner, provider, session_id, project_id, cwd, model=None, mode="ask", title="New conversation"):
        session = self.sessions.get(session_id)
        if session and session["owner"] != owner:
            raise ValueError("Session belongs to another account.")
        session = session or {"id": session_id, "owner": owner, "provider": provider, "title": title, "messages": [], "events": [], "created_at": now(), "pinned": False, "archived": False}
        session.update({"project_id": project_id, "cwd": str(Path(cwd).resolve()), "model": model, "mode": mode, "status": "idle", "updated_at": now()})
        self.sessions[session_id] = session
        self.save()
        return session

    def acquire(self, session):
        # Serialize all native agent execution on a registered directory, including Ask.
        key = os.path.normcase(str(Path(session["cwd"]).resolve()))
        if key in self.locks:
            raise ValueError("Another agent is active in this project. Interrupt it or use an isolated Git worktree.")
        self.locks[key] = session["id"]
        session["status"] = "running"
        self.save()

    def release(self, session_id, status="idle"):
        self.locks = {k: v for k, v in self.locks.items() if v != session_id}
        session = self.sessions.get(session_id)
        if session:
            session["status"] = status
            self.save()

    def public(self, session):
        return {k: v for k, v in session.items() if k != "owner"}
