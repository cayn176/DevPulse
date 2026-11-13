from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    id: str
    login: str
    name: str | None
    avatar_url: str | None
    bio: str | None
    repository_count: int
    synced_at: datetime | None
    scopes: list[str]


class RepositoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    github_id: int
    name: str
    full_name: str
    owner_login: str
    description: str | None
    html_url: str
    clone_url: str
    ssh_url: str
    homepage: str | None
    visibility: str
    primary_language: str | None
    stargazers_count: int
    forks_count: int
    watchers_count: int
    open_issues_count: int
    default_branch: str | None
    license_name: str | None
    topics: list[str]
    archived: bool
    fork: bool
    created_at_github: datetime | None
    updated_at_github: datetime | None
    pushed_at_github: datetime | None
    favorite: bool = False


class RepositoryPage(BaseModel):
    items: list[RepositoryOut]
    total: int
    page: int
    page_size: int


class OverviewOut(BaseModel):
    total_repositories: int
    public_repositories: int
    total_stars: int
    total_forks: int
    archived_repositories: int
    forked_repositories: int
    favorites: int
    primary_languages: list[dict[str, int | str | float]]
    recently_updated: list[RepositoryOut]
    synced_at: datetime | None


class CollectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=240)
    color: str = Field(default="violet", pattern="^(violet|blue|green|amber|rose)$")


class CollectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=240)
    color: str | None = Field(default=None, pattern="^(violet|blue|green|amber|rose)$")


class CollectionOut(BaseModel):
    id: str
    name: str
    description: str | None
    color: str
    repository_count: int
    created_at: datetime


class ActivityItem(BaseModel):
    id: str
    type: str
    repository: str
    url: str
    created_at: datetime
    summary: str


class ActivityOut(BaseModel):
    items: list[ActivityItem]
    coverage_note: str


class ExploreRepository(BaseModel):
    id: int
    full_name: str
    description: str | None
    html_url: str
    language: str | None
    stargazers_count: int
    forks_count: int
    updated_at: datetime | None


class ExploreOut(BaseModel):
    items: list[ExploreRepository]
    total_count: int
    rate_limit_remaining: int | None = None
