import { useState } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Asterisk, BookOpen, Check, ChevronDown, Code2, ExternalLink, Folder, GitBranch, GitFork as Github, KeyRound, Laptop, Search, SquareTerminal, Terminal, Triangle } from 'lucide-react'
import { Button, Dialog, Input, PageHeading } from '../components/Primitives'
import { ai, providerNames, type ProviderConnection } from '../lib/ai'
import { request } from '../lib/api'
import { runtime } from '../lib/runtime'
import type { User } from '../lib/types'
import '../styles/reference-manager.css'

type Diagnostics = {git:boolean;vscode:boolean;projects:number;github_configured:boolean}
type Status = {label:string;authorized?:boolean;detail?:string;tone?:'good'|'warn'}
type Category = 'AI providers'|'Version control'|'Deployment'|'Development tools'
type Connector = {id:string;name:string;category:Category;icon:typeof Terminal;text:string;doc:string;route:string;status:Status}
const categories:Category[]=['AI providers','Version control','Deployment','Development tools']
const apiTypes = ['openai','anthropic','cursor']
const pending:Status = {label:'Checking…'}
const unavailable:Status = {label:'Status unavailable',tone:'warn'}
const required:Status = {label:'Setup required',tone:'warn'}
const localAvailable:Status = {label:'Available locally',detail:'Workspace tool'}
const keyDescriptions:Record<string,string> = {
  openai:'Use the OpenAI Responses API for DevPulse AI conversations and repository proposals.',
  anthropic:'Use the Anthropic API for DevPulse AI or verify Claude Agent in the Agents workspace.',
  cursor:'Run Cursor Cloud on a repository and synchronize its result in DevPulse AI.',
}

function Credential({connection}:{connection:ProviderConnection}) {
  const [secret,setSecret]=useState(''), [model,setModel]=useState(connection.model)
  const cache=useQueryClient()
  const save=useMutation({mutationFn:()=>ai.connect(connection.provider,secret.trim(),model.trim()),onSuccess:async()=>{
    setSecret('')
    await cache.invalidateQueries({queryKey:['ai-connections']})
  }})
  const remove=useMutation({mutationFn:()=>ai.disconnect(connection.provider),onSuccess:()=>cache.invalidateQueries({queryKey:['ai-connections']})})
  if(connection.server_managed)return <div className="ref-notice"><KeyRound size={18}/><div><strong>Backend-managed credential</strong><p>The server owner controls this key. Model: {connection.model||'Provider default'}.</p></div></div>
  return <form className="ref-form" onSubmit={e=>{e.preventDefault();remove.reset();save.mutate()}}>
    <p>{keyDescriptions[connection.provider]}</p>
    <label>API key<Input type="password" autoComplete="off" spellCheck={false} value={secret} onChange={e=>setSecret(e.target.value)} placeholder={connection.connected?'Enter a replacement key':'Enter your provider key'} minLength={10} maxLength={500} required/></label>
    {connection.provider!=='cursor' && <label>Model ID<Input value={model} maxLength={160} onChange={e=>setModel(e.target.value)} placeholder="Model available to your account" required/></label>}
    <small>Keys are encrypted in the backend. Provider billing applies when you use the service.</small>
    <div className="ref-actions"><Button type="submit" variant="primary" loading={save.isPending} disabled={remove.isPending}>Save credential</Button>
    {connection.connected&&<Button type="button" loading={remove.isPending} disabled={save.isPending} onClick={()=>{save.reset();remove.mutate()}}>Remove saved credential</Button>}</div>
    {save.isSuccess&&<p role="status">Credential saved. Access is checked on the next provider request.</p>}
    {remove.isSuccess&&<p role="status">Credential removed from DevPulse.</p>}
    {(save.error||remove.error)&&<p role="alert" className="ref-error">{(save.error||remove.error)?.message}</p>}
  </form>
}

export function IntegrationsPage() {
  const {user}=useOutletContext<{user:User}>()
  const location=useLocation()
  const initial=location.pathname.endsWith('connected-apps')?'connected':'all'
  const [tab,setTab]=useState(initial), [search,setSearch]=useState(''), [category,setCategory]=useState<Category|null>(null)
  const [credentials,setCredentials]=useState<string|null>(null)
  const isProviders=location.pathname.endsWith('/providers')
  const openCredential=credentials ?? (isProviders?(apiTypes.find(id=>id===new URLSearchParams(location.search).get('provider'))||'openai'):null)
  const runtimeInfo=useQuery({queryKey:['runtime-providers'],queryFn:runtime.providers,retry:false})
  const local=useQuery({queryKey:['integration-diagnostics',user.id],queryFn:()=>request<Diagnostics>('/api/local-work/diagnostics'),retry:false})
  const vercel=useQuery({queryKey:['vercel','status'],queryFn:()=>request<{connected:boolean;username?:string}>('/api/vercel/status'),retry:false})
  const keys=useQuery({queryKey:['ai-connections'],queryFn:ai.connections})
  function agentStatus(id:string):Status{
    const p=runtimeInfo.data?.find(x=>x.id===id)
    if(!p)return runtimeInfo.isPending?pending:unavailable
    if(p.status==='connected')return {label:'Connected',authorized:true,tone:'good',detail:p.version||'Verified runtime'}
    if(p.status==='connection_error')return {label:'Connection error',tone:'warn'}
    return !p.installed?{label:'Not installed',tone:'warn'}:{label:'Setup required',detail:'Runtime detected',tone:'warn'}
  }
  function localStatus(value:boolean|undefined):Status{
    return local.isPending?pending:local.isError?unavailable:value?{label:'Detected',detail:'Local installation'}:{label:'Not installed',tone:'warn'}
  }
  const catalog:Connector[]=[
    {id:'codex',name:'OpenAI Codex',category:'AI providers',icon:Terminal,text:'Local Codex threads, streaming replies and tool approvals.',doc:'https://developers.openai.com/codex/app-server/',route:'/app/guides?agent=codex',status:agentStatus('codex')},
    {id:'claude',name:'Claude Agent',category:'AI providers',icon:Asterisk,text:'Project sessions through the Claude Agent SDK.',doc:'https://code.claude.com/docs/en/agent-sdk/overview',route:'/app/guides?agent=claude',status:agentStatus('claude')},
    {id:'cursor',name:'Cursor',category:'AI providers',icon:SquareTerminal,text:'Native agent sessions through the Cursor CLI and ACP.',doc:'https://cursor.com/docs/cli/acp',route:'/app/guides?agent=cursor',status:agentStatus('cursor')},
    {id:'github',name:'GitHub',category:'Version control',icon:Github,text:'Repositories, pull requests and issues with scoped access.',doc:'https://docs.github.com/en/authentication',route:'/connect',status:local.isPending?pending:local.isError?unavailable:local.data?.github_configured?{label:'Account linked',authorized:true,detail:'@'+user.login,tone:'good'}:required},
    {id:'git',name:'Git',category:'Version control',icon:GitBranch,text:'Local commits, branches and working-tree diffs.',doc:'https://git-scm.com/doc',route:'/app/git',status:localStatus(local.data?.git)},
    {id:'vercel',name:'Vercel',category:'Deployment',icon:Triangle,text:'Inspect deployment logs and review builds before publishing.',doc:'https://vercel.com/docs/rest-api',route:'/app/deployments',status:vercel.isPending?pending:vercel.isError?unavailable:vercel.data?.connected?{label:'Connected',authorized:true,tone:'good',detail:vercel.data.username}:required},
    {id:'folders',name:'Local folders',category:'Development tools',icon:Folder,text:'Explicit, project-scoped access to files on your computer.',doc:'/app/guides',route:'/app/projects',status:local.isError?unavailable:local.isPending?pending:{...localAvailable,detail:local.data?.projects+' projects'}},
    {id:'vscode',name:'Visual Studio Code',category:'Development tools',icon:Laptop,text:'Open a registered project in your local VS Code editor.',doc:'https://code.visualstudio.com/docs/setup/windows',route:'/app/code',status:localStatus(local.data?.vscode)},
    {id:'editor',name:'Code editor',category:'Development tools',icon:Code2,text:'File editing, project search and side-by-side diff review.',doc:'/app/guides',route:'/app/code',status:localAvailable},
  ]
  const authorized=catalog.filter(i=>i.status.authorized).length
  const list=catalog.filter(i=>(tab==='all'||(tab==='connected')===!!i.status.authorized)&&(!category||category===i.category)&&(i.name+' '+i.category+' '+i.text).toLowerCase().includes(search.toLowerCase()))
  const selectedKey=keys.data?.find(c=>c.provider===openCredential)
  const credentialsContent=<><div className="ref-tabs ref-key-tabs">{apiTypes.map(id=><button key={id} className={openCredential===id?'active':''} onClick={()=>setCredentials(id)}>{providerNames[id]}</button>)}</div>
    {selectedKey?<Credential key={selectedKey.provider} connection={selectedKey}/>:<p>{keys.error?.message||'Loading credential settings…'}</p>}
    <div className="ref-footnote">For local inference, select Ollama in <Link to="/app/assistant">DevPulse AI</Link>.</div></>
  if(isProviders)return <div className="ref-page"><PageHeading title="AI providers" description="Configure API access for DevPulse AI and cloud agents." action={<Link className="button button-secondary" to="/app/integrations">Integration manager →</Link>}/><div className="ref-box ref-box-body ref-provider-settings">{credentialsContent}</div></div>
  return <div className="ref-page">
    <PageHeading title="Integration manager" description="Connect the agents, repositories and development tools in your workspace." action={<Link className="button button-secondary" to="/app/guides"><BookOpen size={16}/>Integration guides</Link>}/>
    <div className="ref-tabs" aria-label="Integration groups">{[['all','All integrations',catalog.length],['connected','Authorized',authorized],['available','Available',catalog.length-authorized]].map(([id,label,n])=><button className={tab===id?'active':''} key={id} aria-pressed={tab===id} onClick={()=>setTab(String(id))}>{label} · {n}</button>)}</div>
    <div className="ref-filters"><label className="ref-search"><Search size={16}/><input type="search" aria-label="Search integrations" placeholder="Search integrations…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{categories.map(c=><button key={c} className={'ref-filter '+(category===c?'chosen':'')} aria-pressed={category===c} onClick={()=>setCategory(category===c?null:c)}>{category===c?<Check size={14}/>:<ChevronDown size={14}/>} {c}</button>)}</div>
    <div className="ref-catalog">{list.map(c=><article key={c.id} className="ref-box ref-integration"><header><c.icon size={20}/><h2>{c.name}</h2><small>{c.category}</small></header>
      <div className="ref-status-line"><span className={'ref-status '+(c.status.tone||'')}>{c.status.label}</span><small>{c.status.detail}</small></div>
      <p>{c.text}</p><footer><Link className="button button-secondary" to={c.route}>{c.id==='folders'||c.id==='git'||c.id==='editor'||c.id==='vscode'?'Open':'Configure'}</Link>
      {c.doc.startsWith('/')?<Link className="ref-doc" to={c.doc}>Guide <ExternalLink size={11}/></Link>:<a className="ref-doc" href={c.doc} target="_blank" rel="noreferrer">Documentation <ExternalLink size={11}/></a>}</footer>
    </article>)}</div>
    {!list.length&&<div className="ref-empty">No integrations match these filters. <button onClick={()=>{setTab('all');setCategory(null);setSearch('')}}>Show all integrations</button></div>}
    <div className="ref-credentials-bar"><div><strong>DevPulse AI credentials</strong><p>Configure OpenAI, Anthropic or Cursor Cloud API access separately from native agent sign-in.</p></div><Button onClick={()=>setCredentials('openai')}><KeyRound size={14}/>API credentials</Button></div>
    {openCredential&&<Dialog title="DevPulse AI credentials" onClose={()=>setCredentials(null)}>{credentialsContent}</Dialog>}
  </div>
}

