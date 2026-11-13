# Development roadmap

Status reflects files in this implementation, not the intended final product.

## Phase 0 — Inspection and planning

- [x] Confirmed the workspace had no existing project or Git history.
- [x] Checked runtime availability and fetched the cayn.dev stylesheet directly.
- [x] Reviewed GitHub's current OAuth scope, web-flow, repository, and event documentation.
- [x] Wrote product, architecture, database, API, design, and security specifications.

## Phase 1 — Visual and frontend foundation

- [x] Build shared color/type/radius/motion tokens and glass surfaces.
- [x] Implement public landing and sign-in experience.
- [x] Implement responsive authenticated shell, routing, theme, command/search affordances.
- [x] Implement honest loading, empty, and error states.

## Phase 2 — Backend and GitHub connection

- [x] Build FastAPI configuration, database models, and health endpoint.
- [x] Implement state-validated GitHub OAuth and secure sessions.
- [x] Encrypt access tokens server-side and scope all user data.
- [x] Implement public repository pagination/synchronization and error/rate-limit handling.

## Phase 3 — Repository workspace

- [x] Repository grid/list, search, multi-filtering, sorting, and detail views.
- [x] Local favorites and collections.
- [x] Manual refresh and sync feedback.

## Phase 4 — Overview, activity, and explore

- [x] Real repository totals and primary-language mix.
- [x] Public activity feed with source and 30-day/300-event limitation label.
- [x] Public repository exploration with rate-limit feedback.
- [x] Defer contribution heatmap and historical commit analytics until implemented from a verified source.

## Phase 5 — Production readiness

- [x] Add Alembic migrations and backend security/workflow tests.
- [ ] Add CI, browser end-to-end checks and deployment configuration.
- [ ] Verify responsive layouts and keyboard access at required widths.
- [ ] Configure secrets, PostgreSQL, HTTPS, and OAuth callback in a deployment environment.
- [ ] Select a project license with the owner; no license is selected yet.

## Later

- GitHub App with explicit read-only repository permissions, installation selection, and private repository access.
- Contribution and commit analytics with documented definitions and coverage.
- Optional notifications, exports, notes, comparison tools, and account preferences.
- Consider Redis/background jobs only when synchronization volume or latency supports the added system.

## AI workspace update

- [x] GitHub token connection and OAuth setup screen.
- [x] Shared conversations, API providers, local CLI adapters and Cursor cloud tasks.
- [x] Repository creation, reviewed diffs, base checks and draft PR publication.
- [x] Backend-only server keys, per-account authorization, encrypted user keys and redacted validation errors.
- [ ] Verify live OAuth, provider and GitHub write flows with user credentials.
