from unittest.mock import AsyncMock

from app.api import deploy
from app.core.security import decrypt_secret
from app.models.ai import AIConnection
from test_ai_workspace import env


def test_connection_is_verified_before_encrypted_storage_and_scoped_by_user(env, monkeypatch):
    client, db, user = env
    key = "vercel-access-token-for-test"
    remote = AsyncMock(side_effect=[{"user": {"username": "test-user"}}, {"projects": []}])
    monkeypatch.setattr(deploy, "vercel", remote)
    assert client.get("/api/vercel/status").json() == {"connected": False}
    response = client.put("/api/vercel/connection", json={"token": key, "team": "team_unit"})
    assert response.json() == {"connected": True, "username": "test-user"}
    assert key not in response.text
    row = db.query(AIConnection).filter_by(user_id=user.id, provider="vercel").one()
    assert row.encrypted_key != key
    assert decrypt_secret(row.encrypted_key) == key
    assert remote.await_args_list[-1].kwargs["team"] == "team_unit"
    assert client.delete("/api/vercel/connection").status_code == 200
    assert client.get("/api/vercel/status").json() == {"connected": False}
    assert client.get("/api/vercel/deployments").status_code == 409


def connected(client, monkeypatch):
    fake = AsyncMock(side_effect=[{"user": {"username": "test"}}, {"projects": []}])
    monkeypatch.setattr(deploy, "vercel", fake)
    assert client.put("/api/vercel/connection", json={"token": "vercel-unit-key", "team": "team_unit"}).status_code == 200


def test_detail_and_log_metadata_exclude_secrets(env, monkeypatch):
    client, _, _ = env
    connected(client, monkeypatch)
    fake = AsyncMock(side_effect=[
        {"id": "dpl_test", "name": "example", "readyState": "ERROR", "createdAt": 100, "readyStateAt": 220,
         "env": {"LEAK": "private-value"}, "url": "https://user:secret@evil.test", "errorMessage": "TOKEN=private-value",
         "meta": {"githubCommitRef": "test/ref", "githubCommitSha": "ab23", "unrelated": "private-value"}},
        [{"created": 2, "payload": {"text": "DATABASE_URL=postgres://u:pass@example.com/db"}},
         {"created": 1, "payload": {"text": "vercel-unit-key", "private": "hidden metadata"}}],
    ])
    monkeypatch.setattr(deploy, "vercel", fake)
    detail = client.get("/api/vercel/deployments/dpl_test")
    assert detail.status_code == 200
    assert "private-value" not in detail.text and detail.json()["url"] is None
    assert detail.json()["branch"] == "test/ref" and detail.json()["completed_at"] == 220
    logs = client.get("/api/vercel/logs/dpl_test")
    assert logs.json() == [{"created": 1, "text": "[redacted]"}, {"created": 2, "text": "DATABASE_URL=[redacted]"}]
    assert fake.await_args.kwargs["team"] == "team_unit"


def test_confirmed_deploy_and_redeploy_use_reviewed_project_and_origin(env, monkeypatch):
    client, _, _ = env
    connected(client, monkeypatch)
    remote = AsyncMock(side_effect=[
        {"id": "prj_alpha", "name": "alpha", "link": {"type": "github", "repoId": 810}},
        {"id": "dpl_new", "readyState": "QUEUED"},
        {"id": "dpl_old", "name": "alpha"}, {"id": "dpl_next", "readyState": "QUEUED"},
    ])
    monkeypatch.setattr(deploy, "vercel", remote)
    payload = {"project": "prj_alpha", "branch": "develop", "target": "production"}
    assert client.post("/api/vercel/deployments", json=payload).status_code == 400
    assert client.post("/api/vercel/deployments/dpl_old/redeploy", json={}).status_code == 400
    assert client.post("/api/vercel/deployments", json={**payload, "confirm": True}, headers={"Origin": "https://other.test"}).status_code == 403
    remote.assert_not_awaited()
    assert client.post("/api/vercel/deployments", json={**payload, "confirm": True}).json()["id"] == "dpl_new"
    assert remote.await_args.kwargs["payload"] == {"name": "alpha", "project": "prj_alpha", "gitSource": {"type": "github", "repoId": 810, "ref": "develop"}, "target": "production"}
    assert client.post("/api/vercel/deployments/dpl_old/redeploy", json={"confirm": True}).json()["id"] == "dpl_next"
    assert remote.await_args.kwargs["payload"] == {"name": "alpha", "deploymentId": "dpl_old"}


def test_non_github_project_rejects_branch_build(env, monkeypatch):
    client, _, _ = env
    connected(client, monkeypatch)
    remote = AsyncMock(return_value={"name": "test", "id": "prj_beta", "link": {"type": "gitlab"}})
    monkeypatch.setattr(deploy, "vercel", remote)
    result = client.post("/api/vercel/deployments", json={"project": "prj_beta", "branch": "master", "confirm": True})
    assert result.status_code == 409
    remote.assert_awaited_once()
