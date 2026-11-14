import { request } from './api'

export type ProviderConnection = { provider: string; connected: boolean; installed: boolean | null; model: string; local_enabled: boolean; server_managed: boolean }
export type Proposal = { files: { path: string; content: string; diff: string }[]; base_sha: string | null; base_branch: string | null; url?: string; branch_created?: boolean }
export type ChatMessage = { id: string; role: string; text: string; provider: string; tool?: string; links?: {path:string; label:string}[]; issue_draft?: {id:string; repository:string; title:string; body:string; url?:string; submitted?:boolean}; proposal?: Proposal | null }
export type AIThread = { id: string; title: string; repository: string | null; messages: ChatMessage[]; status: string; cursor_agent_id: string | null; cursor_run_id: string | null; cursor_result: Record<string, unknown> | null }
const json = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
export const ai = {
  connections: () => request<ProviderConnection[]>('/api/ai/connections'),
  connect: (provider: string, key: string, model: string) => request('/api/ai/connections/' + provider, json('PUT', { key, model })),
  disconnect: (provider: string) => request('/api/ai/connections/' + provider, json('DELETE')),
  threads: () => request<AIThread[]>('/api/ai/threads'),
  thread: (id: string) => request<AIThread>('/api/ai/threads/' + id),
  create: (repository: string | null) => request<AIThread>('/api/ai/threads', json('POST', { repository })),
  remove: (id: string) => request('/api/ai/threads/' + id, json('DELETE')),
  send: (id: string, provider: string, text: string, paths: string[], project_id?: string, model?: string) => request<AIThread>('/api/ai/threads/' + id + '/messages', json('POST', { provider, text, paths, project_id, model })),
  apply: (id: string, messageId: string) => request<{ url: string }>('/api/ai/threads/' + id + '/apply/' + messageId, json('POST')),
  models: () => request<{models:string[]}>('/api/ai/local-models'),
  publishIssue: (id:string,message:string) => request<{url:string}>('/api/ai/threads/'+id+'/issues/'+message,json('POST',{confirm:true})),
  createRepository: (name: string, description: string, privateRepo: boolean) => request<{ full_name: string; url: string }>('/api/ai/repositories', json('POST', { name, description, private: privateRepo })),
  cursor: (id: string, text: string) => request<AIThread>('/api/ai/threads/' + id + '/cursor', json('POST', { text, confirm_branch_writes: true })),
  cursorSync: (id: string) => request<AIThread>('/api/ai/threads/' + id + '/cursor/sync', json('POST')),
}
export const providerNames: Record<string, string> = { managed: 'DevPulse AI', workspace: 'Workspace tools', ollama: 'Ollama (local)', openai: 'OpenAI API', anthropic: 'Claude API', codex: 'Codex CLI', 'claude-code': 'Claude Code', cursor: 'Cursor Cloud' }
