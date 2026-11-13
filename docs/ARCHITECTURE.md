# Architecture

## System overview

DevPulse is a small monorepo with a React SPA and FastAPI API. The browser never receives the GitHub OAuth access token. The API owns the OAuth flow, encrypts the token before database storage, calls GitHub, and returns normalized application data.

```text
Browser (React/Vite)
  ├─ /auth/* ──> FastAPI OAuth and session routes
  └─ /api/*  ──> FastAPI product routes
                    ├─ SQLAlchemy ──> SQLite (local) / PostgreSQL (production)
                    └─ HTTPX ───────> GitHub REST API
```

## Repository structure

```text
frontend/src/       app, routes, shell, features, shared UI, styles
backend/app/api/    HTTP routers and dependencies
backend/app/core/   configuration, database, security, session handling
backend/app/models/ SQLAlchemy models
backend/app/schemas/ request/response validation
backend/app/services/ GitHub client and synchronization/business logic
backend/tests/      API and service tests
docs/               product and engineering decisions
```

## Authentication and request flow

1. The API creates a cryptographically random OAuth `state`, stores only its SHA-256 digest with a short expiry, and redirects to GitHub.
2. GitHub returns a temporary code and state. The API verifies and consumes the state once, exchanges the code server-to-server, and retrieves the profile.
3. The API requests `read:user` only. Public repository data is read from GitHub; no repository mutation permission is requested.
4. The API encrypts the OAuth token with Fernet before persistence, creates a random opaque session secret, stores only its digest, and sends it in an HttpOnly, SameSite=Lax cookie.
5. Authenticated API requests hash the presented cookie and join the live session to its user. CORS is restricted to the configured frontend origin; mutating routes also validate `Origin`.
6. Disconnect removes local session, token, repository, and organization data. GitHub authorization revocation can be performed in GitHub account settings.

## Data flow and synchronization

- Repositories are keyed by GitHub's stable numeric ID and scoped to a local user.
- Initial sync paginates through public repositories and upserts the latest metadata.
- The sync timestamp and per-user GitHub profile are stored locally so the UI can explain data freshness.
- Manual refresh re-fetches the repository listing and reports GitHub rate-limit information when applicable.
- User-facing analytics are calculations over persisted fields, never hand-authored sample values.
- Activity is fetched on demand from the authenticated user's public events endpoint and is labelled with its actual coverage.

## Frontend state

- TanStack Query owns server state, caching, invalidation, and loading/error states.
- React Router owns URL-level navigation and repository detail routes.
- Theme and compact-navigation preferences are non-sensitive browser preferences.
- React local state owns transient menus, filter controls, and confirmation dialogs.

## Deployment shape

- Vite static bundle on a static host or same-origin reverse proxy.
- FastAPI on an ASGI service.
- Managed PostgreSQL for production.
- HTTPS termination in front of the API; `COOKIE_SECURE=true` in production.
- No Redis or worker until background synchronization or measured load justifies one.

## Failure handling

- GitHub errors are translated to stable API errors; secrets and upstream response bodies are not returned to the browser.
- `403`/`429` rate-limit responses include safe reset timing when available.
- Partial repository pagination failure does not claim a successful complete sync.
- Missing values remain `null`; the frontend renders unavailable states explicitly.
- Database state is user-scoped in every repository, favorite, collection, and session query.
