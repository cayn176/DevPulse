import { request } from './api'
export type RuntimeProvider = { id: string; name: string; installed: boolean; status: string; version?: string; error?: string; capabilities: Record<string, boolean | string[]>; account?: Record<string, unknown>; usage?: Record<string, unknown>; models?: { id: string; name?: string; displayName?: string; model?: string }[] }
export type RuntimeEvent = { seq: number; provider: string; session_id?: string; type: string; data: Record<string, unknown>; timestamp?: string }
export type NativeSession = { id: string; provider: string; project_id?: string; cwd?: string; title?: string; model?: string; mode?: string; status?: string; pinned?: boolean; archived?: boolean; updated_at?: string; messages?: { role: string; text: string; timestamp?: string }[]; events?: RuntimeEvent[]; raw_history?: unknown }
const body = (value?: unknown) => ({ method: 'POST', ...(value === undefined ? {} : { body: JSON.stringify(value) }) })
const root = '/api/runtime'
export const runtime = {
  providers: () => request<RuntimeProvider[]>(root + '/providers'),
  connect: (id: string) => request<RuntimeProvider>(root + '/' + id + '/connect', body()),
  login: (id: string) => request<Record<string, unknown>>(root + '/' + id + '/login', body()),
  disconnect: (id: string) => request(root + '/' + id + '/disconnect', body()),
  sessions: (id: string, project: string) => request<{ items: NativeSession[] }>(root + '/' + id + '/sessions?project_id=' + encodeURIComponent(project)),
  session: (id: string, session: string, project: string) => request<NativeSession>(root + '/' + id + '/sessions/' + encodeURIComponent(session) + '?project_id=' + encodeURIComponent(project)),
  create: (id: string, project: string, model: string, mode: string) => request<NativeSession>(root + '/' + id + '/sessions', body({ project_id: project, ...(model ? { model } : {}), mode })),
  resume: (id: string, session: string, project: string) => request(root + '/' + id + '/sessions/' + encodeURIComponent(session) + '/resume', body({ project_id: project })),
  send: (id: string, session: string, text: string, model: string, mode: string) => request(root + '/' + id + '/sessions/' + encodeURIComponent(session) + '/messages', body({ text, ...(model ? { model } : {}), mode })),
  interrupt: (id: string, session: string) => request(root + '/' + id + '/sessions/' + encodeURIComponent(session) + '/interrupt', body()),
  archive: (id: string, session: string) => request(root + '/' + id + '/sessions/' + encodeURIComponent(session) + '/archive', body()),
  update: (id: string, session: string, values: Record<string, unknown>) => request(root + '/' + id + '/sessions/' + encodeURIComponent(session), { method: 'PATCH', body: JSON.stringify(values) }),
  approvals: () => request<{ id: string; provider: string; session_id: string; method?: string; options?: { optionId: string; name: string; kind: string }[]; request?: unknown }[]>(root + '/approvals'),
  decide: (id: string, decision: string, option_id?: string) => request(root + '/approvals/' + encodeURIComponent(id), body({ decision, option_id })),
}
