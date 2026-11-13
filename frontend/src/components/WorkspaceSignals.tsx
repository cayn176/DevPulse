import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { automation } from '../lib/automation'
import { request } from '../lib/api'
import { projects } from '../lib/projects'
import type { NativeSession } from '../lib/runtime'
import { Button, Input, Panel } from './Primitives'

type Build={uid:string;name:string;state:string;created:number;project_id?:string}
function useSignals(){
  const task=useQuery({queryKey:['signal-tasks'],queryFn:automation.tasks,retry:false})
  const runs=useQuery({queryKey:['signal-runs'],queryFn:automation.runs,retry:false})
  const agents=useQuery({queryKey:['native-activity'],queryFn:()=>request<NativeSession[]>('/api/runtime/activity'),retry:false})
  const files=useQuery({queryKey:['local-projects'],queryFn:()=>projects.list(),retry:false})
  const account=useQuery({queryKey:['vercel','status'],queryFn:()=>request<{connected:boolean}>('/api/vercel/status'),retry:false})
  const builds=useQuery({queryKey:['signal-builds'],queryFn:()=>request<Build[]>('/api/vercel/deployments'),enabled:!!account.data?.connected,retry:false})
  return {task,runs,agents,files,account,builds}
}
export function SignalStrip(){
  const s=useSignals()
  const slots=[
    {name:'Running sessions',v:s.agents.data?.filter(x=>['running','awaiting_approval'].includes(x.status||'')).length,to:'sessions'},
    {name:'Open tasks',v:s.task.data?.filter(x=>!x.done).length,to:'tasks'},
    {name:'Workflow runs',v:s.runs.data?.length,to:'automation'},
    {name:'Failed builds',v:s.builds.data?.filter(x=>x.state==='ERROR').length,to:'deployments'}
  ]
  return <div className="status-strip">{slots.map(x=><Link to={'/app/'+x.to} key={x.to}>{x.name}<strong title={x.v===undefined?'Unavailable for this workspace':undefined}>{x.v??'—'}</strong></Link>)}</div>
}
export function ActivityLedger(){
 const s=useSignals(),[search,setSearch]=useState(''),[kind,setKind]=useState('All'),[days,setDays]=useState(30)
 const rows=[
  ...(s.task.data||[]).map(x=>({kind:'Task',text:x.text,time:x.created_at,state:x.status,to:'tasks'})),
  ...(s.runs.data||[]).map(x=>({kind:'Workflow',text:x.name,time:x.created_at,state:'Executed',to:'automation'})),
  ...(s.files.data||[]).map(x=>({kind:'Project',text:x.name,time:x.last_opened,state:'Opened',to:'code?project='+x.id})),
  ...(s.agents.data||[]).map(x=>({kind:'Session',text:x.title||x.id,time:x.updated_at||'',state:x.status||'Unknown',to:'sessions?session='+x.id})),
  ...(s.builds.data||[]).map(x=>({kind:'Deployment',text:x.name,time:new Date(x.created).toISOString(),state:x.state,to:'deployments/'+x.uid})),
 ].filter(x=>(kind==='All'||kind===x.kind)&&(x.text+' '+x.state).toLowerCase().includes(search.toLowerCase())&&(!days||Date.now()-new Date(x.time).getTime()<=days*86400000)).sort((a,b)=>Date.parse(b.time)-Date.parse(a.time))
 return <Panel className="native-card"><div className="spread"><h2>Workspace timeline</h2><Link to="/app/activity">GitHub events →</Link></div>
 <div className="quick-links"><Input aria-label="Search activity" placeholder="Filter events…" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Event category" value={kind} onChange={e=>setKind(e.target.value)}>{['All','Project','Session','Task','Workflow','Deployment'].map(x=><option key={x}>{x}</option>)}</select><select aria-label="Period" value={days} onChange={e=>setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={0}>All time</option></select><Button onClick={()=>{s.agents.refetch();s.runs.refetch();s.task.refetch();s.files.refetch();if(s.account.data?.connected)s.builds.refetch()}}>Refresh</Button></div>
 {rows.slice(0,120).map((x,i)=><Link className="signal-event" key={x.kind+i} to={'/app/'+x.to}><small>{x.kind}</small><strong>{x.text}</strong><span>{x.state}</span><time>{new Date(x.time).toLocaleString()}</time></Link>)}
 {!rows.length&&<p>Events appear when you open a project, run a workflow or work with a connected service.</p>}
 {[s.agents.error,s.runs.error,s.task.error,s.builds.error].some(Boolean)&&<p role="status">Some activity sources are unavailable. Check the integration status for details.</p>}</Panel>
}
