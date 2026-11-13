"""Initial DevPulse schema.

Revision ID: 20261105_0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "20261105_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("github_id", sa.BigInteger(), nullable=False),
        sa.Column("login", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200)),
        sa.Column("avatar_url", sa.Text()),
        sa.Column("bio", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("github_id"),
    )
    op.create_index("ix_users_login", "users", ["login"])

    op.create_table(
        "oauth_connections",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("encrypted_access_token", sa.Text(), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("synced_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "oauth_states",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("encrypted_code_verifier", sa.Text(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("state_hash"),
    )
    op.create_index("ix_oauth_states_expires_at", "oauth_states", ["expires_at"])
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("secret_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("secret_hash"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])

    op.create_table(
        "repositories",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("github_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("full_name", sa.String(length=300), nullable=False),
        sa.Column("owner_login", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("html_url", sa.Text(), nullable=False),
        sa.Column("clone_url", sa.Text(), nullable=False),
        sa.Column("ssh_url", sa.Text(), nullable=False),
        sa.Column("homepage", sa.Text()),
        sa.Column("visibility", sa.String(length=20), nullable=False),
        sa.Column("primary_language", sa.String(length=100)),
        sa.Column("stargazers_count", sa.Integer(), nullable=False),
        sa.Column("forks_count", sa.Integer(), nullable=False),
        sa.Column("watchers_count", sa.Integer(), nullable=False),
        sa.Column("open_issues_count", sa.Integer(), nullable=False),
        sa.Column("default_branch", sa.String(length=200)),
        sa.Column("license_name", sa.String(length=200)),
        sa.Column("topics", sa.JSON(), nullable=False),
        sa.Column("archived", sa.Boolean(), nullable=False),
        sa.Column("fork", sa.Boolean(), nullable=False),
        sa.Column("created_at_github", sa.DateTime(timezone=True)),
        sa.Column("updated_at_github", sa.DateTime(timezone=True)),
        sa.Column("pushed_at_github", sa.DateTime(timezone=True)),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "github_id", name="uq_repository_user_github"),
    )
    op.create_index("ix_repositories_user_id", "repositories", ["user_id"])
    op.create_index("ix_repositories_full_name", "repositories", ["full_name"])
    op.create_index("ix_repositories_archived", "repositories", ["archived"])
    op.create_index("ix_repositories_fork", "repositories", ["fork"])
    op.create_index("ix_repositories_user_updated", "repositories", ["user_id", "updated_at_github"])
    op.create_index("ix_repositories_user_language", "repositories", ["user_id", "primary_language"])

    op.create_table(
        "favorites",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.String(length=36), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "repository_id", name="uq_favorite_user_repository"),
    )
    op.create_index("ix_favorites_user_id", "favorites", ["user_id"])
    op.create_index("ix_favorites_repository_id", "favorites", ["repository_id"])

    op.create_table(
        "collections",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=240)),
        sa.Column("color", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "name", name="uq_collection_user_name"),
    )
    op.create_index("ix_collections_user_id", "collections", ["user_id"])

    op.create_table(
        "collection_repositories",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("collection_id", sa.String(length=36), sa.ForeignKey("collections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("repository_id", sa.String(length=36), sa.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("collection_id", "repository_id", name="uq_collection_repository"),
    )
    op.create_index("ix_collection_repositories_collection_id", "collection_repositories", ["collection_id"])
    op.create_index("ix_collection_repositories_repository_id", "collection_repositories", ["repository_id"])


def downgrade() -> None:
    op.drop_table("collection_repositories")
    op.drop_table("collections")
    op.drop_table("favorites")
    op.drop_table("repositories")
    op.drop_table("sessions")
    op.drop_table("oauth_states")
    op.drop_table("oauth_connections")
    op.drop_index("ix_users_login", table_name="users")
    op.drop_table("users")
