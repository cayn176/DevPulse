from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, Request
import secrets
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.local_access import owner_marker, mark_owner
from app.api.deps import require_same_origin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import digest_secret, encrypt_secret, random_secret
from app.models import User, OAuthConnection, SessionRecord
from app.services.github import GitHubClient, GitHubAPIError
from app.services.sync import sync_public_repositories

router = APIRouter()


class DesktopLogin(BaseModel):
    nonce: str = Field(min_length=16, max_length=256)


def local_session(response, db):
    marker = owner_marker()
    user = db.get(User, marker.read_text(encoding='utf-8')) if marker.is_file() else None
    user = user or db.query(User).filter_by(github_id=-1).one_or_none()
    if user is None:
        user = User(github_id=-1, login="local", name="Local workspace")
        db.add(user)
        db.flush()
    mark_owner(user.id)
    secret = random_secret()
    db.add(SessionRecord(user_id=user.id, secret_hash=digest_secret(secret), expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)))
    db.commit()
    response.set_cookie("devpulse_session", secret, httponly=True, samesite="strict", secure=settings.cookie_secure, max_age=settings.session_ttl_days * 86400, path="/")
    return {"ok": True}


@router.post("/auth/desktop")
def desktop_login(body: DesktopLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    expected = settings.desktop_session_nonce.get_secret_value()
    if not settings.devpulse_desktop or not expected or not secrets.compare_digest(body.nonce, expected) or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(403, "Desktop session could not be verified.")
    return local_session(response, db)


@router.post("/auth/local", dependencies=[Depends(require_same_origin)])
def local_login(request: Request, response: Response, db: Session = Depends(get_db)):
    if settings.app_env != "development" or settings.devpulse_desktop or request.client.host not in {"127.0.0.1", "::1"}:
        raise HTTPException(403, "Local entry is only available on this development computer.")
    return local_session(response, db)


@router.get("/auth/status")
def connection_status():
    return {"device_client_configured": bool(settings.github_client_id), "oauth_ready": bool(not settings.devpulse_desktop and settings.github_client_id and settings.github_client_secret and settings.token_encryption_key),
            "token_ready": bool(settings.token_encryption_key), "callback_url": settings.github_redirect_uri, "frontend_origin": settings.frontend_origin,
            "local_ready": settings.app_env == "development" and not settings.devpulse_desktop}


class TokenLogin(BaseModel):
    token: str = Field(min_length=10, max_length=500)


@router.post("/auth/token", dependencies=[Depends(require_same_origin)])
async def token_login(body: TokenLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    return await finish_token_login(body, request, response, db)


async def finish_token_login(body, request, response, db, scopes=None):
    if not settings.token_encryption_key:
        raise HTTPException(503, "Encryption key is missing. Run the local startup script.")
    github = GitHubClient(body.token.strip())
    try:
        profile = await github.profile()
        user = db.query(User).filter_by(github_id=profile["id"]).one_or_none()
        if user is None:
            local = db.query(SessionRecord).filter_by(secret_hash=digest_secret(request.cookies.get("devpulse_session", ""))).one_or_none()
            candidate = db.get(User, local.user_id) if local and local.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) else None
            if candidate and candidate.github_id < 0:
                user = candidate
                user.github_id = profile["id"]
        if user is None:
            user = User(github_id=profile["id"], login=profile["login"])
            db.add(user)
            db.flush()
        for key in ("login", "name", "avatar_url", "bio"):
            setattr(user, key, profile.get(key))
        connection = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
        if connection is None:
            connection = OAuthConnection(user_id=user.id, encrypted_access_token=encrypt_secret(body.token.strip()))
            db.add(connection)
        connection.encrypted_access_token = encrypt_secret(body.token.strip())
        connection.scopes = scopes if scopes is not None else ["personal-token"]
        secret = random_secret()
        db.add(SessionRecord(user_id=user.id, secret_hash=digest_secret(secret), expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days)))
        db.commit()
        partial = False
        try:
            await sync_public_repositories(db, user.id, connection, github, user.login)
        except GitHubAPIError:
            db.rollback()
            partial = True
        response.set_cookie("devpulse_session", secret, max_age=settings.session_ttl_days * 86400, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
        return {"ok": True, "sync_partial": partial}
    except GitHubAPIError as exc:
        db.rollback()
        raise HTTPException(401 if exc.status_code == 401 else 502, "GitHub rejected the token or could not be reached. Check token permissions and expiration.") from exc
    finally:
        await github.close()
