"""User-owned local project roots and bounded file/Git operations."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import current_user, require_same_origin
from app.core.database import get_db
from app.models import User
from app.models.entities import utcnow
from app.models.projects import LocalProject

from app.api.local_access import local_owner

router = APIRouter(prefix="/api/projects", dependencies=[Depends(local_owner)])
WORKSPACE_ROOT = Path(os.environ.get("DEVPULSE_WORKSPACE_ROOT", str(Path(__file__).resolve().parents[2] / "workspaces")))
MAX_FILE = 1024 * 1024
EXCLUDED = {".git", "node_modules", ".venv", "venv", "__pycache__", ".next", "dist", ".ssh", ".aws", ".codex", ".claude"}
_locks: dict[str, threading.RLock] = {}
_locks_guard = threading.Lock()


def project_lock(project_id: str):
    with _locks_guard:
        return _locks.setdefault(project_id, threading.RLock())


def excluded(part: str):
    value = part.lower()
    return value in EXCLUDED or value.startswith(".env") or value.endswith((".pem", ".key", ".p12", ".pfx")) or value in {"credentials", "credentials.json", "auth.json", ".npmrc", ".pypirc"}


def is_link(path: Path):
    return path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction())


def secure_path(project: LocalProject, relative: str, *, allow_root=False) -> Path:
    if relative == "" and allow_root:
        return Path(project.path).resolve()
    if not relative or len(relative) > 1000 or "\\" in relative or ":" in relative or relative.startswith("/") or any(ord(c) < 32 for c in relative):
        raise HTTPException(400, "Use a relative file path inside the project.")
    parts = relative.split("/")
    if any(p in {"", ".", ".."} or excluded(p) or (os.name == "nt" and os.path.isreserved(p)) for p in parts):
        raise HTTPException(403, "This path is outside the editable project files.")
    root = Path(project.path).resolve()
    candidate = root
    for part in parts:
        candidate = candidate / part
        if is_link(candidate):
            raise HTTPException(403, "Symbolic links and junctions cannot be followed.")
    if not candidate.resolve().is_relative_to(root):
        raise HTTPException(403, "File is outside this project's root.")
    return candidate


def get_project(db: Session, user: User, project_id: str) -> LocalProject:
    project = db.query(LocalProject).filter_by(id=project_id, user_id=user.id).one_or_none()
    if not project:
        raise HTTPException(404, "Project not found.")
    if not Path(project.path).is_dir() or is_link(Path(project.path)):
        raise HTTPException(409, "Project folder is missing or has been replaced by a link.")
    return project


def run_git(path: Path, arguments: list[str], *, timeout=25, check=True, github_auth=None):
    executable = shutil.which("git")
    if not executable:
        raise HTTPException(503, "Git is not installed on this computer.")
    # On Windows the cmd/git.exe launcher spawns a second process that keeps the
    # pipes open if the launcher times out. Address the Git executable directly.
    if os.name == "nt":
        direct = Path(executable).parent.parent / "mingw64" / "bin" / "git.exe"
        if direct.is_file():
            executable = str(direct)
    from app.runtime.transport import child_environment
    env = dict(child_environment(), GIT_TERMINAL_PROMPT="0", GIT_PAGER="cat", GIT_OPTIONAL_LOCKS="0")
    if github_auth:
        origin, token = github_auth
        # Scope the transient header to this validated HTTPS repository. Never persist it in .git/config.
        encoded = base64.b64encode(("x-access-token:" + token).encode()).decode()
        env.update(GIT_CONFIG_COUNT="1", GIT_CONFIG_KEY_0="http." + remote_allowed(origin) + ".extraHeader",
                   GIT_CONFIG_VALUE_0="Authorization: Basic " + encoded)
    command = [executable, "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=" + os.devnull, "-c", "protocol.file.allow=never", "-c", "core.pager=cat", *arguments]
    try:
        result = subprocess.run(command, cwd=path, env=env, stdin=subprocess.DEVNULL, capture_output=True, encoding="utf-8", errors="replace", timeout=timeout, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(504, "Git timed out. Check the repository and authentication before retrying.") from exc
    if check and result.returncode:
        # Git errors can contain remote credentials. Return an actionable generic message.
        raise HTTPException(409, "Git could not complete this operation. Check Git identity, authentication, branch conflicts and local changes.")
    return result


def remote_allowed(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or parsed.hostname != "github.com" or parsed.username or parsed.password or parsed.query or parsed.fragment or not re.fullmatch(r"/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", parsed.path):
        raise HTTPException(422, "Use an HTTPS GitHub repository URL without embedded credentials.")
    return value


def metadata(path: Path):
    language, framework = None, None
    package = path / "package.json"
    if package.is_file() and not is_link(package):
        try:
            data = json.loads(package.read_text(encoding="utf-8")[:MAX_FILE])
            dependencies = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
            language = "TypeScript" if "typescript" in dependencies or (path / "tsconfig.json").exists() else "JavaScript"
            framework = next((label for key, label in (("next", "Next.js"), ("react", "React"), ("vue", "Vue"), ("svelte", "Svelte"), ("astro", "Astro")) if key in dependencies), "Node.js")
        except (ValueError, OSError, TypeError):
            pass
    elif (path / "pyproject.toml").exists() or (path / "requirements.txt").exists():
        language, framework = "Python", "Python"
    elif (path / "Cargo.toml").exists():
        language, framework = "Rust", "Cargo"
    elif (path / "go.mod").exists():
        language, framework = "Go", "Go modules"
    return language, framework


def project_out(row):
    return {key: getattr(row, key) for key in ("id", "name", "description", "path", "remote_url", "language", "framework", "created_at", "last_opened")}


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    action: str = Field(default="open", pattern="^(open|create|clone)$")
    path: str | None = Field(default=None, max_length=2000)
    remote_url: str | None = Field(default=None, max_length=500)
    use_github_account: bool = False
    confirm: bool = False


@router.get("")
def list_projects(q: str = Query(default="", max_length=120), language: str = Query(default="", max_length=80), user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(LocalProject).filter_by(user_id=user.id).order_by(LocalProject.last_opened.desc()).all()
    return [project_out(row) for row in rows if q.lower() in (row.name + " " + row.description).lower() and (not language or row.language == language)]


@router.post("", dependencies=[Depends(require_same_origin)])
def create_project(body: ProjectCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not body.confirm:
        raise HTTPException(400, "Confirm access to the selected project folder.")
    if body.action == "open":
        if not body.path or not Path(body.path).is_absolute():
            raise HTTPException(422, "Select an absolute folder path.")
        path = Path(body.path)
        if not path.is_dir() or is_link(path):
            raise HTTPException(422, "Choose an existing directory, not a symbolic link.")
        path = path.resolve()
        if path == Path(path.anchor) or path == Path.home():
            raise HTTPException(422, "Choose a project folder rather than an entire drive or home directory.")
    else:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,99}", body.name):
            raise HTTPException(422, "New folder names may contain letters, digits, dots, dashes and underscores.")
        WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
        path = WORKSPACE_ROOT.resolve() / body.name
        if path.exists() or not path.resolve().is_relative_to(WORKSPACE_ROOT.resolve()):
            raise HTTPException(409, "This project directory already exists. Open it instead.")
        if body.action == "clone":
            remote = remote_allowed(body.remote_url or "")
            auth = None
            if body.use_github_account:
                from app.models import OAuthConnection
                from app.core.security import decrypt_secret
                account = db.query(OAuthConnection).filter_by(user_id=user.id).one_or_none()
                if not account:
                    raise HTTPException(409, "Connect GitHub before cloning with your account.")
                auth = (remote, decrypt_secret(account.encrypted_access_token))
            if auth:
                # Checkout filters must never inherit the GitHub authentication header.
                run_git(WORKSPACE_ROOT.resolve(), ["clone", "--no-checkout", "--", remote, str(path)], timeout=180, github_auth=auth)
                if run_git(path, ["rev-parse", "--verify", "HEAD"], check=False).returncode == 0:
                    run_git(path, ["reset", "--hard", "HEAD"], timeout=120)
            else:
                run_git(WORKSPACE_ROOT.resolve(), ["clone", "--", remote, str(path)], timeout=180)
        else:
            path.mkdir()
            run_git(path, ["init", "-b", "main"])
            (path / "README.md").write_text("# " + body.name + "\n\n" + body.description + "\n", encoding="utf-8")
    existing = db.query(LocalProject).filter_by(user_id=user.id, path=str(path)).one_or_none()
    if existing:
        existing.last_opened = utcnow()
        db.commit()
        return project_out(existing)
    language, framework = metadata(path)
    result = run_git(path, ["remote", "get-url", "origin"], check=False)
    remote = result.stdout.strip() if result.returncode == 0 else None
    if remote:
        parsed = urlsplit(remote)
        if parsed.username or parsed.password:
            remote = "Remote configured (credentials hidden)"
    row = LocalProject(user_id=user.id, name=body.name.strip(), description=body.description, path=str(path), remote_url=remote, language=language, framework=framework)
    db.add(row)
    db.commit()
    return project_out(row)


@router.get("/{project_id}")
def project_detail(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return project_out(get_project(db, user, project_id))


@router.post("/{project_id}/open", dependencies=[Depends(require_same_origin)])
def touch_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    row.last_opened = utcnow()
    db.commit()
    return project_out(row)


@router.get("/{project_id}/tree")
def tree(project_id: str, path: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    folder = secure_path(row, path, allow_root=True)
    if not folder.is_dir():
        raise HTTPException(404, "Directory not found.")
    items = []
    try:
        for child in sorted(folder.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            if excluded(child.name) or is_link(child):
                continue
            items.append({"name": child.name, "path": child.relative_to(Path(row.path)).as_posix(), "directory": child.is_dir(), "size": child.stat().st_size if child.is_file() else None})
            if len(items) >= 1000:
                break
    except OSError as exc:
        raise HTTPException(403, "This directory cannot be read.") from exc
    return {"items": items, "limited": len(items) >= 1000}


def read_text_file(path):
    if not path.is_file():
        raise HTTPException(404, "File not found.")
    if path.stat().st_size > MAX_FILE:
        raise HTTPException(413, "The editor supports text files up to 1 MB.")
    try:
        data = path.read_bytes()
        if b"\0" in data:
            raise UnicodeError()
        return data.decode("utf-8"), hashlib.sha256(data).hexdigest()
    except UnicodeError as exc:
        raise HTTPException(415, "Only UTF-8 text files can be edited.") from exc


@router.get("/{project_id}/file")
def read_file(project_id: str, path: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = secure_path(get_project(db, user, project_id), path)
    content, digest = read_text_file(target)
    return {"path": path, "content": content, "hash": digest}


class FileWrite(BaseModel):
    path: str = Field(max_length=1000)
    content: str = Field(max_length=MAX_FILE)
    expected_hash: str | None = Field(default=None, max_length=64)


@router.put("/{project_id}/file", dependencies=[Depends(require_same_origin)])
def write_file(project_id: str, body: FileWrite, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    with project_lock(project_id):
        target = secure_path(row, body.path)
        if target.exists():
            _, digest = read_text_file(target)
            if body.expected_hash != digest:
                raise HTTPException(409, "This file changed on disk. Reopen it and compare your edits before saving.")
        elif body.expected_hash is not None:
            raise HTTPException(409, "The file was removed on disk. Create it explicitly with a new file action.")
        data = body.content.encode("utf-8")
        if len(data) > MAX_FILE:
            raise HTTPException(413, "The editor supports files up to 1 MB.")
        target.parent.mkdir(parents=True, exist_ok=True)
        secure_path(row, body.path)
        target.write_bytes(data)
    return {"path": body.path, "content": body.content, "hash": hashlib.sha256(data).hexdigest()}


@router.get("/{project_id}/search")
def search(project_id: str, q: str = Query(min_length=1, max_length=200), user: User = Depends(current_user), db: Session = Depends(get_db)):
    root = Path(get_project(db, user, project_id).path)
    matches, scanned = [], 0
    for folder, directories, files in os.walk(root, followlinks=False):
        directories[:] = [d for d in directories if not excluded(d) and not is_link(Path(folder) / d)]
        for name in files:
            path = Path(folder) / name
            if excluded(name) or is_link(path) or path.stat().st_size > MAX_FILE:
                continue
            scanned += 1
            try:
                content, _ = read_text_file(path)
            except (HTTPException, OSError):
                continue
            for index, line in enumerate(content.splitlines(), 1):
                if q.casefold() in line.casefold():
                    matches.append({"path": path.relative_to(root).as_posix(), "line": index, "text": line[:300]})
                    if len(matches) == 100:
                        return {"matches": matches, "limited": True}
            if scanned >= 2000:
                return {"matches": matches, "limited": True}
    return {"matches": matches, "limited": False}


def git_status(root: Path):
    check = run_git(root, ["rev-parse", "--show-toplevel"], check=False)
    if check.returncode or Path(check.stdout.strip()).resolve() != root.resolve():
        return {"is_repository": False, "branch": None, "changes": [], "branches": [], "commits": []}
    branch = run_git(root, ["branch", "--show-current"]).stdout.strip()
    records = run_git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]).stdout.split("\0")
    changes = []
    index = 0
    while index < len(records):
        record = records[index]
        index += 1
        if len(record) < 4:
            continue
        status, path = record[:2], record[3:]
        if "R" in status or "C" in status:
            index += 1
        if any(excluded(p) for p in path.split("/")):
            continue
        conflicted = status in {"DD", "AU", "UD", "UA", "DU", "AA", "UU"}
        changes.append({"path": path, "status": status, "staged": not conflicted and status[0] not in {" ", "?"},
                        "unstaged": status[1] != " ", "conflicted": conflicted})
    branches = run_git(root, ["branch", "--format=%(refname:short)"]).stdout.splitlines()
    log = run_git(root, ["log", "-20", "--format=%H%x00%s%x00%an%x00%aI"], check=False)
    commits = []
    if log.returncode == 0:
        for line in log.stdout.splitlines():
            parts = line.split("\0")
            if len(parts) == 4:
                commits.append(dict(zip(("sha", "message", "author", "date"), parts)))
    merging = run_git(root, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], check=False).returncode == 0
    return {"is_repository": True, "branch": branch or "detached HEAD", "changes": changes[:1000], "branches": branches, "commits": commits, "merging": merging}


@router.get("/{project_id}/git")
def git_state(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    return git_status(Path(row.path))


@router.get("/{project_id}/diff")
def git_diff(project_id: str, path: str, staged: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    target = secure_path(row, path)
    root = Path(row.path)
    original = run_git(root, ["show", "HEAD:" + path], check=False)
    content = read_text_file(target)[0] if target.is_file() else ""
    diff = run_git(root, ["diff", "--no-ext-diff", "--no-textconv", *( ["--cached"] if staged else [] ), "--", path]).stdout
    return {"path": path, "original": original.stdout if original.returncode == 0 else "", "modified": content, "diff": diff[:300000]}


@router.get("/{project_id}/conflict")
def conflict_versions(project_id: str, path: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    secure_path(row, path)
    root = Path(row.path)
    versions = {}
    for stage, key in ((2, "current"), (3, "incoming")):
        spec = f":{stage}:{path}"
        size = run_git(root, ["cat-file", "-s", spec], check=False)
        if size.returncode:
            versions[key] = None
        elif int(size.stdout.strip()) > MAX_FILE:
            raise HTTPException(413, "Conflict file exceeds the editor size limit.")
        else:
            versions[key] = run_git(root, ["show", spec]).stdout
    if all(v is None for v in versions.values()):
        raise HTTPException(409, "This path has no unresolved Git conflict.")
    return versions


class FileOperation(BaseModel):
    action: str = Field(pattern=r"^(mkdir|rename|delete)$")
    path: str = Field(min_length=1, max_length=1000)
    destination: str | None = Field(default=None, max_length=1000)
    expected_hash: str | None = Field(default=None, max_length=64)
    confirm: bool = False


@router.post("/{project_id}/files", dependencies=[Depends(require_same_origin)])
def file_operation(project_id: str, body: FileOperation, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    if not body.confirm:
        raise HTTPException(400, "Confirm this change before updating the project.")
    with project_lock(project_id):
        path = secure_path(row, body.path)
        if body.action == "mkdir":
            if path.exists():
                raise HTTPException(409, "An entry already exists at this path.")
            path.mkdir(parents=True)
            return {"path": body.path}
        _, current_hash = read_text_file(path)
        if current_hash != body.expected_hash:
            raise HTTPException(409, "File changed on disk. Reopen it before continuing.")
        if body.action == "rename":
            target = secure_path(row, body.destination or "")
            if target.exists():
                raise HTTPException(409, "The destination already exists.")
            if not target.parent.is_dir():
                raise HTTPException(409, "Create the destination folder first.")
            path.rename(target)
            return {"path": body.destination}
        path.unlink()
        return {"path": body.path}


@router.get("/{project_id}/commits/{sha}")
def commit_detail(project_id: str, sha: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not re.fullmatch(r"[a-fA-F0-9]{7,40}", sha):
        raise HTTPException(422, "Invalid commit ID.")
    row = get_project(db, user, project_id)
    root = Path(row.path)
    resolved = run_git(root, ["rev-parse", "--verify", sha + "^{commit}"], check=False)
    if resolved.returncode:
        raise HTTPException(404, "Commit not found.")
    oid = resolved.stdout.strip()
    fields = run_git(root, ["show", "-s", "--format=%P%x00%an%x00%aI%x00%B", oid]).stdout.rstrip().split("\0", 3)
    names = run_git(root, ["diff-tree", "--root", "-m", "--no-renames", "--no-commit-id", "--name-only", "-r", "-z", oid]).stdout.split("\0")
    files = list(dict.fromkeys(name for name in names if name and not any(excluded(p) for p in name.split("/"))))
    return {"sha": oid, "parents": fields[0].split(), "author": fields[1], "date": fields[2], "message": fields[3], "paths": files[:500]}


class ProjectCommand(BaseModel):
    command: str = Field(pattern=r"^(pwd|ls|git status|git log|git branch|git version)$")


@router.post("/{project_id}/terminal", dependencies=[Depends(require_same_origin)])
def project_command(project_id: str, body: ProjectCommand, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    root = Path(row.path)
    if body.command == "pwd":
        output = row.path
    elif body.command == "ls":
        output = "\n".join(i["name"] + ("/" if i["directory"] else "") for i in tree(project_id, "", user, db)["items"])
    elif body.command == "git status":
        state = git_status(root)
        if not state["is_repository"]:
            raise HTTPException(409, "This folder has no Git repository.")
        output = "Branch: " + state["branch"] + "\n" + ("\n".join(c["status"] + " " + c["path"] for c in state["changes"]) or "Working tree clean")
    else:
        options = {"git log": ["log", "-15", "--oneline"], "git branch": ["branch", "--list"], "git version": ["--version"]}
        output = run_git(root, options[body.command]).stdout
    return {"command": body.command, "output": output[:40000]}


class GitAction(BaseModel):
    action: str = Field(pattern="^(init|stage|unstage|commit|branch|switch|fetch|pull|push|restore|worktree|merge|abort-merge)$")
    paths: list[str] = Field(default_factory=list, max_length=100)
    message: str = Field(default="", max_length=2000)
    branch: str = Field(default="", max_length=200)
    confirm: bool = False


@router.post("/{project_id}/git", dependencies=[Depends(require_same_origin)])
def git_action(project_id: str, body: GitAction, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    root = Path(row.path)
    if not body.confirm:
        raise HTTPException(400, "Confirm this Git operation first.")
    paths = []
    for path in body.paths:
        secure_path(row, path)
        paths.append(path)
    with project_lock(project_id):
        if body.action != "init" and not git_status(root)["is_repository"]:
            raise HTTPException(409, "This project folder is not a Git repository root.")
        if body.action == "init":
            arguments = ["init", "-b", "main"]
        elif body.action in {"stage", "unstage", "restore"}:
            if not paths:
                raise HTTPException(422, "Select at least one file.")
            if any(secure_path(row, p).is_dir() for p in paths):
                raise HTTPException(422, "Select individual changed files.")
            if body.action == "stage":
                arguments = ["add", "--", *paths]
            elif body.action == "unstage" and run_git(root, ["rev-parse", "--verify", "HEAD"], check=False).returncode:
                arguments = ["rm", "--cached", "--", *paths]
            else:
                arguments = ["restore", "--staged" if body.action == "unstage" else "--worktree", "--", *paths]
        elif body.action == "commit":
            if not body.message.strip():
                raise HTTPException(422, "Enter a commit message.")
            arguments = ["-c", "commit.gpgsign=false", "commit", "-m", body.message]
        elif body.action == "abort-merge":
            arguments = ["merge", "--abort"]
        elif body.action in {"branch", "switch", "worktree", "merge"}:
            if not body.branch or body.branch.startswith(("-", "/")) or run_git(root, ["check-ref-format", "--branch", body.branch], check=False).returncode:
                raise HTTPException(422, "Enter a valid Git branch name.")
            if body.action == "worktree":
                WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
                destination = WORKSPACE_ROOT.resolve() / ("worktree-" + hashlib.sha256((row.id + body.branch).encode()).hexdigest()[:16])
                if destination.exists():
                    raise HTTPException(409, "Worktree directory already exists.")
                run_git(root, ["worktree", "add", "-b", body.branch, str(destination)], timeout=60)
                child = LocalProject(user_id=user.id, name=row.name + " · " + body.branch, path=str(destination), description="Isolated worktree of " + row.name, remote_url=row.remote_url, language=row.language, framework=row.framework)
                db.add(child)
                db.commit()
                return {"ok": True, "output": "Created isolated worktree.", "project": project_out(child)}
            if body.action == "merge":
                state = git_status(root)
                if state["changes"] or state["merging"]:
                    raise HTTPException(409, "Commit or stash current changes before merging.")
                if body.branch not in state["branches"] or body.branch == state["branch"]:
                    raise HTTPException(422, "Choose another local branch.")
                result = run_git(root, ["-c", "commit.gpgsign=false", "merge", "--no-edit", "--", body.branch], check=False)
                after = git_status(root)
                if result.returncode and not after["merging"]:
                    raise HTTPException(409, "Git could not start the merge. Check Git identity and history.")
                return {"ok": True, "output": "Merge needs conflict resolution." if after["merging"] else "Branch merged.", "status": after}
            arguments = ["switch", "-c", body.branch] if body.action == "branch" else ["switch", "--", body.branch]
        else:
            remote = remote_allowed(run_git(root, ["remote", "get-url", "origin"]).stdout.strip())
            branch = run_git(root, ["branch", "--show-current"]).stdout.strip()
            if not branch:
                raise HTTPException(409, "Check out a branch before syncing.")
            if body.action == "fetch":
                arguments = ["fetch", "--", "origin"]
            elif body.action == "pull":
                arguments = ["pull", "--ff-only", "--", remote, branch]
            else:
                arguments = ["push", "--", remote, "HEAD:refs/heads/" + branch]
        result = run_git(root, arguments, timeout=120)
    return {"ok": True, "output": "Git " + body.action + " completed.", "status": git_status(root)}


@router.post("/{project_id}/vscode", dependencies=[Depends(require_same_origin)])
def open_vscode(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = get_project(db, user, project_id)
    executable = shutil.which("code")
    if not executable:
        raise HTTPException(503, "VS Code command-line launcher is not installed. Enable the code command in VS Code.")
    # .cmd launchers require a shell on Windows, so use the sibling signed application.
    if os.name == "nt" and executable.lower().endswith(".cmd"):
        application = Path(executable).parent.parent / "Code.exe"
        if not application.is_file():
            raise HTTPException(503, "VS Code executable could not be located.")
        executable = str(application)
    subprocess.Popen([executable, "--new-window", row.path], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return {"ok": True}
