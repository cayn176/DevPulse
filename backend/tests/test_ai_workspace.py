from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
from unittest.mock import Mock

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.main import app
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import digest_secret, encrypt_secret, decrypt_secret
from app.models import User, OAuthConnection, SessionRecord
from app.models.ai import AIConnection, AIThread
from app.api import ai as ai_api, connect as connect_api
from app.services.ai import AIReply, FileEdit, parse_reply

ORIGIN = "http://127.0.0.1:5173"


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(settings, "token_encryption_key", Fernet.generate_key().decode())
    monkeypatch.setattr(settings, "frontend_origin", ORIGIN)
    monkeypatch.setattr(settings, "github_client_id", "")
    monkeypatch.setattr(settings, "github_client_secret", "")
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.connect() as con:
        con.exec_driver_sql("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(engine)
    db = Session(engine, expire_on_commit=False)
    user = User(github_id=123, login="tester")
    db.add(user)
    db.flush()
    db.add(OAuthConnection(user_id=user.id, encrypted_access_token=encrypt_secret("test-github-token"), scopes=["personal-token"]))
    db.add(SessionRecord(user_id=user.id, secret_hash=digest_secret("test-session"), expires_at=datetime.now(timezone.utc) + timedelta(days=1)))
    db.commit()
    def database():
        yield db
    app.dependency_overrides[get_db] = database
    client = TestClient(app, base_url=ORIGIN)
    client.cookies.set("devpulse_session", "test-session")
    client.headers["Origin"] = ORIGIN
    yield client, db, user
    client.close()
    app.dependency_overrides.clear()
    db.close()
    engine.dispose()


def thread(db, user):
    row = AIThread(user_id=user.id, title="Improve README", repository="tester/project")
    db.add(row)
    db.add(AIConnection(user_id=user.id, provider="openai", encrypted_key=encrypt_secret("test-provider-key"), model="test-model"))
    db.commit()
    return row


def test_auth_required_and_cross_origin_rejected(env):
    client, _, _ = env
    assert client.post("/api/ai/threads", json={}, headers={"Origin": "https://other.example"}).status_code == 403
    client.cookies.clear()
    assert client.get("/api/ai/threads").status_code == 401


def test_status_and_token_login(env, monkeypatch):
    client, db, _ = env
    assert client.get("/auth/status").json()["oauth_ready"] is False
    fake = AsyncMock()
    fake.profile.return_value = {"id": 456, "login": "connected", "name": "Connected", "avatar_url": None, "bio": None}
    monkeypatch.setattr(connect_api, "GitHubClient", lambda token: fake)
    monkeypatch.setattr(connect_api, "sync_public_repositories", AsyncMock())
    response = client.post("/auth/token", json={"token": "github-test-personal-token"})
    assert response.status_code == 200
    assert "HttpOnly" in response.headers["set-cookie"]
    user = db.query(User).filter_by(login="connected").one()
    encrypted = db.query(OAuthConnection).filter_by(user_id=user.id).one().encrypted_access_token
    assert encrypted != "github-test-personal-token"
    assert decrypt_secret(encrypted) == "github-test-personal-token"
    assert "github-test-personal-token" not in response.text


def test_provider_keys_never_returned(env):
    client, db, user = env
    secret = "private-provider-api-key"
    assert client.put("/api/ai/connections/openai", json={"key": secret, "model": "test-model"}).status_code == 200
    assert secret not in client.get("/api/ai/connections").text
    row = db.query(AIConnection).filter_by(user_id=user.id).one()
    assert row.encrypted_key != secret
    assert decrypt_secret(row.encrypted_key) == secret


def test_other_user_cannot_access_thread(env):
    client, db, _ = env
    other = User(github_id=999, login="other")
    db.add(other)
    db.flush()
    row = AIThread(user_id=other.id, title="Private chat")
    db.add(row)
    db.commit()
    assert client.get("/api/ai/threads/" + row.id).status_code == 404
    assert client.delete("/api/ai/threads/" + row.id).status_code == 404
    assert "Private chat" not in client.get("/api/ai/threads").text


@pytest.mark.parametrize("path", ["../secret", ".env", "src/.env.local", ".github/workflows/run.yml", "C:/secret", "a\\b", ".git/config"])
def test_unsafe_files_cannot_be_proposed(path):
    with pytest.raises(ValueError):
        FileEdit(path=path, content="bad")


def test_malformed_ai_output_is_text_only():
    assert parse_reply('```json\n{"reply":"hello","files":[]}\n```').reply == "hello"
    assert not parse_reply('{"reply":"oops","files":[{"path":"../secret","content":"x"}]}').files


def test_chat_records_reviewable_diff_with_base_sha(env, monkeypatch):
    client, db, user = env
    row = thread(db, user)
    fake = AsyncMock()
    monkeypatch.setattr(ai_api, "github_for", lambda *_: fake)
    async def github(_client, method, path, body=None):
        if path.endswith("/commits/main"):
            return {"sha": "base123", "commit": {"tree": {"sha": "tree123"}}}
        if "/git/trees/" in path:
            return {"tree": [{"path": "README.md", "type": "blob", "mode": "100644"}]}
        if "/contents/" in path:
            return {"type": "file", "size": 4, "encoding": "base64", "content": "b2xkCg=="}
        return {"default_branch": "main"}
    monkeypatch.setattr(ai_api, "gh", github)
    monkeypatch.setattr(ai_api, "answer", AsyncMock(return_value=AIReply(reply="Proposed update", files=[FileEdit(path="README.md", content="new\n")])))
    response = client.post(f"/api/ai/threads/{row.id}/messages", json={"provider": "openai", "text": "Update readme", "paths": ["README.md"]})
    assert response.status_code == 200, response.text
    proposal = response.json()["messages"][-1]["proposal"]
    assert proposal["base_sha"] == "base123"
    assert "-old" in proposal["files"][0]["diff"] and "+new" in proposal["files"][0]["diff"]
    assert client.get(f"/api/ai/threads/{row.id}").json()["status"] == "idle"


def test_existing_file_without_context_is_not_rewritten(env, monkeypatch):
    client, db, user = env
    row = thread(db, user)
    monkeypatch.setattr(ai_api, "github_for", lambda *_: AsyncMock())
    async def github(_client, method, path, body=None):
        if "/commits/" in path:
            return {"sha": "sha", "commit": {"tree": {"sha": "tree"}}}
        if "/git/trees/" in path:
            return {"tree": [{"path": "important.py", "type": "blob", "mode": "100644"}]}
        return {"default_branch": "main"}
    monkeypatch.setattr(ai_api, "gh", github)
    monkeypatch.setattr(ai_api, "answer", AsyncMock(return_value=AIReply(reply="Edit", files=[FileEdit(path="important.py", content="truncated") ])))
    response = client.post(f"/api/ai/threads/{row.id}/messages", json={"provider": "openai", "text": "Edit"})
    assert response.status_code == 200
    assert response.json()["messages"][-1]["proposal"] is None


@pytest.mark.parametrize("changed", [True, False])
def test_publish_checks_base_and_creates_separate_branch(env, monkeypatch, changed):
    client, db, user = env
    row = thread(db, user)
    row.messages = [{"id": "message-id", "role": "assistant", "text": "Review", "provider": "openai", "proposal": {"base_sha": "old", "base_branch": "main", "files": [{"path": "README.md", "content": "new", "mode": "100644", "diff": "+new"}]}}]
    db.commit()
    github_client = AsyncMock()
    github_client.client.get.return_value = Mock(status_code=404)
    monkeypatch.setattr(ai_api, "github_for", lambda *_: github_client)
    writes = []
    async def github(_client, method, path, body=None):
        if method == "POST":
            writes.append((path, body))
        if path.endswith("/commits/main"):
            return {"sha": "changed" if changed else "old", "commit": {"tree": {"sha": "base-tree"}}}
        if path.endswith("/git/trees"):
            return {"sha": "new-tree"}
        if path.endswith("/git/commits"):
            return {"sha": "new-commit"}
        if "/pulls?" in path:
            return []
        if path.endswith("/pulls"):
            return {"html_url": "https://github.com/tester/project/pull/1"}
        return {"permissions": {"push": True}}
    monkeypatch.setattr(ai_api, "gh", github)
    response = client.post(f"/api/ai/threads/{row.id}/apply/message-id")
    if changed:
        assert response.status_code == 409
        assert writes == []
    else:
        assert response.status_code == 200, response.text
        assert writes[0][1]["base_tree"] == "base-tree"
        assert writes[2][1]["ref"] == "refs/heads/devpulse/message-id"
        assert writes[3][1]["draft"] is True
        count = len(writes)
        assert client.post(f"/api/ai/threads/{row.id}/apply/message-id").status_code == 200
        assert len(writes) == count


def test_cursor_requires_explicit_branch_confirmation(env):
    client, db, user = env
    row = thread(db, user)
    assert client.post(f"/api/ai/threads/{row.id}/cursor", json={"text": "Make changes"}).status_code == 400


def test_validation_errors_do_not_echo_keys(env):
    client, _, _ = env
    response = client.put("/api/ai/connections/openai", json={"key": "secret", "model": "valid"})
    assert response.status_code == 422
    assert "secret" not in response.text
    assert response.headers["cache-control"] == "no-store"
    assert "input" not in response.json()


def test_server_key_is_hidden_and_restricted_to_owner(env, monkeypatch):
    from pydantic import SecretStr
    client, db, user = env
    secret = "server-only-test-key-do-not-expose"
    monkeypatch.setattr(settings, "server_ai_github_login", user.login)
    monkeypatch.setattr(settings, "openai_api_key", SecretStr(secret))
    monkeypatch.setattr(settings, "openai_model", "test-model")
    response = client.get("/api/ai/connections")
    assert secret not in response.text
    assert secret not in repr(settings)
    openai = next(c for c in response.json() if c["provider"] == "openai")
    assert openai["server_managed"] and openai["connected"]
    assert db.query(AIConnection).count() == 0
    assert decrypt_secret(ai_api.connection(db, user, "openai").encrypted_key) == secret
    other = User(id="another-user", login="stranger", github_id=909)
    assert ai_api.server_connection(other, "openai") is None


def test_disconnect_removes_ai_data_and_session(env):
    client, db, user = env
    thread(db, user)
    response = client.delete("/auth/account")
    assert response.status_code == 200, response.text
    assert response.json()["github_revocation_failed"] is True
    assert db.query(AIConnection).count() == 0
    assert db.query(AIThread).count() == 0
    assert db.query(SessionRecord).count() == 0
    assert client.get("/api/me").status_code == 401


def test_oauth_callback_requires_same_browser(env):
    client, _, _ = env
    response = client.get("/auth/github/callback?code=not-a-real-code&state=unbound", follow_redirects=False)
    assert response.status_code == 303
    assert "github_state_invalid" in response.headers["location"]


@pytest.mark.parametrize("provider", ["openai", "anthropic"])
def test_provider_adapter_keeps_key_out_of_prompt(provider, monkeypatch):
    import asyncio
    from app.services import ai as service
    secret = "provider-secret-not-for-prompt"
    payloads = []
    async def remote(method, url, **kwargs):
        payloads.append(kwargs)
        value = '{"reply":"Hello","files":[]}'
        return {"output": [{"content": [{"type": "output_text", "text": value}]}]} if provider == "openai" else {"content": [{"type": "text", "text": value}]}
    monkeypatch.setattr(service, "remote", remote)
    response = asyncio.run(service.answer(provider, secret, "test-model", "User context", "tester"))
    assert response.reply == "Hello"
    assert secret not in str(payloads[0]["body"])
    assert payloads[0]["key"] == secret


def test_managed_chat_uses_the_signed_in_account_and_keeps_keys_out_of_history(env, monkeypatch):
    client, db, user = env
    response = client.post("/api/ai/threads", json={})
    endpoint = "/api/ai/threads/" + response.json()["id"] + "/messages"
    service = AsyncMock(return_value=AIReply(reply="Ready", files=[]))
    monkeypatch.setattr(ai_api, "managed_answer", service)
    response = client.post(endpoint, json={"provider": "managed", "text": "Hello"})
    assert response.status_code == 200
    assert response.json()["messages"][-1]["text"] == "Ready"
    assert service.await_args.args[0] == "test-github-token"
    assert "test-github-token" not in response.text
    db.query(OAuthConnection).filter_by(user_id=user.id).delete()
    db.commit()
    assert client.post(endpoint, json={"provider":"managed","text":"Another turn"}).status_code == 401
    assert service.await_count == 1
