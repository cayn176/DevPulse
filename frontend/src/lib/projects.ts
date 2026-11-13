import { request } from './api'

export type LocalProject = { id: string; name: string; description: string; path: string; remote_url: string | null; language: string | null; framework: string | null; created_at: string; last_opened: string }
export type ProjectFile = { path: string; content: string; hash: string }
export type TreeEntry = { name: string; path: string; directory: boolean; size: number | null }
export type GitChange = { path: string; status: string; staged: boolean; unstaged: boolean; conflicted?: boolean }
export type GitState = { is_repository: boolean; branch: string | null; changes: GitChange[]; branches: string[]; commits: { sha: string; message: string; author: string; date: string }[]; merging?: boolean }
export type GitAction = { action: string; paths?: string[]; message?: string; branch?: string; confirm: boolean }
const body = (method: string, value?: unknown) => ({ method, ...(value === undefined ? {} : { body: JSON.stringify(value) }) })
export const projects = {
  list: (q = '', language = '') => request<LocalProject[]>('/api/projects?q=' + encodeURIComponent(q) + '&language=' + encodeURIComponent(language)),
  get: (id: string) => request<LocalProject>('/api/projects/' + id),
  create: (value: { name: string; description: string; action: string; path?: string; remote_url?: string; use_github_account?: boolean }) => request<LocalProject>('/api/projects', body('POST', { ...value, confirm: true })),
  open: (id: string) => request<LocalProject>('/api/projects/' + id + '/open', body('POST')),
  tree: (id: string, path = '') => request<{ items: TreeEntry[]; limited: boolean }>('/api/projects/' + id + '/tree?path=' + encodeURIComponent(path)),
  read: (id: string, path: string) => request<ProjectFile>('/api/projects/' + id + '/file?path=' + encodeURIComponent(path)),
  write: (id: string, path: string, content: string, expected_hash: string | null) => request<ProjectFile>('/api/projects/' + id + '/file', body('PUT', { path, content, expected_hash })),
  search: (id: string, q: string) => request<{ matches: { path: string; line: number; text: string }[]; limited: boolean }>('/api/projects/' + id + '/search?q=' + encodeURIComponent(q)),
  git: (id: string) => request<GitState>('/api/projects/' + id + '/git'),
  diff: (id: string, path: string, staged = false) => request<{ path: string; original: string; modified: string; diff: string }>('/api/projects/' + id + '/diff?path=' + encodeURIComponent(path) + '&staged=' + staged),
  act: (id: string, action: GitAction) => request<{ ok: boolean; output: string; status?: GitState; project?: LocalProject }>('/api/projects/' + id + '/git', body('POST', action)),
  fileOperation: (id: string, action:'mkdir'|'rename'|'delete', path:string, expected_hash?:string, destination?:string) => request<{path:string}>('/api/projects/'+id+'/files',body('POST',{action,path,destination,expected_hash,confirm:true})),
  commit: (id:string, sha:string) => request<{sha:string;parents:string[];author:string;date:string;message:string;paths:string[]}>('/api/projects/'+id+'/commits/'+encodeURIComponent(sha)),
  conflict: (id:string,path:string) => request<{current:string|null;incoming:string|null}>('/api/projects/'+id+'/conflict?path='+encodeURIComponent(path)),
  command: (id:string,command:string) => request<{command:string; output:string}>('/api/projects/'+id+'/terminal',body('POST',{command})),
  vscode: (id: string) => request('/api/projects/' + id + '/vscode', body('POST')),
}

export async function chooseFolder(): Promise<string | null> {
  const bridge = (window as unknown as { devpulse?: { chooseFolder?: () => Promise<string | null> } }).devpulse
  return bridge?.chooseFolder ? bridge.chooseFolder() : null
}

export function hasFolderPicker() {
  return !!(window as unknown as { devpulse?: { chooseFolder?: unknown } }).devpulse?.chooseFolder
}
