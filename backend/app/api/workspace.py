import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import current_user, require_same_origin
from app.core.database import get_db
from app.core.security import decrypt_secret
from app.models import (
    Collection,
    CollectionRepository,
    Favorite,
    OAuthConnection,
    Repository,
    User,
)
from app.schemas.workspace import (
    ActivityItem,
    ActivityOut,
    CollectionCreate,
    CollectionOut,
    CollectionUpdate,
    ExploreOut,
    ExploreRepository,
    OverviewOut,
    RepositoryOut,
    RepositoryPage,
    UserOut,
)
from app.services.github import GitHubAPIError, GitHubClient
from app.services.sync import sync_public_repositories

router = APIRouter(prefix="/api")
_explore_cache: dict[str, tuple[float, dict]] = {}


def _repo_out(repository: Repository, favorite_ids: set[str]) -> RepositoryOut:
    item = RepositoryOut.model_validate(repository)
    item.favorite = repository.id in favorite_ids
    return item


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    connection = db.query(OAuthConnection).filter(OAuthConnection.user_id == user.id).one_or_none()
    count = db.query(func.count(Repository.id)).filter(Repository.user_id == user.id).scalar() or 0
    return UserOut(
        id=user.id,
        login=user.login,
        name=user.name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        repository_count=count,
        synced_at=connection.synced_at if connection else None,
        scopes=connection.scopes if connection else [],
    )


@router.get("/overview", response_model=OverviewOut)
def overview(user: User = Depends(current_user), db: Session = Depends(get_db)):
    repositories = db.query(Repository).filter(Repository.user_id == user.id).all()
    languages: dict[str, int] = {}
    for repository in repositories:
        if repository.primary_language:
            languages[repository.primary_language] = languages.get(repository.primary_language, 0) + 1
    denominator = sum(languages.values()) or 1
    language_rows = [
        {"language": name, "repositories": count, "share": round(count / denominator * 100, 1)}
        for name, count in sorted(languages.items(), key=lambda row: (-row[1], row[0].casefold()))
    ]
    favorite_ids = {
        item[0]
        for item in db.query(Favorite.repository_id).filter(Favorite.user_id == user.id).all()
    }
    recent = sorted(
        repositories,
        key=lambda row: (row.updated_at_github or datetime.min).replace(tzinfo=timezone.utc),
        reverse=True,
    )[:5]
    connection = db.query(OAuthConnection).filter(OAuthConnection.user_id == user.id).one_or_none()
    return OverviewOut(
        total_repositories=len(repositories),
        public_repositories=sum(row.visibility == "public" for row in repositories),
        total_stars=sum(row.stargazers_count for row in repositories),
        total_forks=sum(row.forks_count for row in repositories),
        archived_repositories=sum(row.archived for row in repositories),
        forked_repositories=sum(row.fork for row in repositories),
        favorites=len(favorite_ids),
        primary_languages=language_rows,
        recently_updated=[_repo_out(row, favorite_ids) for row in recent],
        synced_at=connection.synced_at if connection else None,
    )


@router.get("/repositories", response_model=RepositoryPage)
def repositories(
    q: str | None = Query(default=None, max_length=120),
    language: str | None = Query(default=None, max_length=100),
    archived: bool | None = None,
    fork: bool | None = None,
    favorite: bool | None = None,
    sort: str = Query(default="updated", pattern="^(updated|created|name|stars|forks|issues)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Repository).filter(Repository.user_id == user.id)
    if q:
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(Repository.name.ilike(pattern), Repository.full_name.ilike(pattern), Repository.description.ilike(pattern))
        )
    if language:
        query = query.filter(Repository.primary_language == language)
    if archived is not None:
        query = query.filter(Repository.archived.is_(archived))
    if fork is not None:
        query = query.filter(Repository.fork.is_(fork))
    if favorite is not None:
        favorite_repository_ids = db.query(Favorite.repository_id).filter(Favorite.user_id == user.id)
        if favorite:
            query = query.filter(Repository.id.in_(favorite_repository_ids))
        else:
            query = query.filter(~Repository.id.in_(favorite_repository_ids))

    total = query.count()
    sort_column = {
        "updated": Repository.updated_at_github,
        "created": Repository.created_at_github,
        "name": Repository.full_name,
        "stars": Repository.stargazers_count,
        "forks": Repository.forks_count,
        "issues": Repository.open_issues_count,
    }[sort]
    query = query.order_by(sort_column.asc() if order == "asc" else sort_column.desc(), Repository.full_name.asc())
    page_items = query.offset((page - 1) * page_size).limit(page_size).all()
    page_ids = [row.id for row in page_items]
    favorite_ids = {
        item[0]
        for item in db.query(Favorite.repository_id)
        .filter(Favorite.user_id == user.id, Favorite.repository_id.in_(page_ids))
        .all()
    }
    return RepositoryPage(
        items=[_repo_out(row, favorite_ids) for row in page_items], total=total, page=page, page_size=page_size
    )


@router.get("/repositories/{owner}/{name}", response_model=RepositoryOut)
def repository_detail(owner: str, name: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = (
        db.query(Repository)
        .filter(Repository.user_id == user.id, Repository.owner_login.ilike(owner), Repository.name.ilike(name))
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Repository not found in this account's synchronized data.")
    favorite = db.query(Favorite.id).filter(Favorite.user_id == user.id, Favorite.repository_id == row.id).first()
    return _repo_out(row, {row.id} if favorite else set())


@router.post("/sync", dependencies=[Depends(require_same_origin)])
async def sync(user: User = Depends(current_user), db: Session = Depends(get_db)):
    connection = db.query(OAuthConnection).filter(OAuthConnection.user_id == user.id).one_or_none()
    if connection is None:
        raise HTTPException(status_code=401, detail="Reconnect GitHub to synchronize repositories.")
    client = GitHubClient(decrypt_secret(connection.encrypted_access_token))
    try:
        count = await sync_public_repositories(db, user.id, connection, client, user.login)
    except GitHubAPIError as exc:
        db.rollback()
        status = 429 if exc.status_code in (403, 429) and exc.retry_after else 502
        raise HTTPException(
            status_code=status,
            detail={"message": exc.message, "retry_after": exc.retry_after},
        ) from exc
    finally:
        await client.close()
    return {"repository_count": count, "synced_at": connection.synced_at}


@router.put("/favorites/{github_id}", status_code=204, dependencies=[Depends(require_same_origin)])
def add_favorite(github_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    repository = (
        db.query(Repository)
        .filter(Repository.user_id == user.id, Repository.github_id == github_id)
        .one_or_none()
    )
    if repository is None:
        raise HTTPException(status_code=404, detail="Repository not found in this account.")
    existing = db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.repository_id == repository.id).first()
    if existing is None:
        db.add(Favorite(user_id=user.id, repository_id=repository.id))
        db.commit()
    return Response(status_code=204)


@router.delete("/favorites/{github_id}", status_code=204, dependencies=[Depends(require_same_origin)])
def remove_favorite(github_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    repository = (
        db.query(Repository)
        .filter(Repository.user_id == user.id, Repository.github_id == github_id)
        .one_or_none()
    )
    if repository:
        db.query(Favorite).filter(Favorite.user_id == user.id, Favorite.repository_id == repository.id).delete()
        db.commit()
    return Response(status_code=204)


@router.get("/collections", response_model=list[CollectionOut])
def collections(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Collection).filter(Collection.user_id == user.id).order_by(Collection.created_at.desc()).all()
    return [
        CollectionOut(
            id=row.id,
            name=row.name,
            description=row.description,
            color=row.color,
            repository_count=db.query(func.count(CollectionRepository.id))
            .filter(CollectionRepository.collection_id == row.id)
            .scalar()
            or 0,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/collections", response_model=CollectionOut, status_code=201, dependencies=[Depends(require_same_origin)])
def create_collection(payload: CollectionCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = Collection(user_id=user.id, name=payload.name.strip(), description=payload.description, color=payload.color)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A collection with this name already exists.") from exc
    return CollectionOut(id=row.id, name=row.name, description=row.description, color=row.color, repository_count=0, created_at=row.created_at)


@router.patch("/collections/{collection_id}", response_model=CollectionOut, dependencies=[Depends(require_same_origin)])
def update_collection(
    collection_id: str,
    payload: CollectionUpdate,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    row = db.query(Collection).filter(Collection.id == collection_id, Collection.user_id == user.id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Collection not found.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, key, value.strip() if key == "name" and value else value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A collection with this name already exists.") from exc
    count = db.query(func.count(CollectionRepository.id)).filter(CollectionRepository.collection_id == row.id).scalar() or 0
    return CollectionOut(id=row.id, name=row.name, description=row.description, color=row.color, repository_count=count, created_at=row.created_at)


@router.delete("/collections/{collection_id}", status_code=204, dependencies=[Depends(require_same_origin)])
def delete_collection(collection_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.query(Collection).filter(Collection.id == collection_id, Collection.user_id == user.id).one_or_none()
    if row:
        db.delete(row)
        db.commit()
    return Response(status_code=204)


def _get_owned_collection(collection_id: str, user: User, db: Session) -> Collection:
    row = db.query(Collection).filter(Collection.id == collection_id, Collection.user_id == user.id).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Collection not found.")
    return row


@router.put("/collections/{collection_id}/repositories/{github_id}", status_code=204, dependencies=[Depends(require_same_origin)])
def add_to_collection(
    collection_id: str, github_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    collection = _get_owned_collection(collection_id, user, db)
    repository = db.query(Repository).filter(Repository.user_id == user.id, Repository.github_id == github_id).one_or_none()
    if repository is None:
        raise HTTPException(status_code=404, detail="Repository not found in this account.")
    membership = db.query(CollectionRepository).filter(
        CollectionRepository.collection_id == collection.id,
        CollectionRepository.repository_id == repository.id,
    ).first()
    if membership is None:
        db.add(CollectionRepository(collection_id=collection.id, repository_id=repository.id))
        db.commit()
    return Response(status_code=204)


@router.delete("/collections/{collection_id}/repositories/{github_id}", status_code=204, dependencies=[Depends(require_same_origin)])
def remove_from_collection(
    collection_id: str, github_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    collection = _get_owned_collection(collection_id, user, db)
    repository = db.query(Repository).filter(Repository.user_id == user.id, Repository.github_id == github_id).one_or_none()
    if repository:
        db.query(CollectionRepository).filter(
            CollectionRepository.collection_id == collection.id,
            CollectionRepository.repository_id == repository.id,
        ).delete()
        db.commit()
    return Response(status_code=204)


@router.get("/collections/{collection_id}/repositories", response_model=RepositoryPage)
def collection_repositories(
    collection_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    collection = _get_owned_collection(collection_id, user, db)
    query = (
        db.query(Repository)
        .join(CollectionRepository, CollectionRepository.repository_id == Repository.id)
        .filter(CollectionRepository.collection_id == collection.id, Repository.user_id == user.id)
        .order_by(Repository.updated_at_github.desc())
    )
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    favorite_ids = {row[0] for row in db.query(Favorite.repository_id).filter(Favorite.user_id == user.id).all()}
    return RepositoryPage(items=[_repo_out(row, favorite_ids) for row in rows], total=total, page=page, page_size=page_size)


@router.get("/activity", response_model=ActivityOut)
async def activity(user: User = Depends(current_user), db: Session = Depends(get_db)):
    connection = db.query(OAuthConnection).filter(OAuthConnection.user_id == user.id).one_or_none()
    if connection is None:
        raise HTTPException(status_code=401, detail="Reconnect GitHub to load activity.")
    client = GitHubClient(decrypt_secret(connection.encrypted_access_token))
    try:
        events = await client.public_events(user.login)
    except GitHubAPIError as exc:
        status = 429 if exc.status_code in (403, 429) and exc.retry_after else 502
        raise HTTPException(status_code=status, detail=exc.message) from exc
    finally:
        await client.close()

    items = []
    for event in events:
        kind = event.get("type") or "GitHubEvent"
        repository = event.get("repo") or {}
        payload = event.get("payload") or {}
        action = payload.get("action")
        label = kind.removesuffix("Event")
        summary = f"{label} on {repository.get('name', 'a repository')}"
        if kind == "PushEvent":
            summary = f"Pushed changes to {repository.get('name', 'a repository')}"
        elif action:
            summary = f"{label} {action} on {repository.get('name', 'a repository')}"
        items.append(
            ActivityItem(
                id=str(event.get("id", "")),
                type=kind,
                repository=repository.get("name", ""),
                url=f"https://github.com/{repository.get('name', '')}",
                created_at=datetime.fromisoformat(event["created_at"].replace("Z", "+00:00")),
                summary=summary,
            )
        )
    return ActivityOut(items=items, coverage_note="Public GitHub events only. The API returns up to 300 events from the last 30 days and may deliver events with a delay.")


@router.get("/explore", response_model=ExploreOut)
async def explore(q: str = Query(min_length=2, max_length=120)):
    query = q.strip()
    cache_key = query.casefold()
    cached = _explore_cache.get(cache_key)
    if cached and cached[0] > time.monotonic():
        return ExploreOut.model_validate(cached[1])
    client = GitHubClient()
    try:
        remote_items, total, remaining = await client.search_repositories(query)
    except GitHubAPIError as exc:
        status = 429 if exc.status_code in (403, 429) and exc.retry_after else 502
        raise HTTPException(status_code=status, detail=exc.message) from exc
    finally:
        await client.close()
    items = [
        ExploreRepository(
            id=int(item["id"]),
            full_name=item["full_name"],
            description=item.get("description"),
            html_url=item["html_url"],
            language=item.get("language"),
            stargazers_count=int(item.get("stargazers_count") or 0),
            forks_count=int(item.get("forks_count") or 0),
            updated_at=datetime.fromisoformat(item["updated_at"].replace("Z", "+00:00")) if item.get("updated_at") else None,
        )
        for item in remote_items
    ]
    result = ExploreOut(items=items, total_count=total, rate_limit_remaining=remaining)
    if len(_explore_cache) > 100:
        _explore_cache.clear()
    _explore_cache[cache_key] = (time.monotonic() + 45, result.model_dump(mode="json"))
    return result
