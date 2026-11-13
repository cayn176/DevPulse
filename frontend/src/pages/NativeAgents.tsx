import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Bot, Command, Terminal, Activity, Pin, PanelRightClose, Plus, Send, Square } from 'lucide-react'
import { Button, Input, PageHeading, Panel } from '../components/Primitives'
import { runtime, type NativeSession, type RuntimeProvider, type RuntimeEvent } from '../lib/runtime'
import { projects } from '../lib/projects'
import { request } from '../lib/api'

const marks = { codex: Terminal, claude: Bot, cursor: Command }
const guides: Record<string, string> = { codex: 'Install the Codex CLI and verify your account through App Server.', claude: 'Save an Anthropic API key in Integrations to use the Claude Agent SDK.', cursor: 'Install the Cursor Agent CLI and run agent login to authenticate.' }
export const useProviders = () => useQuery({ queryKey: ['runtime-providers'], queryFn: runtime.providers })
export const useActivity = () => useQuery({ queryKey: ['native-activity'], queryFn: () => request<NativeSession[]>('/api/runtime/activity'), refetchInterval: 10000 })

function AgentCard({ provider: p, sessions, models }: { provider: RuntimeProvider; sessions: NativeSession[]; models: boolean }) {
  const cache = useQueryClient()
  const [loginUrl, setLoginUrl] = useState('')
  const [notice, setNotice] = useState('')
  const Icon = marks[p.id as keyof typeof marks] || Bot
  const action = useMutation({ mutationFn: async (type: string) => {
    setNotice('')
    if (type === 'login') {
      const result = await runtime.login(p.id)
      if (typeof result.url === 'string' && result.url.startsWith('https://')) setLoginUrl(result.url)
      setNotice(String(result.message || 'Complete sign-in and verify.'))
    } else if (type === 'disconnect') await runtime.disconnect(p.id)
    else await runtime.connect(p.id)
  }, onSettled: () => cache.invalidateQueries({queryKey:['runtime-providers']}) })
  return <Panel className="native-card"><div className="spread"><span className="tool-mark"><Icon size={22}/></span><small className={'runtime-status ' + p.status}>{p.status.replaceAll('_',' ')}</small></div>
    <h2>{p.name}</h2><p>{guides[p.id]}</p>
    {p.version && <small className="wrap">{p.version}</small>}
    <div className="detail-grid"><span>Sessions</span><strong>{sessions.length}</strong><span>Last activity</span><strong>{sessions[0]?.updated_at ? new Date(sessions[0].updated_at).toLocaleDateString() : '—'}</strong></div>
    {p.account && <details><summary>Account</summary><pre>{JSON.stringify(p.account,null,2)}</pre></details>}
    {p.usage && <details><summary>Reported usage limits</summary><pre>{JSON.stringify(p.usage,null,2)}</pre></details>}
    {models && <div><h3>Available models</h3>{p.models?.length ? p.models.map(m => <div className="row-line" key={m.id}>{m.name || m.id}</div>) : <p>Model information is unavailable for this connection.</p>}</div>}
    <div className="quick-links"><Button loading={action.isPending} disabled={!p.installed} onClick={() => action.mutate('verify')}>Verify connection</Button>
    {p.installed && p.id !== 'claude' && p.status !== 'connected' && <Button onClick={() => action.mutate('login')} disabled={action.isPending}>Sign in</Button>}
    {p.status === 'connected' && <><Link to={'/app/conversations?agent='+p.id}>Open chat →</Link><Button onClick={() => action.mutate('disconnect')}>Disconnect</Button></>}
    <Link to={p.id === 'claude' ? '/app/integrations' : '/app/guides'}>Setup</Link></div>
    {notice && <p>{notice}</p>}{loginUrl && <a href={loginUrl} target="_blank" rel="noreferrer">Continue official sign-in ↗</a>}
    {action.error && <p role="alert" className="inline-alert">{action.error.message}</p>}
  </Panel>
}
export function AgentsPage() {
  const providers = useProviders(), activity = useActivity()
  const models = useLocation().pathname.endsWith('models')
  return <div className="page-stack"><PageHeading eyebrow="AI WORKSPACE" title={models ? 'Models & accounts' : 'Agents'} description={models ? 'Models and account details reported by your connected providers.' : 'Connect a coding agent to your local projects.'}/>
    {providers.error && <p role="alert">{providers.error.message}</p>}
    <div className="native-grid">{providers.data?.map(p => <AgentCard key={p.id} provider={p} models={models} sessions={(activity.data||[]).filter(s=>s.provider===p.id).sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))}/>)}</div>
  </div>
}

function readableHistory(value: unknown): {role:string;text:string}[] {
  if (!value || typeof value !== 'object') return []
  const data = value as Record<string,unknown>
  if (data.type === 'agentMessage' && typeof data.text === 'string') return [{role:'assistant',text:data.text}]
  const content = data.content ?? (data.message as {content?:unknown})?.content
  if (['userMessage','user','assistant'].includes(String(data.type)) && content) {
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map(c=>c.text||'').join('\n') : ''
    return text ? [{role:data.type==='userMessage'?'user':String(data.type),text}] : []
  }
  return Object.values(data).filter(v=>v && typeof v==='object').flatMap(readableHistory)
}

export function ConversationsPage() {
  const [params,setParams] = useSearchParams()
  const providers = useProviders(), cache = useQueryClient()
  const all = useQuery({queryKey:['local-projects'],queryFn:()=>projects.list()})
  const provider = params.get('agent') || 'codex', project = params.get('project') || all.data?.[0]?.id || '', sid=params.get('session') || ''
  const p = providers.data?.find(x=>x.id===provider)
  const [text,setText]=useState(''), [filter,setFilter]=useState(''), [archived,setArchived]=useState(false)
  const [model,setModel]=useState(''), [mode,setMode]=useState('ask'), [aside,setAside]=useState(true)
  const [delta,setDelta]=useState(''), [title,setTitle]=useState(''), [live,setLive]=useState<RuntimeEvent[]>([])
  const list=useQuery({queryKey:['native-list',provider,project],queryFn:()=>runtime.sessions(provider,project),enabled:!!project})
  const detail=useQuery({queryKey:['native-session',provider,sid],queryFn:()=>runtime.session(provider,sid,project),enabled:!!sid})
  const approvals=useQuery({queryKey:['approvals'],queryFn:runtime.approvals,enabled:!!sid,refetchInterval:5000})
  const git=useQuery({queryKey:['chat-git',project],queryFn:()=>projects.git(project),enabled:!!project && aside,refetchInterval:15000})
  const session=detail.data, busy=session && ['running','awaiting_approval'].includes(session.status||'')
  function select(nextProvider:string,nextProject:string,nextSession='') {
    setParams({agent:nextProvider,project:nextProject,...(nextSession?{session:nextSession}:{})})
  }
  useEffect(()=>{setDelta('');setLive([]);setText('');setModel('');setMode('ask');setTitle('')},[provider,project,sid])
  useEffect(()=>{if(session){setTitle(session.title||'');setMode(session.mode||'ask');setModel(session.model||'')}},[session?.id, session?.title, session?.mode, session?.model])
  useEffect(()=>{
    if(!sid)return
    const source=new EventSource('/api/runtime/events?after='+encodeURIComponent(String(detail.data?.events?.at(-1)?.seq || 0)))
    source.onmessage=event=>{
      const e=JSON.parse(event.data) as RuntimeEvent
      if(e.session_id!==sid || e.provider!==provider)return
      if(e.type==='message_delta')setDelta(t=>(t+String(e.data.text||'')).slice(-200000))
      else {
        setLive(rows=>[...rows,e].slice(-100))
        if(['turn_completed','message','error'].includes(e.type))setDelta('')
        if(['message','turn_started','turn_completed','approval','error'].includes(e.type)) {
          cache.invalidateQueries({queryKey:['native-session',provider,sid]})
          cache.invalidateQueries({queryKey:['approvals']})
          cache.invalidateQueries({queryKey:['chat-git',project]})
        }
      }
    }
    return ()=>source.close()
  },[sid,provider,project,cache])
  const action=useMutation({mutationFn:async (fn:()=>Promise<unknown>)=>fn(),onSettled:async()=>{
    await Promise.all([cache.invalidateQueries({queryKey:['native-session']}),cache.invalidateQueries({queryKey:['native-list']}),cache.invalidateQueries({queryKey:['approvals']}),cache.invalidateQueries({queryKey:['runtime-providers']})])
  }})
  const chat=()=>{if(text.trim() && sid && !busy && !action.isPending)action.mutate(async()=>{await runtime.send(provider,sid,text.trim(),model,mode);setText('')})}
  const messages=session?.messages?.length ? session.messages : readableHistory(session?.raw_history)
  const events=Array.from(new Map([...(session?.events||[]),...live].map(e=>[e.seq,e])).values()).filter(e=>!['message_delta','message'].includes(e.type))
  return <div className="page-stack"><PageHeading eyebrow="AI WORKSPACE" title="Conversations" action={<Button onClick={()=>setAside(!aside)}><PanelRightClose size={15}/>Session details</Button>}/>
    <div className="chat-workbench"><Panel className="chat-nav"><label>Agent<select value={provider} onChange={e=>select(e.target.value,project)}>{providers.data?.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label>Project<select value={project} onChange={e=>select(provider,e.target.value)}><option value="">Select a project</option>{all.data?.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <Button variant="primary" disabled={!project || p?.status!=='connected' || action.isPending} onClick={()=>action.mutate(async()=>{const s=await runtime.create(provider,project,model,mode);select(provider,project,s.id)})}><Plus size={15}/>New conversation</Button>
    <Input placeholder="Search conversations" value={filter} onChange={e=>setFilter(e.target.value)}/><label className="check"><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/>Archived</label>
    {(list.data?.items||[]).filter(s=>!!s.archived===archived && s.title?.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(b.updated_at||'').localeCompare(a.updated_at||'')).map(s=><button className={'session-link '+(sid===s.id?'selected':'')} key={s.id} onClick={()=>select(provider,project,s.id)}>{s.pinned && <Pin size={12}/>} {s.title}</button>)}
    </Panel><Panel className="chat-main"><div className="spread"><h2>{session?.title || 'New conversation'}</h2><small>{session?.status}</small></div><div className="chat-messages">{!sid && <div className="native-empty"><Bot size={30}/><h3>{!project?'Open a project to begin':p?.status!=='connected'?'Connect your agent':'Start a conversation'}</h3><Link to={!project?'/app/projects':'/app/agents'}>{!project?'Manage projects':'Manage agents'} →</Link></div>}
    {messages.map((m,i)=><article className="chat-message" key={i}><strong>{m.role==='user'?'You':p?.name}</strong><pre>{m.text}</pre></article>)}{delta && <pre className="live-answer">{delta}</pre>}
    {events.filter(e=>e.type==='error').map(e=><p role="alert" className="inline-alert" key={e.seq}>{String(e.data.message)}</p>)}
    {approvals.data?.filter(a=>a.session_id===sid && a.provider===provider).map(a=><div className="approval" key={a.id}><b>Permission requested</b><pre>{JSON.stringify(a.request,null,2)}</pre>{['approve','reject'].map(d=><Button key={d} disabled={action.isPending} onClick={()=>action.mutate(()=>runtime.decide(a.id,d))}>{d}</Button>)}</div>)}</div>
    <div className="chat-compose"><textarea aria-label="Message" value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();chat()}}} placeholder="Message your agent…"/><div className="quick-links"><select aria-label="Mode" value={mode} onChange={e=>setMode(e.target.value)}>{(Array.isArray(p?.capabilities.modes)?p.capabilities.modes:['ask']).map(m=><option key={m}>{m}</option>)}</select>
    {!!p?.models?.length && <select aria-label="Model" value={model} onChange={e=>setModel(e.target.value)}><option value="">Runtime default</option>{p.models.map(m=><option key={m.id} value={m.id}>{m.name||m.id}</option>)}</select>}
    {busy?<Button onClick={()=>action.mutate(()=>runtime.interrupt(provider,sid))}><Square size={14}/>Interrupt</Button>:<Button disabled={!sid||!text.trim()||session?.archived||p?.status!=='connected'||action.isPending} variant="primary" onClick={chat}><Send size={15}/>Send</Button>}</div></div></Panel>
    {aside && <Panel className="chat-inspector"><h3><Activity size={15}/> Session details</h3><p>{all.data?.find(x=>x.id===project)?.path || 'Select a project'}</p>{sid && <><label>Conversation title<Input value={title} onChange={e=>setTitle(e.target.value)}/></label><div className="quick-links"><Button disabled={!title.trim() || action.isPending} onClick={()=>action.mutate(()=>runtime.update(provider,sid,{title}))}>Rename</Button><Button onClick={()=>action.mutate(()=>runtime.update(provider,sid,{pinned:!session?.pinned}))}>{session?.pinned?'Unpin':'Pin'}</Button><Button disabled={!!busy} onClick={()=>action.mutate(()=>runtime.update(provider,sid,{archived:!session?.archived}))}>{session?.archived?'Restore':'Archive locally'}</Button><Button disabled={!!busy} onClick={()=>{if(window.confirm('Remove this conversation from DevPulse? Provider history is retained.'))action.mutate(async()=>{await runtime.update(provider,sid,{hidden:true});select(provider,project)})}}>Remove locally</Button>{p?.status==='connected' && <Button onClick={()=>action.mutate(()=>runtime.resume(provider,sid,project))}>Resume</Button>}</div></>}
    <h3>Git status</h3>{git.data && <p>{git.data.is_repository?(git.data.branch||'Detached HEAD')+' · '+git.data.changes.length+' changed files':'No repository'}</p>}{git.data?.changes.slice(0,20).map(f=><div key={f.path} className="row-line">{f.status} {f.path}</div>)}{project && <Link to={'/app/git?project='+project}>Review diff →</Link>}<h3>Runtime activity</h3>{events.slice(-35).reverse().map(e=><details key={e.seq}><summary>{e.type} · {String(e.data.name || e.data.method || '')}</summary><pre>{JSON.stringify(e.data,null,2)}</pre></details>)}</Panel>}</div>
    {[action.error,list.error,detail.error,all.error,providers.error].filter(Boolean).map((err,i)=><p className="inline-alert" role="alert" key={i}>{err!.message}</p>)}</div>
}

