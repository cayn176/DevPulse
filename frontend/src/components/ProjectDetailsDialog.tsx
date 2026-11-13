import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Link} from 'react-router-dom'
import {Dialog} from './Primitives'
import {projects,type LocalProject} from '../lib/projects'
import {automation} from '../lib/automation'
import {request} from '../lib/api'
import type {NativeSession} from '../lib/runtime'

export function ProjectInspector({project:p,close}:{project:LocalProject;close:()=>void}){
 const [tab,setTab]=useState('Overview')
 const git=useQuery({queryKey:['project-git',p.id],queryFn:()=>projects.git(p.id),enabled:tab==='Overview'})
 const sessions=useQuery({queryKey:['native-activity'],queryFn:()=>request<NativeSession[]>('/api/runtime/activity'),enabled:tab==='Sessions'})
 const tasks=useQuery({queryKey:['local-work','tasks'],queryFn:automation.tasks,enabled:tab==='Tasks'})
 const rows=tab==='Sessions'?sessions.data?.filter(s=>s.project_id===p.id).map(s=>({id:s.id,title:s.title||s.id,url:'/app/sessions?session='+s.id})):tasks.data?.filter(t=>t.project_id===p.id).map(t=>({id:t.id,title:t.text,url:'/app/tasks'}))
 return <Dialog title={p.name} description={p.path} onClose={close}><div className="ai-form"><div className="quick-links" aria-label="Project views">{['Overview','Sessions','Tasks'].map(x=><button key={x} aria-pressed={tab===x} className={'button button-'+(tab===x?'primary':'secondary')} onClick={()=>setTab(x)}>{x}</button>)}</div>
 {tab==='Overview'?<><p>{p.description||'No description provided.'}</p><dl className="detail-grid">{Object.entries({Technology:p.framework||p.language,Branch:git.data?.branch,Repository:p.remote_url,'Last opened':new Date(p.last_opened).toLocaleString()}).map(([k,v])=><div key={k} style={{display:'contents'}}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl><Link className="button button-primary" to={'/app/code?project='+p.id}>Open editor →</Link></>:rows?.length?rows.map(x=><Link key={x.id} to={x.url}>{x.title} →</Link>):<p>No {tab.toLowerCase()} associated with this project.</p>}
 {(git.error||tasks.error||sessions.error)&&<p role="alert">{(git.error||tasks.error||sessions.error)?.message}</p>}</div></Dialog>
}
