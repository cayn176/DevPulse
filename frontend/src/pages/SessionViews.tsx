import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Clock } from 'lucide-react'
import { Button, PageHeading, Panel } from '../components/Primitives'
import { DateFilter, EmptyState, Facts, providerNames, queryWithin, QueryError, SearchBox, Section, sessionUrl, Table, Tabs, timestamp } from '../components/ReferenceWorkspace'
import { projects } from '../lib/projects'
import { runtime, type NativeSession, type RuntimeEvent } from '../lib/runtime'
import { useActivity } from './NativeAgents'

export const useProjects = () => useQuery({queryKey:['local-projects'], queryFn:()=>projects.list()})
export function phase(s:NativeSession): string {
  if (s.status==='running' || s.status==='awaiting_approval') return 'Active'
  if (s.status==='error' || s.status==='failed') return 'Failed'
  if (s.status==='interrupted') return 'Paused'
  if (s.status==='idle' && s.events?.some(e=>e.type==='turn_completed')) return 'Completed'
  return 'Idle'
}
export const eventTitle = (e:RuntimeEvent) => String(e.data.name || e.data.method || e.type).replaceAll('_',' ')
function elapsed(s:NativeSession) {
  const start=s.events?.find(e=>e.type==='turn_started')?.timestamp
  const end=phase(s)==='Active'?Date.now():new Date(s.updated_at||'').getTime()
  if(!start || !Number.isFinite(end)) return '—'
  const secs=Math.max(0,Math.floor((end-new Date(start).getTime())/1000))
  return secs>=60?Math.floor(secs/60)+'m '+(secs%60)+'s':secs+'s'
}

const sessionTabs=['Active','Completed','Paused','Failed','History']
const detailTabs=['Overview','Timeline','File changes','Tool history','Logs','Errors']
export function SessionViews(){
  const [params,setParams]=useSearchParams()
  const sessions=useActivity(), projectList=useProjects()
  const tab=sessionTabs.find(k=>k===params.get('view'))||'Active'
  const [term,setTerm]=useState(''),[agent,setAgent]=useState(''),[project,setProject]=useState(''),[days,setDays]=useState('')
  const projectName=(s:NativeSession)=>projectList.data?.find(p=>p.id===s.project_id)?.name || s.cwd?.split(/[\\/]/).at(-1) || 'Unassigned'
  const id=params.get('session')
  const selected=sessions.data?.find(s=>s.id===id)
  if(id && selected)return <SessionDetail key={selected.id} session={selected} project={projectName(selected)}/>
  if(id && sessions.data && !selected)return <Panel><EmptyState title="Session unavailable" detail="This session may have been removed from your workspace." action={<Link to="/app/sessions">Back to sessions →</Link>}/></Panel>
  const rows=(sessions.data||[]).filter(s=>(tab==='History'||phase(s)===tab) && (!agent||s.provider===agent) && (!project||s.project_id===project) && queryWithin(s.updated_at,days) && [s.title,s.id,s.provider,projectName(s)].join(' ').toLowerCase().includes(term.toLowerCase())).toSorted((a,b)=>(b.updated_at||'').localeCompare(a.updated_at||''))
  return <div className="page-stack rw-page"><PageHeading title={'Agent sessions · '+tab} description="Inspect execution, changes and tool activity across your coding agents." action={<Link className="button button-primary" to="/app/conversations"><Plus size={15}/>New session</Link>}/>
    <Tabs values={sessionTabs} active={tab} onChange={view=>setParams({view})}/>
    <div className="rw-filters"><SearchBox value={term} onChange={setTerm} placeholder="Search sessions…"/><select aria-label="Project filter" value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{projectList.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <select aria-label="Agent filter" value={agent} onChange={e=>setAgent(e.target.value)}><option value="">All agents</option>{Object.entries(providerNames).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select><DateFilter value={days} onChange={setDays}/></div>
    <QueryError error={sessions.error} retry={()=>sessions.refetch()}/>
    <Panel className="rw-section"><Table columns={['Session','Agent','Project','Status','Observed span','Last activity']} rows={rows.map(s=>({key:s.id,cells:[<Link to={'/app/sessions?session='+encodeURIComponent(s.id)}>{s.title||s.id}</Link>,providerNames[s.provider]||s.provider,projectName(s),<span className="rw-badge">{(s.status||'idle').replaceAll('_',' ')}</span>,elapsed(s),timestamp(s.updated_at)]}))} empty={<EmptyState title={sessions.isLoading?'Loading sessions…':'No '+(tab==='History'?'matching':tab.toLowerCase())+' sessions'} detail="Open a project conversation or change the filters to inspect another session." action={tab!=='History'&&<button className="rw-link" onClick={()=>setParams({view:'History'})}>See session history →</button>}/>}/>
    <div className="rw-table-foot">{rows.length} {rows.length===1?'session':'sessions'}</div></Panel>
    <Section title="Execution context"><Facts rows={[[ 'Scope','Conversations created here and project sessions imported through a provider'],['Time zone',Intl.DateTimeFormat().resolvedOptions().timeZone],['Activity','Most recent 300 runtime events per session']]}/></Section>
  </div>
}

function SessionDetail({session:s,project}:{session:NativeSession;project:string}){
  const [params,setParams]=useSearchParams(), cache=useQueryClient()
  const tab=detailTabs.find(v=>v===params.get('tab'))||'Overview'
  const [filter,setFilter]=useState(''),[selected,setSelected]=useState<number|null>(null)
  const events=(s.events||[]).filter(e=>!['message_delta','message'].includes(e.type))
  const byTab=events.filter(e=>{
    if(tab==='Tool history')return ['tool','approval'].includes(e.type)
    if(tab==='File changes')return e.type==='file_change' || e.type==='tool'&&['Edit','Write','fileChange'].includes(String(e.data.name))
    if(tab==='Errors')return e.type==='error' || /failed|error/i.test(String(e.data.status||e.data.method||''))
    return true
  }).filter(e=>(eventTitle(e)+' '+JSON.stringify(e.data)).toLowerCase().includes(filter.toLowerCase()))
  const item=byTab.find(e=>e.seq===selected) || byTab.at(-1)
  const stop=useMutation({mutationFn:()=>runtime.interrupt(s.provider,s.id),onSettled:()=>cache.invalidateQueries({queryKey:['native-activity']})})
  const active=phase(s)==='Active'
  return <div className="page-stack rw-page"><div><Link className="rw-link" to="/app/sessions?view=History">← Agent sessions</Link></div><PageHeading title={(s.title||'Session')+' · '+tab} description={(providerNames[s.provider]||s.provider)+' / '+project} action={<div className="quick-links">{active&&<Button loading={stop.isPending} onClick={()=>stop.mutate()}>Interrupt session</Button>}<Link className="button button-primary" to={sessionUrl(s)}>Open conversation</Link></div>}/>
  <QueryError error={stop.error}/><Tabs values={detailTabs} active={tab} onChange={t=>{setParams({session:s.id,tab:t});setFilter('');setSelected(null)}}/>
  <div className="rw-columns"><div className="rw-stack">{tab==='Overview'?<>
  <Section title="Current task"><div className="rw-panel-body"><span className="rw-badge">{s.status?.replaceAll('_',' ')}</span><h3>{s.title||'Conversation'}</h3></div><Facts rows={[['Current mode',s.mode],['First recorded turn',timestamp(s.events?.find(e=>e.type==='turn_started')?.timestamp)],['Observed span',elapsed(s)],['Last activity',timestamp(s.updated_at)],['Messages',s.messages?.length||0]]}/></Section>
  <Section title="Recent activity">{events.length?events.slice(-4).reverse().map(e=><div className="rw-item" key={e.seq}><strong>{eventTitle(e)}</strong><small>　{timestamp(e.timestamp)}</small></div>):<EmptyState title="No runtime events yet"/>}</Section></>:<>
  <div className="rw-filters"><SearchBox value={filter} onChange={setFilter} placeholder={'Search '+tab.toLowerCase()+'…'}/></div>
  <Section title={tab==='Logs'?'Recorded runtime output':tab}>
  {tab==='Logs'?byTab.length?<pre className="rw-json">{byTab.map(e=>timestamp(e.timestamp)+'  '+eventTitle(e)+'\n'+JSON.stringify(e.data)).join('\n\n')}</pre>:<EmptyState title="No matching output"/>:
   tab==='Timeline'?byTab.length?byTab.map(e=><button key={e.seq} className="rw-event" onClick={()=>setSelected(e.seq)} aria-pressed={item?.seq===e.seq}><Clock size={15}/><strong>{eventTitle(e)}</strong><time>{timestamp(e.timestamp)}</time></button>):<EmptyState title="No timeline events yet"/>:
   <Table columns={['Event','Provider status','Time']} rows={byTab.map(e=>({key:String(e.seq),cells:[<button className="rw-link" onClick={()=>setSelected(e.seq)}>{eventTitle(e)}</button>,String(e.data.status || 'Reported'),timestamp(e.timestamp)]}))} empty={<EmptyState title={'No '+tab.toLowerCase()+' recorded'} detail={tab==='File changes'?'Project Git status includes changes made outside the agent.':undefined}/>}/>}</Section>
   {item&&tab!=='Logs'&&<Section title="Selected event"><pre className="rw-json">{JSON.stringify(item.data,null,2)}</pre></Section>}
  </>}</div><Section title="Session context"><Facts rows={[['Agent',providerNames[s.provider]],['Project',project],['Directory',s.cwd],['Model',s.model||'Runtime default'],['Mode',s.mode],['Session ID',s.id]]}/>{s.project_id&&<div className="quick-links rw-session-actions"><Link to={'/app/code?project='+s.project_id}>Open project →</Link><Link to={'/app/git?project='+s.project_id}>Review changes →</Link></div>}</Section></div></div>
}

