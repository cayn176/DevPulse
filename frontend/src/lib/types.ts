export type User = {
  id: string
  login: string
  name: string | null
  avatar_url: string | null
  bio: string | null
  repository_count: number
  synced_at: string | null
  scopes: string[]
}

export type Repository = {
  id: string
  github_id: number
  name: string
  full_name: string
  owner_login: string
  description: string | null
  html_url: string
  clone_url: string
  ssh_url: string
  homepage: string | null
  visibility: string
  primary_language: string | null
  stargazers_count: number
  forks_count: number
  watchers_count: number
  open_issues_count: number
  default_branch: string | null
  license_name: string | null
  topics: string[]
  archived: boolean
  fork: boolean
  created_at_github: string | null
  updated_at_github: string | null
  pushed_at_github: string | null
  favorite: boolean
}

export type RepositoryPage = {
  items: Repository[]
  total: number
  page: number
  page_size: number
}

export type Overview = {
  total_repositories: number
  public_repositories: number
  total_stars: number
  total_forks: number
  archived_repositories: number
  forked_repositories: number
  favorites: number
  primary_languages: { language: string; repositories: number; share: number }[]
  recently_updated: Repository[]
  synced_at: string | null
}

export type Activity = {
  items: { id: string; type: string; repository: string; url: string; created_at: string; summary: string }[]
  coverage_note: string
}

export type Collection = {
  id: string
  name: string
  description: string | null
  color: string
  repository_count: number
  created_at: string
}

export type ExploreRepository = {
  id: number
  full_name: string
  description: string | null
  html_url: string
  language: string | null
  stargazers_count: number
  forks_count: number
  updated_at: string | null
}
