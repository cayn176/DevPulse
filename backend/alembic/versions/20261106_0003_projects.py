"""Registered local project roots."""
from alembic import op
import sqlalchemy as sa
revision = "20261106_0003"
down_revision = "20261105_0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("local_projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("path", sa.Text(), nullable=False),
        sa.Column("remote_url", sa.Text()),
        sa.Column("language", sa.String(80)),
        sa.Column("framework", sa.String(80)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_opened", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "path", name="uq_local_project_user_path"))


def downgrade():
    op.drop_table("local_projects")
