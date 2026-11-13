# Database design

SQLAlchemy models use UUID-like string IDs for application-owned records and GitHub's numeric IDs as stable external keys. All user-owned data is scoped by `user_id`; deleting a user cascades through local records.

| Table | Purpose | Key constraints |
| --- | --- | --- |
| `users` | GitHub account profile | Unique `github_id`; unique login is not assumed |
| `oauth_connections` | Encrypted token, granted scopes, sync timestamp | One per user; token encrypted at rest |
| `sessions` | Digest of an opaque browser session secret | Unique digest; indexed expiry and user FK |
| `oauth_states` | One-use hashed OAuth state | Unique digest; indexed expiry |
| `repositories` | Synchronized public GitHub repository metadata | Unique `(user_id, github_id)`; indexes for update/language/fork/archive |
| `favorites` | User's local repository favorites | Unique `(user_id, github_id)` |
| `collections` | User-defined local repository groups | Unique `(user_id, name)` |
| `collection_repositories` | Collection membership | Unique `(collection_id, github_id)`; ownership checked in service layer |

Dates are timezone-aware UTC at the API boundary. GitHub metadata is a cache, not the source of truth; the UI shows the last successful synchronization. OAuth state and sessions store hashes rather than replayable secrets. Access tokens are encrypted using an environment-managed Fernet key. The database schema must use Alembic migrations before production; development `create_all` is not a migration strategy.

Production database: PostgreSQL. Local default: SQLite for zero-setup development. Index and query behavior must be checked against PostgreSQL before broad deployment.

Future entities such as activity snapshots, repository language byte counts, notifications, and sync logs should be added only alongside a feature that consumes them.
