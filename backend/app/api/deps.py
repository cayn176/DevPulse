from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import digest_secret
from app.models import SessionRecord, User


def require_same_origin(request: Request) -> None:
    if request.headers.get("origin") != settings.frontend_origin:
        raise HTTPException(status_code=403, detail="Request origin is not allowed.")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    session_secret = request.cookies.get("devpulse_session")
    if not session_secret:
        raise HTTPException(status_code=401, detail="Connect GitHub to open this workspace.")
    record = (
        db.query(SessionRecord)
        .filter(SessionRecord.secret_hash == digest_secret(session_secret))
        .one_or_none()
    )
    now = datetime.now(timezone.utc)
    if record is None or record.expires_at.replace(tzinfo=timezone.utc) <= now:
        raise HTTPException(status_code=401, detail="Your session has expired. Sign in again.")
    user = db.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Your session is no longer available.")
    return user
