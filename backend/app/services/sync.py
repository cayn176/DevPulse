from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import OAuthConnection, Repository
from app.services.github import GitHubClient


def parse_github_date(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def sync_public_repositories(
    db: Session, user_id: str, connection: OAuthConnection, client: GitHubClient, login: str
) -> int:
    remote_repositories = await client.public_repositories(login)
    seen_ids: set[int] = set()
    for item in remote_repositories:
        github_id = int(item["id"])
        seen_ids.add(github_id)
        repository = (
            db.query(Repository)
            .filter(Repository.user_id == user_id, Repository.github_id == github_id)
            .one_or_none()
        )
        if repository is None:
            repository = Repository(user_id=user_id, github_id=github_id, name=item["name"], full_name=item["full_name"], owner_login=item["owner"]["login"], html_url=item["html_url"], clone_url=item["clone_url"], ssh_url=item["ssh_url"])
            db.add(repository)
        repository.name = item["name"]
        repository.full_name = item["full_name"]
        repository.owner_login = item["owner"]["login"]
        repository.description = item.get("description")
        repository.html_url = item["html_url"]
        repository.clone_url = item["clone_url"]
        repository.ssh_url = item["ssh_url"]
        repository.homepage = item.get("homepage")
        repository.visibility = item.get("visibility") or ("private" if item.get("private") else "public")
        repository.primary_language = item.get("language")
        repository.stargazers_count = int(item.get("stargazers_count") or 0)
        repository.forks_count = int(item.get("forks_count") or 0)
        repository.watchers_count = int(item.get("watchers_count") or 0)
        repository.open_issues_count = int(item.get("open_issues_count") or 0)
        repository.default_branch = item.get("default_branch")
        license_data = item.get("license") or {}
        repository.license_name = license_data.get("spdx_id") or license_data.get("name")
        repository.topics = item.get("topics") or []
        repository.archived = bool(item.get("archived"))
        repository.fork = bool(item.get("fork"))
        repository.created_at_github = parse_github_date(item.get("created_at"))
        repository.updated_at_github = parse_github_date(item.get("updated_at"))
        repository.pushed_at_github = parse_github_date(item.get("pushed_at"))
        repository.synced_at = datetime.now(timezone.utc)

    existing = db.query(Repository).filter(Repository.user_id == user_id).all()
    for repository in existing:
        if repository.github_id not in seen_ids:
            db.delete(repository)

    connection.synced_at = datetime.now(timezone.utc)
    db.commit()
    return len(remote_repositories)
