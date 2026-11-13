from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import secrets
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import current_user, require_same_origin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_pkce_pair, decrypt_secret, digest_secret, encrypt_secret, random_secret
from app.models import OAuthConnection, OAuthState, SessionRecord, User
from app.services.github import GitHubAPIError, GitHubClient
from app.services.sync import sync_public_repositories

router = APIRouter()


def frontend_redirect(error: str | None = None, status: str | None = None) -> RedirectResponse:
    query: dict[str, str] = {}
    if error:
        query["error"] = error
    if status:
        query["status"] = status
    suffix = f"?{urlencode(query)}" if query else ""
    return RedirectResponse(f"{settings.frontend_origin}/{suffix}", status_code=303)


@router.get("/github/start")
def github_start(db: Session = Depends(get_db)):
    if not settings.github_client_id or not settings.github_client_secret or not settings.token_encryption_key:
        return frontend_redirect(error="github_not_configured")
    try:
        verifier, challenge = create_pkce_pair()
        state = random_secret()
        db.query(OAuthState).filter(OAuthState.expires_at < datetime.now(timezone.utc)).delete()
        db.add(
            OAuthState(
                state_hash=digest_secret(state),
                encrypted_code_verifier=encrypt_secret(verifier),
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
            )
        )
        db.commit()
    except RuntimeError:
        db.rollback()
        return frontend_redirect(error="github_not_configured")

    parameters = {
        "client_id": settings.github_client_id,
        "redirect_uri": settings.github_redirect_uri,
        "scope": "read:user",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    response = RedirectResponse(f"https://github.com/login/oauth/authorize?{urlencode(parameters)}", status_code=302)
    response.set_cookie("devpulse_oauth_state", state, max_age=600, httponly=True, secure=settings.cookie_secure, samesite="lax", path="/auth")
    return response


@router.get("/github/callback")
async def github_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    if error:
        return frontend_redirect(error="github_authorization_cancelled")
    if not code or not state:
        return frontend_redirect(error="github_callback_invalid")
    if not secrets.compare_digest(state, request.cookies.get("devpulse_oauth_state", "")):
        return frontend_redirect(error="github_state_invalid")

    record = (
        db.query(OAuthState)
        .filter(OAuthState.state_hash == digest_secret(state))
        .one_or_none()
    )
    if record is None or record.expires_at.replace(tzinfo=timezone.utc) <= datetime.now(timezone.utc):
        if record:
            db.delete(record)
            db.commit()
        return frontend_redirect(error="github_state_invalid")

    verifier = decrypt_secret(record.encrypted_code_verifier)
    db.delete(record)
    db.commit()

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            token_response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                json={
                    "client_id": settings.github_client_id,
                    "client_secret": settings.github_client_secret,
                    "code": code,
                    "redirect_uri": settings.github_redirect_uri,
                    "code_verifier": verifier,
                },
            )
            token_response.raise_for_status()
            token_data = token_response.json()
        access_token = token_data.get("access_token")
        if not access_token:
            return frontend_redirect(error="github_token_exchange_failed")

        github = GitHubClient(access_token)
        try:
            profile = await github.profile()
            github_id = int(profile["id"])
            user = db.query(User).filter(User.github_id == github_id).one_or_none()
            if user is None:
                record = db.query(SessionRecord).filter_by(secret_hash=digest_secret(request.cookies.get("devpulse_session", ""))).one_or_none()
                candidate = db.get(User, record.user_id) if record and record.expires_at.replace(tzinfo=timezone.utc) > datetime.now(timezone.utc) else None
                if candidate and candidate.github_id < 0:
                    user = candidate
                    user.github_id = github_id
                else:
                    user = User(github_id=github_id, login=profile["login"])
                    db.add(user)
                    db.flush()
            user.login = profile["login"]
            user.name = profile.get("name")
            user.avatar_url = profile.get("avatar_url")
            user.bio = profile.get("bio")

            connection = db.query(OAuthConnection).filter(OAuthConnection.user_id == user.id).one_or_none()
            if connection is None:
                connection = OAuthConnection(user_id=user.id, encrypted_access_token=encrypt_secret(access_token))
                db.add(connection)
            connection.encrypted_access_token = encrypt_secret(access_token)
            connection.scopes = token_data.get("scope", "").split() if token_data.get("scope") else []
            db.commit()

            session_secret = random_secret()
            db.add(
                SessionRecord(
                    user_id=user.id,
                    secret_hash=digest_secret(session_secret),
                    expires_at=datetime.now(timezone.utc) + timedelta(days=settings.session_ttl_days),
                )
            )
            db.commit()

            sync_status = "connected"
            try:
                await sync_public_repositories(db, user.id, connection, github, user.login)
            except (GitHubAPIError, httpx.HTTPError):
                db.rollback()
                sync_status = "sync_partial"
        finally:
            await github.close()

        response = frontend_redirect(status=sync_status)
        response.set_cookie(
            "devpulse_session",
            session_secret,
            max_age=settings.session_ttl_days * 86400,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
            path="/",
        )
        return response
    except (httpx.HTTPError, GitHubAPIError, KeyError, ValueError):
        db.rollback()
        return frontend_redirect(error="github_connection_failed")


@router.post("/logout", dependencies=[Depends(require_same_origin)])
def logout(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    secret = request.cookies.get("devpulse_session", "")
    record = db.query(SessionRecord).filter(SessionRecord.secret_hash == digest_secret(secret)).one_or_none()
    if record:
        db.delete(record)
        db.commit()
    response.delete_cookie("devpulse_session", path="/", secure=settings.cookie_secure, httponly=True, samesite="lax")
    return {"ok": True}


@router.delete("/account", dependencies=[Depends(require_same_origin)])
async def disconnect_account(
    request: Request,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    connection = db.query(OAuthConnection).filter(OAuthConnection.user_id == user.id).one_or_none()
    revocation_failed = bool(connection and "personal-token" in connection.scopes)
    if connection and "personal-token" not in connection.scopes and settings.github_client_id and settings.github_client_secret:
        token = decrypt_secret(connection.encrypted_access_token)
        try:
            async with httpx.AsyncClient(timeout=10.0, auth=(settings.github_client_id, settings.github_client_secret)) as client:
                revoke = await client.request("DELETE",
                    f"https://api.github.com/applications/{settings.github_client_id}/grant",
                    json={"access_token": token},
                    headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10"},
                )
                revocation_failed = revoke.status_code >= 400
        except httpx.HTTPError:
            revocation_failed = True

    db.delete(user)
    db.commit()
    response.delete_cookie("devpulse_session", path="/", secure=settings.cookie_secure, httponly=True, samesite="lax")
    return {"ok": True, "github_revocation_failed": revocation_failed}
