"""Task planning metadata and local change history."""
from alembic import op
import sqlalchemy as sa
revision = "20261113_0006"
down_revision = "20261112_0005"
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table("workspace_tasks") as table:
        table.add_column(sa.Column("due_date",sa.Date(),nullable=True))
        table.add_column(sa.Column("labels",sa.String(240),nullable=False,server_default=""))
        table.add_column(sa.Column("history",sa.JSON(),nullable=False,server_default="[]"))

def downgrade():
    with op.batch_alter_table("workspace_tasks") as table:
        for column in ("history","labels","due_date"):
            table.drop_column(column)
