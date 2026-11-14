import { ActivityLedger, SignalStrip } from '../components/WorkspaceSignals'
import { AgentSetup } from './AgentSetup'
import { Brand } from '../components/Brand'
import { useState } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Bot, Code2, FolderOpen, GitBranch, Monitor, Plus } from 'lucide-react'
import { Button, Input, PageHeading, Panel } from '../components/Primitives'
import { useTheme } from '../components/Theme'
import { projects } from '../lib/projects'
import type { User } from '../lib/types'
import { useActivity, useProviders } from './NativeAgents'

const guides=[
  ['GitHub','Open Connect GitHub. Use OAuth when your server has a registered OAuth app, or create a fine-grained personal access token for the repositories you need. Grant Contents and Pull requests write only for publishing changes. Verify by synchronizing Repositories. If access expires, reconnect with a new token.','/connect','https://github.com/settings/personal-access-tokens'],
  ['OpenAI Codex','Install the official Codex CLI on PATH. Select Verify connection in Agents. If account details are missing, choose Sign in, complete the official login, then verify again. Open a project to load its CLI threads.','/app/agents','https://developers.openai.com/codex/cli/'],
  ['Claude Agent','The desktop build includes the Claude Agent SDK. Save an Anthropic API key and model in Integrations, then verify Claude Agent. API access is billed by Anthropic. If verification fails, check the key and available models. Importable sessions are scoped to the selected project.','/app/integrations','https://code.claude.com/docs/en/agent-sdk/overview'],
  ['Cursor Agent','Install the Cursor Agent CLI, add it to PATH and run agent login. Verify in Agents. The editor alone does not provide the ACP command. Restart DevPulse after changing PATH. Available models, modes and history depend on the installed CLI.','/app/agents','https://cursor.com/docs/cli/acp'],
  ['Vercel','Create a Vercel access token with access to your project. Enter the optional team ID and verify in Deployments. Select a GitHub-linked project and branch, then review the target. If builds fail, open Logs.','/app/deployments','https://vercel.com/docs/rest-api'],
  ['Visual Studio Code','Install VS Code with its code command on PATH. Open a local project in Projects, then choose Open in VS Code from the editor. Restart DevPulse if the launcher was installed while it was open.','/app/projects','https://code.visualstudio.com/docs/setup/windows'],
  ['Ollama','Install Ollama, download a model with ollama pull, and start its local service. In DevPulse AI select Ollama and an installed model. Inference runs on this computer.','/app/assistant','https://docs.ollama.com/quickstart'],
]
const actions=[{title:'Open a project',to:'/app/projects',icon:FolderOpen},{title:'Start a conversation',to:'/app/conversations',icon:Bot},{title:'Review changes',to:'/app/git',icon:GitBranch}]
export function WorkspaceHome(){
  const {user}=useOutletContext<{user:User}>()
  const list=useQuery({queryKey:['local-projects'],queryFn:()=>projects.list()})
  const providers=useProviders(), sessions=useActivity()
  return <div className="page-stack"><PageHeading eyebrow="OVERVIEW" title="Your workspace" description="Pick up a project or start a conversation." action={<Link className="button button-primary" to="/app/projects"><Plus size={15}/>Open project</Link>}/>
    <SignalStrip/><div className="home-actions">{actions.map(a=><Link key={a.to} to={a.to}><a.icon size={23}/><strong>{a.title}</strong><ArrowUpRight size={16}/></Link>)}</div>
    <div className="home-columns"><Panel className="native-card"><div className="spread"><h2>Recent projects</h2><Link to="/app/projects">View all →</Link></div>{list.error?<p>{list.error.message}</p>:list.data?.length?list.data.slice(0,6).map(p=><Link className="project-line" key={p.id} to={'/app/code?project='+p.id}><Code2 size={18}/><span><strong>{p.name}</strong><small>{p.framework||p.path}</small></span><ArrowUpRight size={14}/></Link>):<div className="native-empty"><FolderOpen size={27}/><h3>Your first project</h3><p>Open a folder, clone a repository or create a new project.</p><Link to="/app/projects">Choose project →</Link></div>}</Panel>
    <Panel className="native-card"><div className="spread"><h2>Agent connections</h2><Link to="/app/agents">Manage →</Link></div>{providers.data?.map(p=><div key={p.id} className="row-line spread"><strong>{p.name}</strong><small>{p.status.replaceAll('_',' ')}</small></div>)}{providers.error&&<p>{providers.error.message}</p>}<div className="row-line spread"><strong>GitHub</strong><Link to="/connect">{user.login==='local'?'Connect account ↗':'@'+user.login}</Link></div></Panel></div>
    <Panel className="native-card"><div className="spread"><h2>Recent sessions</h2><Link to="/app/sessions">View sessions →</Link></div>{sessions.data?.length?sessions.data.slice().sort((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||'')).slice(0,5).map(s=><Link key={s.id} className="row-line spread" to={'/app/conversations?agent='+s.provider+'&project='+s.project_id+'&session='+s.id}><strong>{s.title}</strong><small>{s.provider} · {s.status}</small></Link>):<p>Sessions appear here when you create or import a conversation.</p>}</Panel></div>
}

function Appearance(){
  const {theme,preference,setPreference}=useTheme()
  return <Panel className="native-card"><h2>Display</h2><div className="quick-links"><Monitor size={19}/><span>Current theme · {theme}</span><label>Theme<select value={preference} onChange={e=>setPreference(e.target.value as typeof preference)}><option value="dark">Graphite dark</option><option value="light">Paper light</option><option value="system">Follow system</option></select></label><label>Accent<select defaultValue={localStorage.getItem('dp-accent')||'relay'} onChange={e=>{localStorage.setItem('dp-accent',e.target.value);document.documentElement.dataset.accent=e.target.value}}><option value="relay">Relay teal</option><option value="steel">Steel blue</option></select></label></div>{['Reduce motion','Compact spacing','Opaque panels'].map((name,i)=><label className="row-line check" key={name}><input type="checkbox" defaultChecked={localStorage.getItem('dp-display-'+i)==='1'} onChange={e=>{localStorage.setItem('dp-display-'+i,e.target.checked?'1':'0');document.documentElement.classList.toggle('display-'+i,e.target.checked)}}/>{name}</label>)}</Panel>
}
function Tasks({user}:{user:User}){
  const key='devpulse-tasks-'+user.id
  const [rows,setRows]=useState<{id:string;text:string;done:boolean}[]>(()=>{try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return []}})
  const [name,setName]=useState('')
  function save(next:typeof rows){localStorage.setItem(key,JSON.stringify(next));setRows(next)}
  return <Panel className="native-card"><form className="quick-links" onSubmit={e=>{e.preventDefault();if(name.trim()){save([...rows,{id:crypto.randomUUID(),text:name.trim(),done:false}]);setName('')}}}><Input aria-label="Task" value={name} maxLength={300} onChange={e=>setName(e.target.value)} placeholder="New task"/><Button type="submit" disabled={!name.trim()}>Add task</Button></form>{rows.map(t=><div className="spread row-line" key={t.id}><label className="check"><input type="checkbox" checked={t.done} onChange={()=>save(rows.map(r=>r.id===t.id?{...r,done:!r.done}:r))}/>{t.text}</label><Button onClick={()=>save(rows.filter(r=>r.id!==t.id))}>Remove</Button></div>)}</Panel>
}
export function WorkspaceToolsPage(){
  const section=useLocation().pathname.split('/').pop()||''
  const {user}=useOutletContext<{user:User}>()
  const sessions=useActivity()
  const [filter,setFilter]=useState('')
  const rows=(sessions.data||[]).filter(s=>[s.provider,s.title,s.cwd,s.status].join(' ').toLowerCase().includes(filter.toLowerCase()))
  const titles:Record<string,string>={help:'Help & documentation',guides:'Integration guides',appearance:'Appearance',security:'Security',about:'About DevPulse',tasks:'Tasks',sessions:'Agent sessions','workspace-activity':'Workspace activity','development-analytics':'Development analytics'}
  return <div className="page-stack"><PageHeading title={titles[section]}/>{section==='workspace-activity'?<ActivityLedger/>:(section==='guides'||section==='help')?<><AgentSetup/><div className="native-grid">{guides.filter(([, ,path])=>!['/app/agents','/app/integrations'].includes(path)).map(([name,body,path,url])=><Panel className="native-card" key={name}><h2>{name}</h2><p>{body}</p><div className="quick-links"><Link to={path}>Open setup →</Link><a target="_blank" rel="noreferrer" href={url}>Documentation ↗</a></div></Panel>)}</div></>:section==='appearance'?<Appearance/>:section==='tasks'?<Tasks key={user.id} user={user}/>:section==='security'?<Panel className="native-card"><h2>Credential storage</h2><p>DevPulse encrypts saved provider keys in the backend. The Windows app protects its encryption key using your OS account. Disconnect a provider in Integrations and revoke its token in the provider account to end remote access.</p><div className="quick-links"><Link to="/app/integrations">Manage credentials →</Link><Link to="/app/settings">Account and sessions →</Link></div><h3>Project permissions</h3><p>Review proposed GitHub changes before creating a draft pull request. Native agent approvals appear inside the conversation. Use a Git worktree for simultaneous work in the same repository.</p></Panel>:section==='about'?<Panel className="native-card"><Brand asLink={false}/><h2>DevPulse 0.3.1</h2><a href="https://github.com/cayn176/DevPulse/releases" target="_blank" rel="noreferrer">Releases and downloads ↗</a><p>Desktop workspace for coding agents, Git and local projects.</p><p>Windows x64 · Manual updates · All rights reserved</p><Link to="/app/guides">Integration documentation →</Link></Panel>:<>
  <div className="quick-links"><Input placeholder="Filter by project, agent or status" value={filter} onChange={e=>setFilter(e.target.value)}/><Button onClick={()=>sessions.refetch()}>Refresh</Button>{section==='workspace-activity'&&<Link to="/app/activity">GitHub activity →</Link>}</div>
  {section==='development-analytics'?<div className="native-grid">{['codex','claude','cursor'].map(p=><Panel className="native-card" key={p}><h2>{p}</h2><div className="metric">{rows.filter(s=>s.provider===p).length}</div><p>Local sessions</p><small>{rows.filter(s=>s.provider===p).reduce((n,s)=>n+(s.messages?.length||0),0)} recorded messages</small></Panel>)}</div>:<Panel className="native-card">{rows.map(s=><div className="row-line" key={s.id}><Link to={'/app/conversations?project='+s.project_id+'&agent='+s.provider+'&session='+s.id}><strong>{s.title}</strong> →</Link><p>{s.provider} · {s.status} · {s.updated_at&&new Date(s.updated_at).toLocaleString()}</p>{section==='workspace-activity'&&s.events?.slice(-6).map(e=><small key={e.seq} className="row-line">{e.type} · {String(e.data.method||e.data.name||'')}</small>)}</div>)}{!rows.length&&<p>No matching sessions.</p>}</Panel>}{sessions.error&&<p role="alert">{sessions.error.message}</p>}</>}</div>
}

