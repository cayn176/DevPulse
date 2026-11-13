"""Workspace task board with project, priority and detailed status."""
from alembic import op
import sqlalchemy as sa

revision = "20261112_0005"
down_revision = "20261107_0004"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("workspace_tasks") as table:
        table.add_column(sa.Column("status", sa.String(24), nullable=False, server_default="todo"))
        table.add_column(sa.Column("priority", sa.String(12), nullable=False, server_default="normal"))
        table.add_column(sa.Column("description", sa.Text(), nullable=False, server_default=""))
        table.add_column(sa.Column("project_id", sa.String(36), nullable=True))
        table.create_foreign_key("fk_task_project", "local_projects", ["project_id"], ["id"], ondelete="SET NULL")
    op.execute("UPDATE workspace_tasks SET status='done' WHERE done")


def downgrade():
    with op.batch_alter_table("workspace_tasks") as table:
        table.drop_constraint("fk_task_project", type_="foreignkey")
        for field in ("project_id", "description", "priority", "status"):
            table.drop_column(field)

