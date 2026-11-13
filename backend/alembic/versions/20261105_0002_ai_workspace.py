"""AI connections and shared conversations."""
from alembic import op
import sqlalchemy as sa
revision = "20261105_0002"
down_revision = "20261105_0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("ai_connections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("model", sa.String(160), nullable=False),
        sa.UniqueConstraint("user_id", "provider"))
    op.create_table("ai_threads",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("repository", sa.String(300)),
        sa.Column("messages", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("cursor_agent_id", sa.String(150)),
        sa.Column("cursor_run_id", sa.String(150)),
        sa.Column("cursor_result", sa.JSON()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))


def downgrade():
    op.drop_table("ai_threads")
    op.drop_table("ai_connections")
