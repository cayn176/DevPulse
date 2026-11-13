import type {
  Activity,
  Collection,
  ExploreRepository,
  Overview,
  Repository,
  RepositoryPage,
  User,
} from './types'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : detail?.message
    throw new ApiError(response.status, message || 'Request failed (' + response.status + ').')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function queryString(values: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  })
  const query = params.toString()
  return query ? '?' + query : ''
}

export const api = {
  me: () => request<User>('/api/me'),
  overview: () => request<Overview>('/api/overview'),
  repositories: (filters: Record<string, string | number | boolean | null | undefined> = {}) =>
    request<RepositoryPage>('/api/repositories' + queryString(filters)),
  repository: (owner: string, name: string) =>
    request<Repository>('/api/repositories/' + encodeURIComponent(owner) + '/' + encodeURIComponent(name)),
  activity: () => request<Activity>('/api/activity'),
  explore: (q: string) =>
    request<{ items: ExploreRepository[]; total_count: number; rate_limit_remaining: number | null }>('/api/explore' + queryString({ q })),
  collections: () => request<Collection[]>('/api/collections'),
  collectionRepositories: (id: string) => request<RepositoryPage>('/api/collections/' + id + '/repositories'),
  sync: () => request<{ repository_count: number; synced_at: string }>('/api/sync', { method: 'POST' }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  disconnect: () => request<{ ok: boolean; github_revocation_failed: boolean }>('/auth/account', { method: 'DELETE' }),
  favorite: (githubId: number, active: boolean) =>
    request<void>('/api/favorites/' + githubId, { method: active ? 'PUT' : 'DELETE' }),
  createCollection: (name: string, color: string) =>
    request<Collection>('/api/collections', { method: 'POST', body: JSON.stringify({ name, color }) }),
  updateCollection: (id: string, name: string, color: string) =>
    request<Collection>('/api/collections/' + id, { method: 'PATCH', body: JSON.stringify({ name, color }) }),
  deleteCollection: (id: string) => request<void>('/api/collections/' + id, { method: 'DELETE' }),
  addToCollection: (collectionId: string, githubId: number) =>
    request<void>('/api/collections/' + collectionId + '/repositories/' + githubId, { method: 'PUT' }),
  removeFromCollection: (collectionId: string, githubId: number) =>
    request<void>('/api/collections/' + collectionId + '/repositories/' + githubId, { method: 'DELETE' }),
}
