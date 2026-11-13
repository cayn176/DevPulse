import asyncio
from unittest.mock import AsyncMock, Mock
import httpx
import pytest

from test_ai_workspace import env
from app.api import ai as api
from app.core.config import settings
from app.models import User
from app.models.ai import AIThread
from app.models.projects import LocalProject
from app.services import ai
from app.services.github import GitHubClient


def new_thread(client):
    response = client.post("/api/ai/threads", json={})
    assert response.status_code == 200
    return "/api/ai/threads/" + response.json()["id"]


def test_projects_only_available_to_owner_and_exclude_other_users(env, tmp_path, monkeypatch):
    client, db, user = env
    other = User(login="other", github_id=797)
    db.add(other)
    db.flush()
    db.add_all([LocalProject(name="My workspace", path=str(tmp_path), user_id=user.id),
                LocalProject(name="Another user's project", path=str(tmp_path), user_id=other.id)])
    db.commit()
    url = new_thread(client)
    command = {"provider": "workspace", "text": "Mostrami i miei progetti"}
    assert client.post(url + "/messages", json=command).status_code == 403
    assert client.get(url).json()["status"] == "idle"
    monkeypatch.setattr(settings, "local_agent_github_login", user.login)
    response = client.post(url + "/messages", json=command)
    assert response.status_code == 200
    reply = response.json()["messages"][-1]
    assert reply["tool"] == "list_projects" and "My workspace" in reply["text"]
    assert "Another user's project" not in response.text


def test_model_proposed_issue_requires_scoped_explicit_confirmation(env, monkeypatch):
    from test_ai_workspace import thread
    client, db, user = env
    row = thread(db, user)
    fake = AsyncMock()
    monkeypatch.setattr(api, "github_for", lambda *_: fake)
    async def gh(_client, method, path, body=None):
        assert method == "GET", "Assistant proposed a write without approval"
        if "/commits/" in path:
            return {"sha":"abc", "commit":{"tree":{"sha":"tree"}}}
        if "/git/trees/" in path:
            return {"tree":[]}
        return {"default_branch":"main"}
    monkeypatch.setattr(api, "gh", gh)
    monkeypatch.setattr(api, "answer", AsyncMock(return_value=ai.AIReply(reply="", tool=ai.ToolRequest(name="prepare_issue", title="Fix build", body="See the CI logs."))))
    url = "/api/ai/threads/" + row.id
    response = client.post(url + "/messages", json={"provider":"openai", "text":"Prepare an issue for the failed build"})
    assert response.status_code == 200
    message = response.json()["messages"][-1]
    assert message["issue_draft"]["title"] == "Fix build"
    confirmation = url + "/issues/" + message["id"]
    assert client.post(confirmation, json={}).status_code == 400
    writes = AsyncMock(return_value={"html_url":"https://github.com/tester/project/issues/3"})
    monkeypatch.setattr(api, "gh", writes)
    assert client.post(confirmation, json={"confirm":True}).status_code == 200
    assert client.post(confirmation, json={"confirm":True}).status_code == 200
    writes.assert_awaited_once_with(fake, "POST", "/repos/tester/project/issues", {"title":"Fix build", "body":"See the CI logs."})


def test_local_model_is_discovered_and_fails_closed(env, monkeypatch):
    client, db, user = env
    monkeypatch.setattr(settings, "local_agent_github_login", user.login)
    monkeypatch.setattr(api, "ollama_models", AsyncMock(return_value=["local-test"]))
    assert client.get("/api/ai/local-models").json() == {"models":["local-test"]}
    url = new_thread(client)
    payload = {"provider":"ollama", "text":"Hello", "model":"arbitrary-uninstalled-model"}
    assert client.post(url + "/messages", json=payload).status_code == 422
    payload["model"] = "local-test"
    request = AsyncMock(return_value={"message":{"content":'{"reply":"Local answer","files":[]}'}})
    monkeypatch.setattr(ai, "ollama_request", request)
    result = client.post(url + "/messages", json=payload)
    assert result.status_code == 200
    assert result.json()["messages"][-1]["text"] == "Local answer"
    assert request.await_args.args[0] == "/api/chat"
    assert request.await_args.args[1]["model"] == "local-test"


def test_tool_results_do_not_enter_external_prompt(env, monkeypatch):
    from test_ai_workspace import thread
    client, db, user = env
    row = thread(db, user)
    row.repository = None
    row.messages = [{"id":"old", "role":"assistant", "provider":"workspace", "tool":"list_projects", "text":"PRIVATE_LOCAL_PROJECT"}]
    db.commit()
    responder = AsyncMock(return_value=ai.AIReply(reply="Hello"))
    monkeypatch.setattr(api,"answer",responder)
    response = client.post("/api/ai/threads/"+row.id+"/messages",json={"provider":"openai","text":"Hello"})
    assert response.status_code == 200
    assert "PRIVATE_LOCAL_PROJECT" not in responder.await_args.args[3]


def test_private_repository_listing_uses_account_authorization():
    client = GitHubClient()
    client.get = AsyncMock(return_value=[{"private":True}])
    async def sync():
        try:
            records = await client.public_repositories("me")
            assert records == [{"private":True}]
            args = client.get.await_args
            assert args.args[0] == "/user/repos"
            assert args.kwargs["params"]["visibility"] == "all"
        finally:
            await client.close()
    asyncio.run(sync())
