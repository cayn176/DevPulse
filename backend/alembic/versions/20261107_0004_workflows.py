"""Persistent workspace tasks, manual workflows and execution history."""
from alembic import op
import sqlalchemy as sa

revision = "20261107_0004"
down_revision = "20261106_0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("local_workflows",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(140), nullable=False),
        sa.Column("project_id", sa.String(36), sa.ForeignKey("local_projects.id", ondelete="SET NULL")),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("workspace_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("local_workflow_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("request_id", sa.String(36), nullable=False),
        sa.Column("workflow_id", sa.String(36), sa.ForeignKey("local_workflows.id", ondelete="SET NULL"), index=True),
        sa.Column("workflow_name", sa.String(140), nullable=False),
        sa.Column("task_id", sa.String(36), sa.ForeignKey("workspace_tasks.id", ondelete="SET NULL")),
        sa.Column("output", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "request_id"))


def downgrade():
    op.drop_table("local_workflow_runs")
    op.drop_table("workspace_tasks")
    op.drop_table("local_workflows")
