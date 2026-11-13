from datetime import datetime, date
from sqlalchemy import Date, JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
from app.models.entities import new_id, utcnow


class Workflow(Base):
    __tablename__ = "local_workflows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(140))
    project_id: Mapped[str | None] = mapped_column(ForeignKey("local_projects.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(30))
    instructions: Mapped[str] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class WorkspaceTask(Base):
    __tablename__ = "workspace_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), default="todo")
    priority: Mapped[str] = mapped_column(String(12), default="normal")
    description: Mapped[str] = mapped_column(Text, default="")
    project_id: Mapped[str | None] = mapped_column(ForeignKey("local_projects.id", ondelete="SET NULL"))
    due_date: Mapped[date | None] = mapped_column(Date)
    labels: Mapped[str] = mapped_column(String(240), default="")
    history: Mapped[list] = mapped_column(JSON, default=list)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class WorkflowRun(Base):
    __tablename__ = "local_workflow_runs"
    __table_args__ = (UniqueConstraint("user_id", "request_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    request_id: Mapped[str] = mapped_column(String(36))
    workflow_id: Mapped[str | None] = mapped_column(ForeignKey("local_workflows.id", ondelete="SET NULL"), index=True)
    workflow_name: Mapped[str] = mapped_column(String(140))
    task_id: Mapped[str | None] = mapped_column(ForeignKey("workspace_tasks.id", ondelete="SET NULL"))
    output: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
