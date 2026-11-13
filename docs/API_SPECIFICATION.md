# API specification

The local API is served at `http://localhost:8000`; Vite proxies `/api` and `/auth` during development. JSON responses use snake_case. OAuth routes are browser redirects. Product routes require the DevPulse session cookie unless explicitly marked public.

## Authentication

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/auth/github/start` | Start OAuth; requires configured credentials |
| `GET` | `/auth/github/callback` | Validate one-use state, exchange code, create session |
| `POST` | `/auth/logout` | End the local session |
| `GET` | `/api/me` | Current account and data freshness |
| `DELETE` | `/api/account` | Disconnect and remove local account data |

## Workspace

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/overview` | Counts and aggregates calculated from synced repositories |
| `GET` | `/api/repositories` | Paginated list; `q`, `language`, `archived`, `fork`, `favorite`, `sort`, `order`, `page`, `page_size` |
| `GET` | `/api/repositories/{owner}/{name}` | Repository details from the user's synchronized data |
| `POST` | `/api/sync` | Refresh public repository metadata |
| `GET` | `/api/activity` | Recent public events; constrained by GitHub retention |
| `GET` | `/api/explore?q=...` | Public repository search |
| `GET/POST` | `/api/collections` | List/create local collections |
| `PATCH/DELETE` | `/api/collections/{id}` | Rename/delete a local collection |
| `PUT/DELETE` | `/api/collections/{id}/repositories/{github_id}` | Add/remove a repository |
| `PUT/DELETE` | `/api/favorites/{github_id}` | Add/remove local favorite |
| `GET` | `/health` | Liveness only; no secrets or connection strings |

## Data definitions

- `total_repositories`, `public_repositories`, `stars`, and `forks` are computed from the current synchronized set.
- `primary_languages` counts the language reported by GitHub as each repository's primary language. It is not a code-size or time-spent distribution.
- Activity items are GitHub events, not a count of commits. The events API provides up to 300 events and only the most recent 30 days, with potential delivery delay.
- A missing GitHub field stays `null`; it is not converted to zero.

## Errors

Stable error objects use `{ "detail": "...", "code": "..." }`. Expected status codes: `401` unauthenticated, `403` insufficient access, `404` not found in the user's scope, `422` validation error, `429` rate limited, `502` upstream GitHub failure, `503` missing server configuration. OAuth callback errors redirect to a short safe error code; secrets and provider response bodies are never put in query strings.

## Permissions and rate limits

The initial OAuth authorization requests only `read:user`. Public repository reads and public activity do not authorize GitHub write operations. Requests are paginated; the backend observes rate-limit headers and returns a retry hint when GitHub refuses a request. Public Explore requests have a lower unauthenticated rate limit and should be cached/debounced.
