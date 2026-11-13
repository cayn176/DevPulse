import asyncio
from time import monotonic
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from app.api.deps import require_same_origin
from app.api.connect import finish_token_login, TokenLogin
from app.core.config import settings
from app.core.database import get_db
from app.core.security import random_secret, digest_secret

router = APIRouter(prefix="/auth/github/device", dependencies=[Depends(require_same_origin)])
pending = {}


class DeviceStart(BaseModel):
    client_id: str = Field(default="", max_length=80, pattern=r"^[a-zA-Z0-9_.-]*$")


async def github(path, data):
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            reply = await client.post("https://github.com/login/" + path, data=data, headers={"Accept": "application/json"})
            reply.raise_for_status()
            return reply.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(502, "GitHub could not complete device authorization. Check the app client ID and whether device flow is enabled.") from exc


@router.post("")
async def start(body: DeviceStart, response: Response):
    client_id = settings.github_client_id or body.client_id
    if not client_id or not settings.token_encryption_key:
        raise HTTPException(400, "Provide the public client ID of a GitHub OAuth App with device flow enabled.")
    for key, value in list(pending.items()):
        if value["expires"] < monotonic():
            pending.pop(key, None)
    if len(pending) >= 80:
        raise HTTPException(429, "Too many pending sign-ins. Please try again later.")
    data = await github("device/code", {"client_id": client_id, "scope": "read:user"})
    if not data.get("device_code") or not data.get("user_code"):
        raise HTTPException(409, "Check the OAuth app client ID and enable device flow in its GitHub settings.")
    cookie = random_secret()
    interval = max(5, int(data.get("interval", 5)))
    ttl = min(900, int(data.get("expires_in", 900)))
    pending[digest_secret(cookie)] = {"code": data["device_code"], "client_id": client_id, "interval": interval,
        "expires": monotonic() + ttl, "next": monotonic() + interval, "lock": asyncio.Lock()}
    response.set_cookie("devpulse_device", cookie, max_age=ttl, path="/auth/github/device", httponly=True, secure=settings.cookie_secure, samesite="strict")
    return {"user_code": data["user_code"], "verification_uri": "https://github.com/login/device", "interval": interval}


@router.post("/check")
async def poll(request: Request, response: Response, db=Depends(get_db)):
    key = digest_secret(request.cookies.get("devpulse_device", ""))
    flow = pending.get(key)
    if not flow or flow["expires"] < monotonic():
        pending.pop(key, None)
        raise HTTPException(410, "Sign-in expired. Start again.")
    async with flow["lock"]:
        if key not in pending:
            raise HTTPException(410, "This sign-in was already completed.")
        if flow["next"] > monotonic():
            return {"pending": True, "interval": flow["interval"]}
        flow["next"] = monotonic() + flow["interval"]
        data = await github("oauth/access_token", {"client_id": flow["client_id"], "device_code": flow["code"], "grant_type": "urn:ietf:params:oauth:grant-type:device_code"})
        if data.get("error") in {"authorization_pending", "slow_down"}:
            if data["error"] == "slow_down":
                flow["interval"] += 5
                flow["next"] = monotonic() + flow["interval"]
            return {"pending": True, "interval": flow["interval"]}
        pending.pop(key, None)
        if not data.get("access_token"):
            raise HTTPException(403, "GitHub sign-in was declined or expired.")
        return await finish_token_login(TokenLogin(token=data["access_token"]), request, response, db, scopes=data.get("scope", "").replace(",", " ").split() or ["read:user"])
