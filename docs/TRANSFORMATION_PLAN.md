# Unified Developer Workspace — audit and implementation plan

## Initial audit

The existing application is a browser application, not a desktop app. It uses React 19, TypeScript, Vite, React Router, TanStack Query, Motion, Recharts and custom CSS/Tailwind tokens. The FastAPI backend uses SQLAlchemy, SQLite, Alembic, HTTPX and Fernet. Two migrations exist. GitHub OAuth uses PKCE/browser-bound state and HttpOnly sessions, with personal tokens as an explicit alternative. Credentials stay on the backend. Twenty-three isolated backend tests and a production frontend build passed before this transformation.

Existing screens: Landing, Connect, Overview, Repositories, Repository detail, Analytics, Activity, Explore, Collections, Settings, AI Studio and Integrations. Repository filtering/favorites/collections are real local operations. GitHub/provider data requires credentials. AI Studio persists conversations and reviewed proposals, but Codex/Claude are one-shot commands, not native persistent agent sessions. Cursor currently uses Cloud Agents, not ACP. There is no local file editor, local project registry, desktop shell, Vercel deployment center or native permission stream. Provider configuration status does not prove successful authentication; the new runtime must distinguish installation, setup and verified connection.

The dashboard-first navigation and purple accent conflict with the new brief. Shared API-chat history is useful for DevPulse AI but must not substitute for separate coding-agent histories. Existing auth gates prevent offline local projects; desktop/local sessions need an independent, explicit entry point. File and command operations require backend path isolation, hash conflict detection, fixed command schemas and real runtime permission enforcement. Runtime crashes and simultaneous project writes need explicit lifecycle handling.

## Technical plan

1. Preserve React/FastAPI and working GitHub features; introduce a neutral glass design system and grouped workspace navigation. Separate local workspace entry from GitHub connection.
2. Add a Universal Agent Runtime using Codex App Server, Claude Agent SDK and Cursor ACP where supported. Use capability detection, persistent RPC processes, event streams, permission decisions, interruption, official session APIs and provider-scoped UI. Do not invent models, account plans or usage.
3. Add a project registry, file explorer, Monaco editor, optimistic saves, diffs and explicit Git operations. Resolve every file path inside its registered project and exclude secrets/Git internals.
4. Add DevPulse workspace tools, tasks, security/session management and truthful local analytics. Keep the existing API assistant distinct from external coding agents.
5. Add Vercel's real API integration, deployment confirmation and status/log views, with encrypted credentials and verified connection status.
6. Add Electron with isolated renderer, allowlisted IPC, native folder selection, OS-protected encryption key, local API lifecycle and Windows installer packaging. No provider credentials enter preload/renderer or release artifacts.
7. Run isolated backend tests, frontend type/build checks, protocol fixtures and local UI checks. External account verification and signed/public release require actual authorized accounts/signing credentials; record these limits instead of claiming success.

Independent implementation areas run in parallel: native runtime; projects/editor/Git; desktop/Vercel. The coordinating implementation owns shared routing, configuration, migrations integration, visual design and final validation.
