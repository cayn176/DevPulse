from sqlalchemy import ForeignKey, String, Text, JSON, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime
from app.core.database import Base
from app.models.entities import new_id, utcnow


class AIConnection(Base):
    __tablename__ = "ai_connections"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(30))
    encrypted_key: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(160), default="")


class AIThread(Base):
    __tablename__ = "ai_threads"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    repository: Mapped[str | None] = mapped_column(String(300), nullable=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="idle")
    cursor_agent_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    cursor_run_id: Mapped[str | None] = mapped_column(String(150), nullable=True)
    cursor_result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
