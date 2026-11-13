import { useCallback, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, GitBranch as Github, KeyRound, ShieldCheck } from 'lucide-react'
import { DeviceLogin } from '../components/DeviceLogin'
import { Brand } from '../components/Brand'
import { Button, Input, Panel } from '../components/Primitives'
import { request } from '../lib/api'

export function ConnectPage() {
  const [token, setToken] = useState('')
  const navigate = useNavigate()
  const client = useQueryClient()
  const status = useQuery({ queryKey: ['connection-status'], queryFn: () => request<{ oauth_ready: boolean; device_client_configured:boolean; token_ready: boolean; local_ready: boolean; callback_url: string; frontend_origin: string }>('/auth/status'), retry: false })
  useEffect(() => {
    if (status.data && window.location.origin !== status.data.frontend_origin) window.location.replace(status.data.frontend_origin + '/connect')
  }, [status.data])
  const onDone=useCallback(()=>{client.clear();navigate('/app')},[client,navigate])
  const connect = useMutation({ mutationFn: () => request<{ ok: boolean; sync_partial: boolean }>('/auth/token', { method: 'POST', body: JSON.stringify({ token }) }), onSuccess: async () => { setToken(''); onDone() } })
  const local = useMutation({ mutationFn: () => request('/auth/local', { method: 'POST' }), onSuccess: async () => { onDone() } })
  return <main className="connect-page"><Brand /><Panel className="connect-card"><span className="ai-kicker"><Github size={16} /> CONNECT YOUR WORKSPACE</span><h1>Your GitHub.<br />Ready to build.</h1><p>Connect your account to organize repositories and work with your AI assistants.</p>
    {status.isPending && <p role="status">Checking connection service…</p>}
    {status.isError && <div className="inline-alert" role="alert">The DevPulse API is offline. Run start.ps1 from the project folder, then <button onClick={() => status.refetch()}>retry</button>.</div>}
    {status.data?.local_ready && <Button loading={local.isPending} onClick={() => local.mutate()}>Open local workspace</Button>}{local.isError && <p role="alert">{local.error.message}</p>}
    {status.data && <>{status.data.oauth_ready ? <Button variant="primary" onClick={() => { window.location.href = '/auth/github/start' }}><Github size={16} />Continue with GitHub</Button> : <DeviceLogin configured={status.data.device_client_configured} onDone={onDone}/>}
      {!status.data.oauth_ready && status.data.local_ready && <details className="setup-details"><summary>Configure browser OAuth for this server</summary><p>Create a GitHub OAuth App, then set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in backend/.env. Restart the API.</p><a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">Open GitHub developer settings ↗</a><p>Callback URL:</p><code>{status.data.callback_url}</code></details>}
      <div className="connect-divider"><span />or connect with a personal token<span /></div>
      <form onSubmit={(event) => { event.preventDefault(); connect.mutate() }} className="ai-form"><label>GitHub personal access token<Input type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="github_pat_…" required minLength={10} /></label><p>A fine-grained token can be limited to selected repositories. For AI changes, enable Contents and Pull requests read/write. Creating repositories also requires Administration write permission.</p><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create a token on GitHub ↗</a><Button type="submit" variant="primary" disabled={!status.data.token_ready} loading={connect.isPending}><KeyRound size={15} />Connect account <ArrowRight size={15} /></Button></form>
      {!status.data.token_ready && <p className="inline-alert">Run the startup script to generate the server encryption key.</p>}
    </>}
    {connect.isError && <p className="inline-alert" role="alert">{connect.error.message}</p>}
    <p className="connect-security"><ShieldCheck size={16} />Your token is encrypted on the DevPulse server. It is never saved in browser storage.</p><Link to="/">← Back to DevPulse</Link>
  </Panel></main>
}
