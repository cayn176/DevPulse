import base64
import difflib
import json
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.deps import current_user, require_same_origin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import encrypt_secret, decrypt_secret
from app.models import User, OAuthConnection
from app.models.ai import AIConnection, AIThread
from app.services.ai import PROVIDERS, safe_path, answer, remote
from app.services.github import GitHubClient
from app.api.local_access import local_owner
from app.services.ai import ollama_models
from app.services.workspace_tools import BUILTIN_HELP, interpret_command, run_tool

router = APIRouter(prefix="/api/ai", dependencies=[Depends(current_user)])


def owned(db, user, thread_id):
    thread = db.query(AIThread).filter_by(id=thread_id, user_id=user.id).one_or_none()
    if not thread:
        raise HTTPException(404, "Conversation not found.")
    return thread


def connection(db, user, provider):
    row = db.query(AIConnection).filter_by(user_id=user.id, provider=provider).one_or_none()
    if not row:
        row = server_connection(user, provider)
    if not row:
        raise HTTPException(400, "Connect this provider in Integrations first.")
    return row


def server_connection(user, provider):
    # Server billing credentials belong to one explicitly configured account.
    if provider not in {"openai", "anthropic", "cursor"} or not settings.server_ai_github_login or user.login.lower() != settings.server_ai_github_login.lower():
        return None
    secret = getattr(settings, provider + "_api_key").get_secret_value()
    model = getattr(settings, provider + "_model", "")
    if not secret or (provider != "cursor" and not model):
        return None
    return AIConnection(user_id=user.id, provider=provider, encrypted_key=encrypt_secret(secret), model=model)


def github_for(db, user):
    row = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
    if not row:
        raise HTTPException(409, 'Connect GitHub to use this operation.')
    return GitHubClient(decrypt_secret(row.encrypted_access_token))


async def gh(client, method, path, body=None):
    try:
        response = await client.client.request(method, path, json=body)
    except Exception as exc:
        raise HTTPException(502, "GitHub could not be reached. Refresh before retrying a write.") from exc
    if response.is_error:
        status = {401: 401, 403: 403, 404: 404, 409: 409, 422: 409, 429: 429}.get(response.status_code, 502)
        raise HTTPException(status,
                            f"GitHub returned HTTP {response.status_code}. Check repository access, token permissions or conflicts.")
    return response.json() if response.content else {}


def thread_out(row):
    return {"id": row.id, "title": row.title, "repository": row.repository, "messages": row.messages,
            "status": row.status, "cursor_agent_id": row.cursor_agent_id, "cursor_run_id": row.cursor_run_id,
            "cursor_result": row.cursor_result, "updated_at": row.updated_at}


@router.get("/connections")
def connections(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = {r.provider: r for r in db.query(AIConnection).filter_by(user_id=user.id).all()}
    server_providers = set()
    for provider in {"openai", "anthropic", "cursor"}:
        if provider not in rows:
            server = server_connection(user, provider)
            if server:
                rows[provider] = server
                server_providers.add(provider)
    return [{"provider": p, "connected": p in rows, "installed": None,
             "model": rows[p].model if p in rows else "", "local_enabled": False,
             "server_managed": p in server_providers} for p in sorted(PROVIDERS)]


class ConnectBody(BaseModel):
    key: str = Field(min_length=10, max_length=1000)
    model: str = Field(default="", max_length=160, pattern=r"^[\w.\-/:]*$")


@router.put("/connections/{provider}", dependencies=[Depends(require_same_origin)])
def connect(provider: str, body: ConnectBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if provider not in {"openai", "anthropic", "cursor"}:
        raise HTTPException(400, "This connection uses a local CLI login.")
    if provider != "cursor" and not body.model:
        raise HTTPException(422, "Enter a model ID available to your API account.")
    row = db.query(AIConnection).filter_by(user_id=user.id, provider=provider).one_or_none()
    if row is None:
        row = AIConnection(user_id=user.id, provider=provider, encrypted_key="", model="")
        db.add(row)
    row.encrypted_key, row.model = encrypt_secret(body.key.strip()), body.model
    db.commit()
    return {"ok": True}


@router.delete("/connections/{provider}", dependencies=[Depends(require_same_origin)])
def disconnect(provider: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if provider not in {"openai", "anthropic", "cursor"}:
        raise HTTPException(404, "Unknown API provider.")
    db.query(AIConnection).filter_by(user_id=user.id, provider=provider).delete()
    db.commit()
    return {"ok": True}


@router.get("/local-models")
async def local_models(user=Depends(local_owner)):
    return {"models": await ollama_models()}


class ThreadBody(BaseModel):
    title: str = Field(default="New conversation", min_length=1, max_length=160)
    repository: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", max_length=300)

    @field_validator("repository")
    @classmethod
    def repository_name(cls, value):
        if value and any(part in {".", ".."} for part in value.split("/")):
            raise ValueError("Invalid repository.")
        return value


@router.get("/threads")
def threads(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [thread_out(row) for row in db.query(AIThread).filter_by(user_id=user.id).order_by(AIThread.updated_at.desc()).limit(100)]


@router.post("/threads", dependencies=[Depends(require_same_origin)])
async def create_thread(body: ThreadBody, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.repository:
        client = github_for(db, user)
        try:
            await gh(client, "GET", "/repos/" + body.repository)
        finally:
            await client.close()
    row = AIThread(user_id=user.id, title=body.title, repository=body.repository)
    db.add(row)
    db.commit()
    return thread_out(row)


@router.get("/threads/{thread_id}")
def get_thread(thread_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return thread_out(owned(db, user, thread_id))


@router.delete("/threads/{thread_id}", dependencies=[Depends(require_same_origin)])
def delete_thread(thread_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = owned(db, user, thread_id)
    if row.status != "idle":
        raise HTTPException(409, "Wait for the active request to finish.")
    db.delete(row)
    db.commit()
    return {"ok": True}


class ChatBody(BaseModel):
    provider: str
    text: str = Field(min_length=1, max_length=16000)
    paths: list[str] = Field(default_factory=list, max_length=8)
    project_id: str | None = Field(default=None, max_length=36)
    model: str | None = Field(default=None, min_length=1, max_length=180)

    @field_validator("paths")
    @classmethod
    def validate_paths(cls, values):
        return [safe_path(v) for v in values]


@router.post("/threads/{thread_id}/messages", dependencies=[Depends(require_same_origin)])
async def chat(thread_id: str, body: ChatBody, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = owned(db, user, thread_id)
    if body.provider not in {"openai", "anthropic", "ollama", "workspace"}:
        raise HTTPException(422, "Choose a supported chat provider.")
    key, model = "", ""
    if body.provider in {"openai", "anthropic"}:
        c = connection(db, user, body.provider)
        key, model = decrypt_secret(c.encrypted_key), c.model
    elif body.provider == "ollama":
        local_owner(request, user)
        model = body.model or settings.ollama_model
        if model not in await ollama_models():
            raise HTTPException(422, "Choose a locally installed Ollama model.")
    if not db.query(AIThread).filter_by(id=row.id, status="idle").update({"status": "running"}):
        raise HTTPException(409, "A request is already running in this conversation.")
    db.commit()
    github = None
    try:
        if body.provider == "workspace":
            command = interpret_command(body.text)
            result = await run_tool(command, request=request, user=user, db=db, repository=row.repository,
                                    project_id=body.project_id) if command else {"text": BUILTIN_HELP}
            return record_turn(db, row, body, result, tool=command.name if command else None)
        github = github_for(db, user) if row.repository else None
        files, tree, sha, branch = {}, [], None, None
        if row.repository:
            root = "/repos/" + row.repository
            repo = await gh(github, "GET", root)
            branch = repo["default_branch"]
            commit = await gh(github, "GET", root + "/commits/" + quote(branch, safe=""))
            sha = commit["sha"]
            tree_response = await gh(github, "GET", root + "/git/trees/" + commit["commit"]["tree"]["sha"] + "?recursive=1")
            tree = tree_response.get("tree", [])
            if tree_response.get("truncated"):
                raise HTTPException(422, "Repository tree is too large for this integration.")
            for path in body.paths:
                data = await gh(github, "GET", root + "/contents/" + quote(path, safe="/") + "?ref=" + sha)
                if not isinstance(data, dict) or data.get("type") != "file" or data.get("size", 0) > 80000 or data.get("encoding") != "base64":
                    raise HTTPException(422, "Select text files smaller than 80 KB.")
                try:
                    files[path] = base64.b64decode(data["content"]).decode("utf-8")
                except (ValueError, UnicodeDecodeError) as exc:
                    raise HTTPException(422, "Only UTF-8 text files can be attached.") from exc
            if sum(len(v) for v in files.values()) > 160000:
                raise HTTPException(422, "Attached context exceeds 160 KB.")
        history = [{"role": m["role"], "text": m["text"]} for m in row.messages[-12:] if not m.get("tool") and m.get("provider") != "workspace"]
        context = {"repository": row.repository, "base_sha": sha, "paths": [t["path"] for t in tree if t["type"] == "blob"][:2000], "attached_files": files,
                   "history": history, "request": body.text}
        reply = await answer(body.provider, key, model, json.dumps(context), user.login)
        db.refresh(row)
        if reply.tool:
            result = await run_tool(reply.tool, request=request, user=user, db=db, repository=row.repository,
                                    project_id=body.project_id)
            return record_turn(db, row, body, result, tool=reply.tool.name)
        edits = []
        existing = {t["path"]: t for t in tree}
        for f in reply.files:
            if f.path in existing and f.path not in files:
                reply.reply += f"\n\nAttach {f.path} before proposing an edit to that existing file."
                continue
            if f.path in existing and existing[f.path].get("mode") not in {"100644", "100755"}:
                continue
            old = files.get(f.path, "")
            edits.append({"path": f.path, "content": f.content, "mode": existing.get(f.path, {}).get("mode", "100644"),
                          "diff": "".join(difflib.unified_diff(old.splitlines(keepends=True), f.content.splitlines(keepends=True), fromfile="a/" + f.path, tofile="b/" + f.path))})
        return record_turn(db, row, body, {"text": reply.reply, "proposal": {"files": edits, "base_sha": sha,
                           "base_branch": branch} if edits else None})
    finally:
        if github:
            await github.close()
        row.status = "idle"
        db.commit()


def record_turn(db, row, body, result, tool=None):
    row.messages = [*row.messages,
                    {"id": str(uuid4()), "role": "user", "text": body.text, "provider": body.provider},
                    {"id": str(uuid4()), "role": "assistant", "provider": body.provider, "tool": tool, **result}]
    if row.title == "New conversation":
        row.title = body.text[:80]
    return {**thread_out(row), "status": "idle"}


class ConfirmIssue(BaseModel):
    confirm: bool = False


@router.post("/threads/{thread_id}/issues/{message_id}", dependencies=[Depends(require_same_origin)])
async def publish_issue(thread_id: str, message_id: str, body: ConfirmIssue, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not body.confirm:
        raise HTTPException(400, "Review the repository and issue before publishing.")
    row = owned(db, user, thread_id)
    messages = json.loads(json.dumps(row.messages))
    message = next((m for m in messages if m["id"] == message_id), {})
    draft = message.get("issue_draft")
    if not draft or not row.repository or draft["repository"] != row.repository:
        raise HTTPException(404, "Issue draft not found.")
    if draft.get("url"):
        return {"url": draft["url"]}
    if draft.get("submitted"):
        raise HTTPException(409, "An earlier request was submitted. Verify the repository on GitHub before preparing another issue.")
    github = github_for(db, user)
    try:
        if not db.query(AIThread).filter_by(id=row.id, status="idle").update({"status": "applying"}):
            raise HTTPException(409, "A request is running.")
        draft["submitted"] = True
        row.messages = json.loads(json.dumps(messages))
        db.commit()
        try:
            response = await gh(github, "POST", "/repos/" + row.repository + "/issues", {"title": draft["title"], "body": draft["body"]})
            draft["url"] = response["html_url"]
            row.messages = messages
            return {"url": draft["url"]}
        finally:
            row.status = "idle"
            db.commit()
    finally:
        await github.close()


@router.post("/threads/{thread_id}/apply/{message_id}", dependencies=[Depends(require_same_origin)])
async def apply_proposal(thread_id: str, message_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = owned(db, user, thread_id)
    if not row.repository:
        raise HTTPException(400, "Create or select a repository before applying changes.")
    messages = json.loads(json.dumps(row.messages))
    message = next((m for m in messages if m["id"] == message_id), None)
    proposal = message.get("proposal") if message else None
    if not proposal or not proposal["files"]:
        raise HTTPException(404, "No change proposal found.")
    if proposal.get("url"):
        return {"url": proposal["url"]}
    if not db.query(AIThread).filter_by(id=row.id, status="idle").update({"status": "applying"}):
        raise HTTPException(409, "A request is already running.")
    db.commit()
    github = github_for(db, user)
    root = "/repos/" + row.repository
    branch = "devpulse/" + message_id
    try:
        repo = await gh(github, "GET", root)
        if not repo.get("permissions", {}).get("push"):
            raise HTTPException(403, "This token needs Contents and Pull requests write permissions on the selected repository.")
        if not proposal.get("branch_created") and not proposal.get("commit_sha"):
            head = await gh(github, "GET", root + "/commits/" + quote(proposal["base_branch"], safe=""))
            if head["sha"] != proposal["base_sha"]:
                raise HTTPException(409, "The base branch changed. Ask the AI to regenerate the proposal using the latest files.")
            tree = await gh(github, "POST", root + "/git/trees", {"base_tree": head["commit"]["tree"]["sha"], "tree": [{"path": safe_path(f["path"]), "mode": f["mode"], "type": "blob", "content": f["content"]} for f in proposal["files"]]})
            commit = await gh(github, "POST", root + "/git/commits", {"message": "DevPulse: " + row.title[:100], "tree": tree["sha"], "parents": [head["sha"]]})
            proposal["commit_sha"] = commit["sha"]
            row.messages = json.loads(json.dumps(messages))
            db.commit()
        if not proposal.get("branch_created"):
            # Keep the commit ID before publishing the ref so retry cannot duplicate work.
            existing_ref = await github.client.get(root + "/git/ref/heads/" + branch)
            if existing_ref.status_code == 404:
                await gh(github, "POST", root + "/git/refs", {"ref": "refs/heads/" + branch, "sha": proposal["commit_sha"]})
            elif existing_ref.is_success and existing_ref.json().get("object", {}).get("sha") == proposal["commit_sha"]:
                pass
            else:
                raise HTTPException(409, "The review branch already exists with different contents or cannot be verified.")
            proposal["branch_created"] = True
            row.messages = json.loads(json.dumps(messages))
            db.commit()
        # Recover a successful PR creation if a response was interrupted.
        pulls = await gh(github, "GET", root + "/pulls?state=all&head=" + quote(row.repository.split("/")[0] + ":" + branch, safe=""))
        pr = pulls[0] if pulls else await gh(github, "POST", root + "/pulls", {"title": "DevPulse: " + row.title[:100], "head": branch, "base": proposal["base_branch"], "body": "Changes reviewed and submitted from DevPulse.", "draft": True})
        proposal["url"] = pr["html_url"]
        row.messages = json.loads(json.dumps(messages))
        db.commit()
        return {"url": proposal["url"]}
    finally:
        await github.close()
        row.status = "idle"
        db.commit()


class NewRepository(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
    description: str = Field(default="", max_length=350)
    private: bool = True


@router.post("/repositories", dependencies=[Depends(require_same_origin)])
async def create_repository(body: NewRepository, user: User = Depends(current_user), db: Session = Depends(get_db)):
    github = github_for(db, user)
    try:
        repo = await gh(github, "POST", "/user/repos", {**body.model_dump(), "auto_init": True})
        return {"full_name": repo["full_name"], "url": repo["html_url"]}
    finally:
        await github.close()


class CursorTask(BaseModel):
    text: str = Field(min_length=1, max_length=16000)
    confirm_branch_writes: bool = False


@router.post("/threads/{thread_id}/cursor", dependencies=[Depends(require_same_origin)])
async def cursor_task(thread_id: str, body: CursorTask, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = owned(db, user, thread_id)
    if not row.repository or not body.confirm_branch_writes:
        raise HTTPException(400, "Select a repository and confirm Cursor can create changes on its own branch.")
    c = connection(db, user, "cursor")
    if not db.query(AIThread).filter_by(id=row.id, status="idle").update({"status": "running"}):
        raise HTTPException(409, "A request is already running.")
    db.commit()
    try:
        prompt = json.dumps({"shared_history": [{"role": m["role"], "text": m["text"]} for m in row.messages[-12:] if not m.get("tool") and m.get("provider") != "workspace"], "request": body.text})
        if row.cursor_agent_id:
            data = await remote("POST", f"https://api.cursor.com/v1/agents/{row.cursor_agent_id}/runs", key=decrypt_secret(c.encrypted_key), provider="cursor", body={"prompt": {"text": prompt}})
        else:
            data = await remote("POST", "https://api.cursor.com/v1/agents", key=decrypt_secret(c.encrypted_key), provider="cursor", body={"prompt": {"text": prompt}, "repos": [{"url": "https://github.com/" + row.repository}], "workOnCurrentBranch": False, "autoCreatePR": False})
            row.cursor_agent_id = data["agent"]["id"]
        row.cursor_run_id = data.get("run", data).get("id")
        row.cursor_result = None
        row.messages = [*row.messages, {"id": str(uuid4()), "role": "user", "text": body.text, "provider": "cursor"}]
        db.commit()
        return thread_out(row)
    finally:
        row.status = "idle"
        db.commit()


@router.post("/threads/{thread_id}/cursor/sync", dependencies=[Depends(require_same_origin)])
async def cursor_sync(thread_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = owned(db, user, thread_id)
    if not row.cursor_agent_id or not row.cursor_run_id:
        raise HTTPException(404, "No Cursor task connected to this conversation.")
    c = connection(db, user, "cursor")
    requested_run_id = row.cursor_run_id
    data = await remote("GET", f"https://api.cursor.com/v1/agents/{row.cursor_agent_id}/runs/{requested_run_id}", key=decrypt_secret(c.encrypted_key), provider="cursor")
    db.refresh(row)
    if row.cursor_run_id != requested_run_id:
        return thread_out(row)
    row.cursor_result = data
    result_id = "cursor-" + row.cursor_run_id
    if data.get("result") and not any(m["id"] == result_id for m in row.messages):
        row.messages = [*row.messages, {"id": result_id, "role": "assistant", "provider": "cursor", "text": json.dumps(data["result"], ensure_ascii=False)}]
    db.commit()
    return thread_out(row)
