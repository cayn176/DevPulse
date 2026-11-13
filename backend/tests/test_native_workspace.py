import asyncio
from unittest.mock import AsyncMock
from pathlib import Path

import pytest
from fastapi import HTTPException
from app.api import device, projects, runtime
from app.core.config import settings
from app.models.projects import LocalProject
from app.runtime.adapters import CodexAdapter, CursorAdapter
from app.runtime.state import RuntimeState
from app.runtime.transport import child_environment
from test_ai_workspace import env


@pytest.fixture
def workstation(env, monkeypatch, tmp_path):
    client, db, user = env
    monkeypatch.setattr(settings, "local_agent_github_login", user.login)
    monkeypatch.setattr(projects, "WORKSPACE_ROOT", tmp_path / "projects")
    monkeypatch.setattr(runtime, "state", RuntimeState(tmp_path / "runtime.json"))
    monkeypatch.setattr(runtime, "adapters", {})
    row = client.post("/api/projects", json={"name":"native-check","action":"create","confirm":True})
    assert row.status_code == 200, row.text
    return client, row.json(), user


def test_local_routes_deny_remote_account(env, tmp_path, monkeypatch):
    client, _, _ = env
    monkeypatch.setattr(settings, "devpulse_data_dir", str(tmp_path))
    monkeypatch.setattr(settings, "local_agent_github_login", "")
    assert client.get("/api/projects").status_code == 403
    assert client.get("/api/runtime/providers").status_code == 403


def test_editor_git_and_conflict(workstation):
    client, project, _ = workstation
    url = "/api/projects/" + project["id"]
    assert client.get(url + "/tree").json()["items"][0]["name"] == "README.md"
    original = client.get(url + "/file", params={"path":"README.md"}).json()
    write = {"path":"README.md","expected_hash":original["hash"],"content":"# Edited\n"}
    assert client.put(url + "/file", json=write).status_code == 200
    assert client.put(url + "/file", json=write).status_code == 409
    for name in ("../outside.txt",".env.private",".git/config"):
        assert client.get(url+"/file",params={"path":name}).status_code == 403
    assert client.get(url+"/search", params={"q":"Edited"}).json()["matches"][0]["path"] == "README.md"
    args = {"action":"stage","paths":["README.md"]}
    assert client.post(url+"/git",json=args).status_code == 400
    result = client.post(url+"/git",json={**args,"confirm":True})
    assert result.json()["status"]["changes"][0]["staged"]
    assert "+# Edited" in client.get(url+"/diff",params={"path":"README.md","staged":"true"}).json()["diff"]


def test_lock_resume_and_approval_protocol(tmp_path):
    state=RuntimeState(tmp_path/"state.json")
    a=CodexAdapter("owner",state)
    b=CursorAdapter("owner",state)
    a.rpc=AsyncMock()
    b.rpc=AsyncMock()
    s=state.register("owner","codex","one","p",tmp_path,mode="ask")
    second=state.register("owner","cursor","two","p",tmp_path,mode="agent")
    state.acquire(s)
    with pytest.raises(ValueError):
        state.acquire(second)
    asyncio.run(a.on_event({"id":14,"method":"item/fileChange/requestApproval","params":{"threadId":"one"}}))
    approval=next(iter(state.approvals.values()))
    asyncio.run(a.decide(approval,"approve"))
    a.rpc.reply.assert_awaited_once_with(14,{"decision":"decline"})
    asyncio.run(a.on_event({"method":"turn/completed","params":{"threadId":"one","turn":{"status":"completed"}}}))
    state.acquire(second)
    asyncio.run(b.on_event({"method":"session/update","params":{"sessionId":"two","update":{"sessionUpdate":"agent_message_chunk","content":{"text":"hello"}}}}))
    state.save()
    restored=RuntimeState(tmp_path/"state.json")
    assert restored.sessions["two"]["messages"][-1]["text"] == "hello"
    assert restored.sessions["two"]["status"] == "interrupted"


def test_runtime_events_owner_isolation(workstation, tmp_path):
    client, project, user = workstation
    runtime.state.register("someone_else","codex","sid",project["id"],tmp_path)
    assert client.get("/api/runtime/codex/sessions/sid").status_code == 404
    assert client.patch("/api/runtime/codex/sessions/sid",json={"pinned":True}).status_code == 404
    assert client.get("/api/runtime/activity").json() == []


def test_device_code_stays_in_backend(env,monkeypatch):
    client,_,_=env
    monkeypatch.setattr(device,"pending",{})
    mock=AsyncMock(side_effect=[{"device_code":"private-device-code","user_code":"TEST-CODE","interval":5},{"error":"slow_down"}])
    monkeypatch.setattr(device,"github",mock)
    start=client.post("/auth/github/device",json={"client_id":"testapp"})
    assert start.status_code == 200 and "private-device-code" not in start.text
    assert "httponly" in start.headers["set-cookie"].lower()
    assert client.post("/auth/github/device/check").json()["pending"]
    next(iter(device.pending.values()))["next"]=0
    assert client.post("/auth/github/device/check").json()["interval"] == 10
    client.cookies.clear()
    assert client.post("/auth/github/device/check").status_code == 410


def test_child_cannot_inherit_backend_keys(monkeypatch):
    for key in ("TOKEN_ENCRYPTION_KEY","DESKTOP_SESSION_NONCE","GITHUB_CLIENT_SECRET","OPENAI_API_KEY"):
        monkeypatch.setenv(key,"hidden")
        assert key not in child_environment()

