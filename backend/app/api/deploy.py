import re
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path
from pydantic import BaseModel, Field, SecretStr

from app.api.deps import current_user, require_same_origin
from app.core.database import get_db
from app.core.security import decrypt_secret, encrypt_secret
from app.models.ai import AIConnection
from app.runtime.state import redact

router = APIRouter(prefix="/api/vercel")
write = [Depends(require_same_origin)]
DeploymentId = Annotated[str, Path(pattern=r"^dpl_[A-Za-z0-9_-]{1,180}$")]
secret_assignment = re.compile(r"(?i)\b([a-z0-9_]*(?:key|token|secret|password|database_url|connection_string)[a-z0-9_]*)\s*[:=]\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)")
url_credentials = re.compile(r"([a-z][a-z0-9+.-]*://)[^/\s:@]+:[^/\s@]+@", re.I)


def clean_text(value, key=""):
    text = str(value or "")
    if key:
        text = text.replace(key, "[redacted]")
    text = secret_assignment.sub(r"\1=[redacted]", text)
    return redact(url_credentials.sub(r"\1[redacted]@", text))[:8000]


async def vercel(key, method, path, *, team="", params=None, payload=None):
    params = dict(params or {})
    if team:
        params["teamId"] = team
    try:
        async with httpx.AsyncClient(base_url="https://api.vercel.com", timeout=25) as client:
            response = await client.request(method, path, params=params, json=payload, headers={"Authorization": "Bearer " + key})
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Vercel could not be reached. Refresh before retrying.") from exc
    if response.is_error:
        detail = {
            401: "Vercel rejected the token. Replace it in account settings.",
            403: "Vercel denied access. Check your team and project permissions.",
            404: "Vercel could not find this resource in the selected account or team.",
            429: "Vercel rate limit reached. Try again later.",
        }.get(response.status_code, f"Vercel returned HTTP {response.status_code}. Check the project and Git integration.")
        raise HTTPException(response.status_code if response.status_code in {403, 404, 429} else 502, detail)
    return response.json()


def stored(db, user):
    return db.query(AIConnection).filter_by(user_id=user.id, provider="vercel").one_or_none()


def credentials(user=Depends(current_user), db=Depends(get_db)):
    row = stored(db, user)
    if not row:
        raise HTTPException(409, "Connect your Vercel account first.")
    return decrypt_secret(row.encrypted_key), row.model


class Connect(BaseModel):
    token: SecretStr = Field(min_length=8, max_length=2048)
    team: str = Field(default="", max_length=100, pattern=r"^[\w-]*$")


@router.get("/status")
async def status(user=Depends(current_user), db=Depends(get_db)):
    row = stored(db, user)
    if not row:
        return {"connected": False}
    info = await vercel(decrypt_secret(row.encrypted_key), "GET", "/v2/user")
    return {"connected": True, "username": info["user"]["username"], "team": row.model}


@router.put("/connection", dependencies=write)
async def connect(body: Connect, user=Depends(current_user), db=Depends(get_db)):
    key = body.token.get_secret_value().strip()
    info = await vercel(key, "GET", "/v2/user")
    await vercel(key, "GET", "/v9/projects", team=body.team, params={"limit": 1})
    row = stored(db, user) or AIConnection(user_id=user.id, provider="vercel")
    row.encrypted_key, row.model = encrypt_secret(key), body.team
    db.add(row)
    db.commit()
    return {"connected": True, "username": info["user"]["username"]}


@router.delete("/connection", dependencies=write)
def disconnect(user=Depends(current_user), db=Depends(get_db)):
    row = stored(db, user)
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


@router.get("/projects")
async def projects(auth=Depends(credentials)):
    key, team = auth
    data = await vercel(key, "GET", "/v9/projects", team=team, params={"limit": 100})
    return [{"id": p["id"], "name": p["name"], "production_branch": (p.get("link") or {}).get("productionBranch"), "git": (p.get("link") or {}).get("type")} for p in data["projects"]]


@router.get("/projects/{project}/environment")
async def environment_metadata(project: Annotated[str, Path(pattern=r"^prj_[A-Za-z0-9_-]+$")], auth=Depends(credentials)):
    key, team = auth
    data = await vercel(key, "GET", f"/v10/projects/{project}/env", team=team, params={"decrypt": "false"})
    return [{"name": entry["key"], "targets": entry.get("target") or [], "type": entry.get("type"),
             "branch": entry.get("gitBranch"), "updated_at": entry.get("updatedAt")}
            for entry in data.get("envs", []) if entry.get("key")]


def deployment_view(item, key=""):
    meta, source = item.get("meta") or {}, item.get("gitSource") or {}
    state = item.get("readyState") or item.get("state") or "UNKNOWN"
    url = item.get("url") or ""
    domain = url if re.fullmatch(r"(?=.{1,253}$)([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+", url) else None
    return {
        "uid": item.get("uid") or item.get("id"), "project_id": item.get("projectId"),
        "name": item.get("name"), "url": domain, "state": state,
        "target": (item.get("customEnvironment") or {}).get("slug") or item.get("target") or "preview",
        "created": item.get("createdAt") or item.get("created"),
        "building_at": item.get("buildingAt"), "ready_at": item.get("ready") if state == "READY" else None,
        "completed_at": item.get("readyStateAt") if state in {"READY", "ERROR", "CANCELED"} else None,
        "branch": meta.get("githubCommitRef") or source.get("ref"), "sha": meta.get("githubCommitSha") or source.get("sha"),
        "author": meta.get("githubCommitAuthorName") or (item.get("creator") or {}).get("username"),
        "message": clean_text(meta.get("githubCommitMessage"), key),
        "error": clean_text(item.get("errorMessage"), key) if state == "ERROR" else None,
        "error_code": item.get("errorCode") if state == "ERROR" else None,
    }


@router.get("/deployments")
async def deployments(project: str = "", auth=Depends(credentials)):
    key, team = auth
    data = await vercel(key, "GET", "/v6/deployments", team=team, params={"limit": 100, **({"projectId": project} if project else {})})
    return [deployment_view(item, key) for item in data["deployments"]]


@router.get("/deployments/{deployment}")
async def deployment_detail(deployment: DeploymentId, auth=Depends(credentials)):
    key, team = auth
    data = await vercel(key, "GET", "/v13/deployments/" + deployment, team=team)
    return deployment_view(data, key)


@router.get("/logs/{deployment}")
async def logs(deployment: DeploymentId, auth=Depends(credentials)):
    key, team = auth
    rows = await vercel(key, "GET", f"/v3/deployments/{deployment}/events", team=team, params={"limit": 100, "direction": "backward"})
    entries = []
    for row in rows:
        payload = row.get("payload") or {}
        if payload.get("text"):
            entries.append({"created": payload.get("date") or row.get("created"), "text": clean_text(payload["text"], key)})
    return list(reversed(entries))


class Deploy(BaseModel):
    project: str = Field(pattern=r"^prj_[\w-]+$")
    branch: str = Field(min_length=1, max_length=200, pattern=r"^[^\s\x00-\x1f]+$")
    target: Literal["preview", "production"] = "preview"
    confirm: bool = False


@router.post("/deployments", dependencies=write)
async def launch(body: Deploy, auth=Depends(credentials)):
    if not body.confirm:
        raise HTTPException(400, "Review and confirm the deployment.")
    key, team = auth
    project = await vercel(key, "GET", "/v9/projects/" + body.project, team=team)
    link = project.get("link") or {}
    if link.get("type") != "github" or not link.get("repoId"):
        raise HTTPException(409, "Connect this Vercel project to GitHub first.")
    payload = {"name": project["name"], "project": project["id"], "gitSource": {"type": "github", "repoId": link["repoId"], "ref": body.branch}}
    if body.target == "production":
        payload["target"] = "production"
    data = await vercel(key, "POST", "/v13/deployments", team=team, payload=payload)
    return {"id": data["id"], "status": data.get("readyState")}


class Review(BaseModel):
    confirm: bool = False


@router.post("/deployments/{deployment}/redeploy", dependencies=write)
async def redeploy(deployment: DeploymentId, body: Review, auth=Depends(credentials)):
    if not body.confirm:
        raise HTTPException(400, "Review and confirm the redeployment.")
    key, team = auth
    original = await vercel(key, "GET", "/v13/deployments/" + deployment, team=team)
    data = await vercel(key, "POST", "/v13/deployments", team=team,
                        payload={"name": original["name"], "deploymentId": deployment})
    return {"id": data["id"], "status": data.get("readyState")}
