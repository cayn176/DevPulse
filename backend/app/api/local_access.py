from pathlib import Path
from fastapi import Depends, HTTPException, Request
from app.api.deps import current_user
from app.core.config import settings


def owner_marker():
    base = settings.devpulse_data_dir or str(Path(__file__).resolve().parents[2] / "data")
    return Path(base) / "workspace-owner"


def mark_owner(user_id):
    marker = owner_marker()
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(str(user_id), encoding="utf-8")


def local_owner(request: Request, user=Depends(current_user)):
    marker = owner_marker()
    if (settings.app_env not in {"desktop", "development"} or
            request.client.host not in {"127.0.0.1", "::1", "testclient"} or
            not (user.github_id < 0 or
                 (marker.is_file() and marker.read_text(encoding="utf-8") == user.id) or
                 (settings.local_agent_github_login and user.login.casefold() == settings.local_agent_github_login.casefold()))):
        raise HTTPException(403, "Local projects and agents are available to the owner of this computer.")
    return user

