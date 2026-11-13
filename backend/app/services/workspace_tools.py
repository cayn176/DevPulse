"""Allowlisted workspace reads and user-reviewed links for DevPulse AI."""
import asyncio
from pathlib import Path
import re
from uuid import uuid4

from fastapi import HTTPException

from app.api.local_access import local_owner
from app.api.projects import get_project, git_status
from app.models import OAuthConnection, Repository
from app.models.ai import AIConnection
from app.models.projects import LocalProject
from app.runtime.state import redact
from app.services.ai import ToolRequest

BUILTIN_HELP = ("Ask me to list projects or repositories, open a project by name, inspect Git status or commits, "
                "show pull requests, issues, failed deployments, recent agent activity or integration status. "
                "For code generation and open-ended chat, select an AI model.")


def interpret_command(text: str):
    """Small bilingual command vocabulary for the optional model-free interface."""
    match = re.search(r"(?:create|draft|prepare|crea|prepara|apri)\s+(?:(?:a|an|una|un['’]?)\s*)?(?:github\s+)?issue\b\s*[:—-]?\s*(.*)", text, re.I)
    if match:
        return ToolRequest(name="prepare_issue", title=match[1].strip(' "“”')[:256])
    match = re.search(r"(?:open|apri|show|mostrami|inspect)\s+(?:(?:the|il)\s+)?(?:project|progetto)\s+[\"“]?(.+?)[\"”]?[.!?]?$", text.strip(), re.I)
    if match:
        return ToolRequest(name="open_project" if text.lower().startswith(("open", "apri")) else "get_project", project=match[1][:120])
    patterns = (
        (r"\b(?:deployments?|deploy)\b", "failed_deployments" if re.search(r"fail|fallit|error", text, re.I) else "get_deployments"),
        (r"\b(?:pull requests?|prs?)\b", "list_pull_requests"),
        (r"\bissues?\b", "list_issues"),
        (r"\b(?:git status|stato git|modifiche|changes|dirty|modified)\b", "get_git_status"),
        (r"\bcommits?\b", "list_commits"),
        (r"\b(?:integra[tz]|connession|connection)", "get_integration_status"),
        (r"\b(?:activity|attività|attivita|sessioni|sessions)\b", "recent_activity"),
        (r"\b(?:repositories|repository|repos?|archivi)\b", "list_repositories"),
        (r"\b(?:projects?|progetti|progetto)\b", "list_projects"),
    )
    return next((ToolRequest(name=name) for pattern, name in patterns if re.search(pattern, text, re.I)), None)


def result(text, *, links=None, draft=None):
    return {"text": redact(text), "links": links or [], "issue_draft": draft}


def list_result(title, rows, empty):
    return result(title + "\n" + "\n".join("• " + row for row in rows) if rows else empty)


async def run_tool(tool, *, request, user, db, repository, project_id):
    from app.api import ai, deploy, repo_tools, runtime

    name = tool.name
    if name == "list_repositories":
        rows = db.query(Repository).filter_by(user_id=user.id).order_by(Repository.full_name).limit(100).all()
        return list_result("Synchronized repositories", [f"{row.full_name} ({row.visibility})" for row in rows], "No repositories synchronized for this account.")
    if name == "get_integration_status":
        github = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
        saved = [r.provider for r in db.query(AIConnection).filter_by(user_id=user.id).all()]
        configured = set(saved) | {p for p in ("openai", "anthropic", "cursor") if ai.server_connection(user, p)}
        lines = ["GitHub · " + ("authorized locally" if github else "not connected"),
                 "Saved credentials · " + (", ".join(sorted(configured)) or "none")]
        try:
            local_owner(request, user)
        except HTTPException:
            pass
        else:
            for p in runtime.provider_types:
                info = runtime.adapter(p, user.id).info()
                lines.append(info["name"] + " · " + info["status"].replace("_", " "))
        return list_result("Integrations", lines, "")
    if name in {"list_issues", "list_pull_requests", "prepare_issue"}:
        if not repository:
            return result("Start a conversation with a GitHub repository selected to use this tool.")
        owner, repo = repository.split("/", 1)
        if name == "prepare_issue":
            if not tool.title.strip():
                return result("Supply an issue title, for example “Create an issue: Document local setup”.")
            return result("Review this draft before publishing it to " + repository + ".",
                          draft={"id": str(uuid4()), "repository": repository, "title": redact(tool.title.strip()), "body": redact(tool.body)})
        rows = await repo_tools.resources(owner, repo, "issues" if name == "list_issues" else "pulls", user=user, db=db)
        return list_result(repository, [f"#{r['id']}  {r['title']}" for r in rows], "No open items returned by GitHub.")
    if name in {"get_deployments", "failed_deployments"}:
        rows = await deploy.deployments(project="", auth=deploy.credentials(user=user, db=db))
        if name == "failed_deployments":
            rows = [r for r in rows if (r.get("state") or "").upper() in {"ERROR", "FAILED"}]
        return list_result("Vercel deployments", [f"{r['name']} · {r['state']} · {r.get('branch') or '—'}" for r in rows[:30]], "No matching deployments returned by Vercel.")
    local_owner(request, user)
    if name == "recent_activity":
        records = [s for s in runtime.state.sessions.values() if s["owner"] == user.id and not s.get("hidden")]
        records.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
        return list_result("Recent agent sessions", [f"{s['provider']} · {s['title']} · {s['status']}" for s in records[:20]], "No recorded agent sessions.")
    rows = db.query(LocalProject).filter_by(user_id=user.id).order_by(LocalProject.last_opened.desc()).limit(100).all()
    if name == "list_projects":
        return list_result("Registered projects", [r.name + (" · " + r.framework if r.framework else "") for r in rows], "No local projects have been opened.")
    if project_id:
        rows = [get_project(db, user, project_id)]
    if tool.project:
        matches = [r for r in rows if r.name.casefold() == tool.project.casefold()]
        rows = matches or [r for r in rows if tool.project.casefold() in r.name.casefold()]
    if not rows:
        return result("No matching project. Open it in Projects or check its name.")
    if len(rows) != 1 and (name != "get_git_status" or tool.project):
        return result("Select a project in the composer: " + ", ".join(r.name for r in rows))
    if name in {"get_project", "open_project"}:
        project = get_project(db, user, rows[0].id)
        return result(project.name + "\n" + (project.description or project.framework or project.language or "Local project"),
                      links=[{"path": "/app/code?project=" + project.id, "label": "Open in Code Workspace"}])
    lines = []
    for row in rows[:12]:
        project = get_project(db, user, row.id)
        status = await asyncio.to_thread(git_status, Path(project.path))
        if not status["is_repository"]:
            lines.append(row.name + " · no Git repository")
        elif name == "list_commits":
            lines.extend(c["sha"][:7] + "  " + c["message"] for c in status["commits"])
        else:
            lines.append(f"{row.name} · {status['branch']} · {len(status['changes'])} changed files")
            if len(rows) == 1:
                lines.extend(c["status"] + "  " + c["path"] for c in status["changes"][:50])
    return list_result("Git status (up to 12 recent projects)" if name == "get_git_status" else "Recent commits", lines, "No commits recorded.")
