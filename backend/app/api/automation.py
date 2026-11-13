from datetime import timezone, datetime, date
import hashlib
import json
from pathlib import Path
import shutil
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.exc import IntegrityError
from app.api.deps import require_same_origin
from app.api.local_access import local_owner
from app.api.projects import get_project, git_status
from app.core.database import get_db
from app.models import OAuthConnection
from app.services.github import GitHubClient, GitHubAPIError
from app.core.security import decrypt_secret
from app.models.automation import Workflow, WorkflowRun, WorkspaceTask
from app.models.projects import LocalProject

router = APIRouter(prefix="/api/local-work", dependencies=[Depends(local_owner)])
write = [Depends(require_same_origin)]


def iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat() if value.tzinfo is None else value.isoformat()


def owned(db, model, user, key):
    row = db.query(model).filter_by(id=key, user_id=user.id).one_or_none()
    if row is None:
        raise HTTPException(404, "This item is unavailable in this workspace.")
    return row


def workflow_out(row):
    return {key: getattr(row, key) for key in ("id", "name", "project_id", "action", "instructions", "enabled")}


def run_out(row):
    return {"id": row.id, "workflow_id": row.workflow_id, "name": row.workflow_name,
            "task_id": row.task_id, "output": row.output, "created_at": iso(row.created_at)}


def task_out(row):
    return {"id": row.id, "text": row.text, "due_date": row.due_date, "labels": row.labels, "history": row.history, "done": row.done, "status": "done" if row.done else row.status, "description": row.description, "priority": row.priority, "project_id": row.project_id, "created_at": iso(row.created_at)}


@router.get("/diagnostics")
def diagnostics(user=Depends(local_owner), db=Depends(get_db)):
    github = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
    return {"git": bool(shutil.which("git")), "vscode": bool(shutil.which("code")),
            "github_configured": github is not None,
            "projects": db.query(LocalProject).filter_by(user_id=user.id).count()}


@router.post("/github/verify", dependencies=write)
async def verify_github(user=Depends(local_owner), db=Depends(get_db)):
    row = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
    if not row:
        raise HTTPException(409, "Connect GitHub first.")
    client = GitHubClient(decrypt_secret(row.encrypted_access_token))
    try:
        profile = await client.profile()
        if int(profile["id"]) != user.github_id:
            raise HTTPException(409, "This credential belongs to a different GitHub account.")
        return {"login": profile["login"], "scopes": row.scopes or [], "verified": True}
    except (GitHubAPIError, OSError) as exc:
        raise HTTPException(409, "GitHub could not verify this credential. Check its expiration and network access.") from exc
    finally:
        await client.close()


@router.delete("/github/connection", dependencies=write)
def remove_github(user=Depends(local_owner), db=Depends(get_db)):
    row = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


class WorkflowInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=140)
    project_id: str | None = None
    action: Literal["task", "git_review"] = "task"
    instructions: str = Field(min_length=1, max_length=1000)
    enabled: bool = True


def apply_workflow(row, body, db, user):
    if body.project_id:
        get_project(db, user, body.project_id)
    if body.action == "git_review" and not body.project_id:
        raise HTTPException(422, "Select a project for a Git review.")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    db.add(row)
    db.commit()
    return workflow_out(row)


@router.get("/workflows")
def workflows(user=Depends(local_owner), db=Depends(get_db)):
    rows = db.query(Workflow).filter_by(user_id=user.id).order_by(Workflow.updated_at.desc())
    return [workflow_out(row) for row in rows]


@router.post("/workflows", dependencies=write)
def create_workflow(body: WorkflowInput, user=Depends(local_owner), db=Depends(get_db)):
    return apply_workflow(Workflow(user_id=user.id), body, db, user)


@router.put("/workflows/{wid}", dependencies=write)
def edit_workflow(wid: str, body: WorkflowInput, user=Depends(local_owner), db=Depends(get_db)):
    return apply_workflow(owned(db, Workflow, user, wid), body, db, user)


@router.delete("/workflows/{wid}", dependencies=write)
def remove_workflow(wid: str, user=Depends(local_owner), db=Depends(get_db)):
    db.delete(owned(db, Workflow, user, wid))
    db.commit()
    return {"ok": True}


@router.get("/runs")
def runs(user=Depends(local_owner), db=Depends(get_db)):
    rows = db.query(WorkflowRun).filter_by(user_id=user.id).order_by(WorkflowRun.created_at.desc()).limit(200)
    return [run_out(row) for row in rows]


def preview(row, db, user):
    text = row.instructions
    if row.project_id:
        project = get_project(db, user, row.project_id)
        text = project.name + " · " + text
        if row.action == "git_review":
            status = git_status(Path(project.path))
            if not status["is_repository"]:
                raise HTTPException(409, "This project has no Git repository at its root.")
            changes = status["changes"]
            text += f"\nBranch {status['branch']} · {len(changes)} changed files"
            text += "".join(f"\n{f['status']} {f['path']}" for f in changes[:30])
    material = json.dumps([workflow_out(row), text], sort_keys=True).encode()
    return {"text": text, "revision": hashlib.sha256(material).hexdigest()}


@router.get("/workflows/{wid}/preview")
def preview_workflow(wid: str, user=Depends(local_owner), db=Depends(get_db)):
    return preview(owned(db, Workflow, user, wid), db, user)


class ConfirmRun(BaseModel):
    confirm: bool = False
    revision: str = Field(pattern="^[0-9a-f]{64}$")
    request_id: UUID


@router.post("/workflows/{wid}/run", dependencies=write)
def run_workflow(wid: str, body: ConfirmRun, user=Depends(local_owner), db=Depends(get_db)):
    if not body.confirm:
        raise HTTPException(400, "Review the task and confirm this run.")
    request_id = str(body.request_id)
    row = owned(db, Workflow, user, wid)
    def previous():
        run = db.query(WorkflowRun).filter_by(user_id=user.id, request_id=request_id).one_or_none()
        if run and run.workflow_id != wid:
            raise HTTPException(409, "This request was already used for another workflow.")
        return run
    existing = previous()
    if existing:
        return run_out(existing)
    if not row.enabled:
        raise HTTPException(409, "Enable the workflow before running it.")
    result = preview(row, db, user)
    if result["revision"] != body.revision:
        raise HTTPException(409, "The workflow or project changed. Preview the run again.")
    task = WorkspaceTask(user_id=user.id, text=result["text"], project_id=row.project_id)
    db.add(task)
    db.flush()
    run = WorkflowRun(user_id=user.id, request_id=request_id, workflow_id=wid, workflow_name=row.name,
                      task_id=task.id, output=result["text"])
    db.add(run)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = previous()
        if existing:
            return run_out(existing)
        raise HTTPException(409, "The workflow changed before the task could be created.")
    return run_out(run)


TaskStatus = Literal["backlog", "todo", "in_progress", "review", "done"]
TaskPriority = Literal["low", "normal", "high", "urgent"]


class NewTask(BaseModel):
    due_date: date | None = None
    labels: str = Field(default='',max_length=240)
    status: TaskStatus = "todo"
    priority: TaskPriority = "normal"
    project_id: str | None = None
    description: str = Field(default="", max_length=6000)
    model_config = ConfigDict(str_strip_whitespace=True)
    text: str = Field(min_length=1, max_length=1000)


class TaskUpdate(BaseModel):
    due_date: date | None = None
    labels: str | None = Field(default=None,max_length=240)
    done: bool | None = None
    text: str | None = Field(default=None, min_length=1, max_length=1000)
    description: str | None = Field(default=None, max_length=6000)
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    project_id: str | None = None


@router.get("/tasks")
def tasks(user=Depends(local_owner), db=Depends(get_db)):
    return [task_out(row) for row in db.query(WorkspaceTask).filter_by(user_id=user.id).order_by(WorkspaceTask.created_at.desc())]


@router.post("/tasks", dependencies=write)
def create_task(body: NewTask, user=Depends(local_owner), db=Depends(get_db)):
    if body.project_id:
        get_project(db, user, body.project_id)
    task = WorkspaceTask(user_id=user.id, **body.model_dump(), done=body.status == 'done')
    db.add(task)
    db.commit()
    return task_out(task)


@router.patch("/tasks/{tid}", dependencies=write)
def update_task(tid: str, body: TaskUpdate, user=Depends(local_owner), db=Depends(get_db)):
    task = owned(db, WorkspaceTask, user, tid)
    values = body.model_dump(exclude_unset=True)
    changed = sorted(k for k,v in values.items() if getattr(task,k,None) != v)
    if changed:
        task.history = [*(task.history or []), {'time': datetime.now(timezone.utc).isoformat(), 'fields': changed}][-60:]
    if values.get("project_id"):
        get_project(db, user, values["project_id"])
    if any(value is None for key, value in values.items() if key not in {'project_id','due_date'}):
        raise HTTPException(422, "Choose a valid value.")
    if "status" in values:
        values["done"] = values["status"] == "done"
    elif "done" in values:
        values["status"] = "done" if values["done"] else "todo"
    for key, value in values.items():
        setattr(task, key, value)
    db.commit()
    return task_out(task)


@router.delete("/tasks/{tid}", dependencies=write)
def remove_task(tid: str, user=Depends(local_owner), db=Depends(get_db)):
    db.delete(owned(db, WorkspaceTask, user, tid))
    db.commit()
    return {"ok": True}
