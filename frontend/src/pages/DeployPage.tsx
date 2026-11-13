import { useState } from 'react'
import { Link,useLocation,useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight,ChevronDown,RefreshCw,Rocket,Search } from 'lucide-react'
import { Button,PageHeading } from '../components/Primitives'
import { Connection,BuildDialog,Facts,OpenUrl,Section,Tabs,cap,idPath,root,shortDate,stateName,statusQuery,urlFor,type Account,type Deployment,type Project } from '../components/DeploymentControls'
import { EnvironmentsPage } from './EnvironmentsPage'
import { DeploymentDetail } from './DeploymentDetail'
import { request } from '../lib/api'
import '../styles/deployments.css'

function Filter({label,value,change,options}:{label:string;value:string;change:(s:string)=>void;options:{id:string;name:string}[]}){
  return <label className="dep-filter"><ChevronDown size={13}/><select aria-label={label} value={value} onChange={e=>change(e.target.value)}>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
}
function DeploymentList({connected,account,connect}:{connected:boolean;account?:Account;connect:()=>void}){
  const path=useLocation().pathname
  const isEnv=path.endsWith('environments'), isHistory=path.endsWith('deployment-history')
  const [tab,setTab]=useState('all'),[project,setProject]=useState(''),[branch,setBranch]=useState(''),[days,setDays]=useState('7'),[search,setSearch]=useState('')
  const [selected,setSelected]=useState(''),[launch,setLaunch]=useState(false),[redeploy,setRedeploy]=useState<Deployment>()
  const projects=useQuery({queryKey:['vercel','projects'],queryFn:()=>request<Project[]>(root+'/projects'),enabled:connected})
  const deployments=useQuery({queryKey:['vercel','deployments',project],queryFn:()=>request<Deployment[]>(root+'/deployments?project='+encodeURIComponent(project)),enabled:connected,refetchInterval:15000})
  const rows=connected?deployments.data||[]:[]
  const ready=rows.filter(r=>r.target==='production'&&r.state==='READY'),failed=rows.filter(r=>r.state==='ERROR')
  const previewFailed=failed.filter(r=>r.target==='preview')
  const filtered=rows.filter(r=>(tab==='all'||r.target===tab||(tab==='failed'&&r.state==='ERROR'))&&(!branch||r.branch===branch)&&(!days||!!r.created&&r.created>=Date.now()-Number(days)*86400000)&&[r.uid,r.name,r.branch,r.sha,r.url].join(' ').toLowerCase().includes(search.trim().toLowerCase()))
  const chosen=filtered.find(r=>r.uid===selected)||filtered[0],latest=ready[0]
  return <div className="dep-page"><PageHeading title={isEnv?'Environments':isHistory?'Deployment history':'Deployment center'} description={isEnv?'Explore the builds for each project environment.':isHistory?'Inspect recent Vercel builds and their source.':'Production and preview, with the context behind every build.'} action={<Button variant="primary" onClick={()=>connected?setLaunch(true):connect()}><Rocket size={15}/>{connected?'Trigger deployment…':'Connect Vercel'}</Button>}/>
    {!isHistory&&<div className="dep-cards"><button className="dep-stat account" onClick={connect}><small>Vercel account</small><strong>{connected?account?.username:'Not connected'}</strong><span>{connected?account?.team||'Personal account':'Link account to load deployments'}</span></button>
    <div className="dep-stat"><small>Production</small><strong>{connected&&deployments.data?ready.length+' ready':'—'}</strong><span>{ready.length?ready.slice(0,3).map(d=>d.name).join(' · '):'Ready production builds'}</span></div>
    <div className="dep-stat"><small>Preview attention</small><strong className={previewFailed.length?'dep-error':''}>{connected&&deployments.data?previewFailed.length+' failed':'—'}</strong><span>{previewFailed[0]?previewFailed[0].name+' · '+shortDate(previewFailed[0].created):'Failed preview builds'}</span></div></div>}
    <Tabs options={[['all','All deployments'],['production','Production'],['preview','Preview'],['failed',failed.length?'Failed · '+failed.length:'Failed']]} value={tab} change={setTab}/>
    <div className="dep-toolbar"><label className="dep-search"><Search size={16}/><input type="search" aria-label="Search deployments" placeholder="Search deployments…" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <Filter label="Project filter" value={project} change={v=>{setProject(v);setBranch('')}} options={[{id:'',name:'All projects'},...(connected?projects.data||[]:[])]}/>
    <Filter label="Branch filter" value={branch} change={setBranch} options={[{id:'',name:'All branches'},...Array.from(new Set(rows.map(d=>d.branch).filter((v):v is string=>!!v))).map(id=>({id,name:id}))]}/>
    <Filter label="Created within" value={days} change={setDays} options={[{id:'7',name:'Last 7 days'},{id:'30',name:'Last 30 days'},{id:'',name:'All dates'}]}/>
    {connected&&<Button className="dep-refresh" size="small" onClick={()=>deployments.refetch()} loading={deployments.isFetching}><RefreshCw size={13}/>Refresh</Button>}</div>
    <div className="dep-table-scroll"><table className="dep-table"><thead><tr>{['Deployment','Project','Environment','Status','Branch','Commit','Created','URL'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>
    {filtered.map(d=><tr key={d.uid} className={chosen?.uid===d.uid?'selected':''} onClick={()=>setSelected(d.uid)}><td><button onClick={()=>setSelected(d.uid)} aria-pressed={chosen?.uid===d.uid}>{d.uid}</button></td><td>{d.name}</td><td>{cap(d.target)}</td><td className={'dep-state state-'+d.state.toLowerCase()}>{stateName(d.state)}</td><td>{d.branch||'—'}</td><td><code>{d.sha?.slice(0,7)||'—'}</code></td><td>{shortDate(d.created)}</td><td>{urlFor(d)&&d.state==='READY'?<a href={urlFor(d)} target="_blank" rel="noreferrer">{d.url} ↗</a>:d.url||'—'}</td></tr>)}
    {!filtered.length&&<tr><td colSpan={8} className="dep-empty"><Rocket size={20}/><strong>{!connected?'No Vercel account connected':deployments.isLoading?'Loading deployments…':deployments.error?'Could not load deployments':'No matching deployments'}</strong><span>{!connected?'Connect your account to see builds, branches and deployment history.':deployments.error?.message||'Try another filter or start a new build.'}</span>{!connected&&<Button size="small" onClick={connect}>Connect account</Button>}</td></tr>}</tbody></table></div>
    {isHistory&&<Section title="Historical build events" label="Filtered deployments">{filtered.slice(0,12).map(d=><div className="row-line spread" key={d.uid}><Link to={idPath(d.uid)}>{d.name} · {stateName(d.state)}</Link><small>{shortDate(d.completed_at||d.ready_at||d.created)}</small></div>)}{!filtered.length&&<p>Deployment events appear after connecting a Vercel project.</p>}</Section>}
    <div className="dep-selection"><Section title={chosen?stateName(chosen.state)+' '+chosen.target+' · '+chosen.name:'Selected deployment'} label={chosen?.uid}>
      {chosen?<><p>{chosen.error||('Created '+shortDate(chosen.created)+' from '+(chosen.branch||'the selected source')+'.')}</p><div className="dep-actions"><Link className="button button-secondary" to={idPath(chosen.uid)+'?view=logs'}>View build logs</Link><Link className="button button-primary" to={idPath(chosen.uid)}>Deployment details <ArrowRight size={14}/></Link><Button onClick={()=>setRedeploy(chosen)}>Redeploy…</Button></div></>:<p>Select a deployment to review its build logs, source and timeline.</p>}</Section>
      <Section title={latest?'Latest production · '+latest.name:'Latest production'}>{latest?<><Facts items={[['Status',stateName(latest.state)],['Commit',latest.sha?.slice(0,7)]]}/><OpenUrl deployment={latest} label="Open production URL"/></>:<p>No ready production build is available.</p>}</Section></div>
    {connected&&projects.error&&<p className="dep-error" role="alert">{projects.error.message}</p>}
    {launch&&<BuildDialog projects={projects.data||[]} onClose={()=>setLaunch(false)}/>}
    {redeploy&&<BuildDialog projects={[]} deployment={redeploy} onClose={()=>setRedeploy(undefined)}/>}</div>
}
export function DeployPage(){
  const location=useLocation()
  const {deployment}=useParams<{deployment:string}>(),[manage,setManage]=useState(false)
  const account=useQuery({queryKey:statusQuery,queryFn:()=>request<Account>(root+'/status'),retry:false})
  const connected=account.data?.connected===true&&!account.error
  return <>{deployment?<DeploymentDetail key={deployment} id={deployment} connected={connected} connect={()=>setManage(true)}/>:location.pathname.endsWith('/environments')?<EnvironmentsPage connected={connected} connect={()=>setManage(true)}/>:<DeploymentList connected={connected} account={account.data} connect={()=>setManage(true)}/>}
    {account.error&&<p className="dep-error" role="alert">{account.error.message} <button onClick={()=>account.refetch()}>Retry</button></p>}
    {manage&&<Connection account={account.data} onClose={()=>setManage(false)}/>}</>
}
