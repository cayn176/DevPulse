from pathlib import Path
from uuid import uuid4
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.api import automation as api
from app.core.database import Base
from app.models import User
from app.models.automation import WorkspaceTask, WorkflowRun
from app.models.projects import LocalProject


@pytest.fixture
def workspace(tmp_path):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        owner = User(github_id=-1, login="local")
        other = User(github_id=99, login="other")
        db.add_all([owner, other])
        db.flush()
        project = LocalProject(user_id=owner.id, name="Source", path=str(tmp_path), description="")
        db.add(project)
        db.commit()
        yield db, owner, other, project
    engine.dispose()


def test_review_then_confirm_only_once(workspace):
    db, owner, other, project = workspace
    w = api.create_workflow(api.WorkflowInput(name="Review", instructions="Inspect files", project_id=project.id), owner, db)
    with pytest.raises(HTTPException) as denied:
        api.preview_workflow(w["id"], other, db)
    assert denied.value.status_code == 404
    result = api.preview_workflow(w["id"], owner, db)
    assert not db.query(WorkspaceTask).count()
    body = api.ConfirmRun(confirm=False, revision=result["revision"], request_id=uuid4())
    with pytest.raises(HTTPException) as error:
        api.run_workflow(w["id"], body, owner, db)
    assert error.value.status_code == 400
    body.confirm = True
    first = api.run_workflow(w["id"], body, owner, db)
    repeat = api.run_workflow(w["id"], body, owner, db)
    assert first["id"] == repeat["id"]
    assert db.query(WorkspaceTask).count() == db.query(WorkflowRun).count() == 1
    assert first["output"] == "Source · Inspect files"
    assert not api.tasks(other, db)


def test_changed_git_preview_and_disabled_workflow(workspace, monkeypatch):
    db, owner, _, project = workspace
    changes = []
    monkeypatch.setattr(api, "git_status", lambda root: {"is_repository": True, "branch": "main", "changes": changes})
    body = api.WorkflowInput(name="Review", instructions="Check", action="git_review", project_id=project.id)
    workflow = api.create_workflow(body, owner, db)
    before = api.preview_workflow(workflow["id"], owner, db)
    changes.append({"status": "M", "path": "file.txt"})
    confirmed = api.ConfirmRun(confirm=True, revision=before["revision"], request_id=uuid4())
    with pytest.raises(HTTPException) as stale:
        api.run_workflow(workflow["id"], confirmed, owner, db)
    assert stale.value.status_code == 409
    body.enabled = False
    api.edit_workflow(workflow["id"], body, owner, db)
    with pytest.raises(HTTPException) as disabled:
        api.run_workflow(workflow["id"], confirmed, owner, db)
    assert disabled.value.status_code == 409
    assert db.query(WorkspaceTask).count() == 0
