from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Literal
import re
import base64
from app.api.ai import github_for, gh
from app.api.deps import current_user, require_same_origin
from app.core.database import get_db

router = APIRouter(prefix="/api/repo-tools")


def root(owner, repo):
    if not all(re.fullmatch(r"[a-zA-Z0-9_.-]+", s) and s not in {".", ".."} for s in (owner, repo)):
        raise HTTPException(422, "Invalid repository.")
    return f"/repos/{owner}/{repo}"


@router.get("/{owner}/{repo}/{kind}")
async def resources(owner: str, repo: str, kind: Literal["branches", "commits", "pulls", "issues", "readme", "actions", "settings"], user=Depends(current_user), db=Depends(get_db)):
    github = github_for(db, user)
    try:
        if kind == "actions":
            data = await gh(github, "GET", root(owner, repo) + "/actions/runs?per_page=30")
            return [{"id": run["id"], "title": run.get("display_title") or run.get("name"), "text": " · ".join(str(v) for v in (run.get("head_branch"), run.get("conclusion") or run.get("status"), run.get("created_at")) if v), "url": run.get("html_url")} for run in data.get("workflow_runs", [])]
        if kind == "settings":
            data = await gh(github, "GET", root(owner, repo))
            keys = {"visibility": "Visibility", "default_branch": "Default branch", "archived": "Archived", "has_issues": "Issue tracking", "has_wiki": "Wiki", "allow_merge_commit": "Merge commits", "delete_branch_on_merge": "Delete branch after merge"}
            return [{"id": key, "title": title, "text": str(data[key])} for key, title in keys.items() if key in data]
        if kind == "readme":
            data = await gh(github, "GET", root(owner, repo) + "/readme")
            if data.get("encoding") != "base64" or data.get("size", 0) > 256000:
                raise HTTPException(422, "README preview is limited to 256 KB.")
            return [{"id": data["sha"], "title": data["name"], "text": base64.b64decode(data["content"]).decode("utf-8", errors="replace"), "url": data["html_url"]}]
        data = await gh(github, "GET", root(owner, repo) + "/" + kind + "?per_page=30")
        return [{"title": r.get("title") or r.get("name") or r.get("commit", {}).get("message", ""), "id": r.get("number") or r.get("sha") or r.get("name"), "url": r.get("html_url")} for r in data if kind != "issues" or "pull_request" not in r]
    finally:
        await github.close()


@router.get("/{owner}/{repo}/{kind}/{reference}")
async def detail(owner: str, repo: str, kind: Literal["issues","pulls","commits"], reference: str, user=Depends(current_user), db=Depends(get_db)):
    if not re.fullmatch(r"[a-fA-F0-9]{7,40}" if kind == "commits" else r"[1-9][0-9]{0,10}", reference):
        raise HTTPException(422, "Invalid GitHub reference.")
    github = github_for(db, user)
    try:
        entry = await gh(github, "GET", root(owner, repo) + "/" + kind + "/" + reference)
        return {"title": entry.get("title") or entry.get("commit", {}).get("message", ""), "text": (entry.get("body") or "")[:60000],
                "url": entry.get("html_url"), "state": entry.get("state"), "author": (entry.get("user") or entry.get("author") or {}).get("login"),
                "branch": (entry.get("head") or {}).get("ref"), "base": (entry.get("base") or {}).get("ref"),
                "files": [{"name": f["filename"], "added": f.get("additions"), "removed": f.get("deletions")} for f in entry.get("files", [])[:100]]}
    finally:
        await github.close()


class Issue(BaseModel):
    title: str = Field(min_length=1, max_length=256)
    body: str = Field(default="", max_length=20000)
    confirm: bool = False


@router.post("/{owner}/{repo}/issues", dependencies=[Depends(require_same_origin)])
async def issue(owner: str, repo: str, body: Issue, user=Depends(current_user), db=Depends(get_db)):
    if not body.confirm:
        raise HTTPException(400, "Confirm issue creation.")
    github = github_for(db, user)
    try:
        data = await gh(github, "POST", root(owner, repo) + "/issues", {"title": body.title, "body": body.body})
        return {"number": data["number"], "url": data["html_url"]}
    finally:
        await github.close()

