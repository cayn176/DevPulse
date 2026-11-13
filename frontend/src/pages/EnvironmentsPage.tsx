import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Layers, Lock, RefreshCw } from 'lucide-react'
import { Button, PageHeading } from '../components/Primitives'
import { request } from '../lib/api'
import { root, Section, Facts, cap, shortDate, idPath, type Project, type Deployment } from '../components/DeploymentControls'

type Variable = {name:string;targets:string[];type:string;branch?:string;updated_at?:number}
const environments = ['production','preview','development']
export function EnvironmentsPage({connected,connect}:{connected:boolean;connect:()=>void}){
  const [chosen,setChosen]=useState(''),[target,setTarget]=useState(''),[search,setSearch]=useState('')
  const projectList=useQuery({queryKey:['vercel','projects'],queryFn:()=>request<Project[]>(root+'/projects'),enabled:connected})
  const id=chosen||projectList.data?.[0]?.id||'', project=projectList.data?.find(p=>p.id===id)
  const variables=useQuery({queryKey:['vercel','vars',id],queryFn:()=>request<Variable[]>(root+'/projects/'+encodeURIComponent(id)+'/environment'),enabled:connected&&!!id})
  const builds=useQuery({queryKey:['vercel','deployments',id],queryFn:()=>request<Deployment[]>(root+'/deployments?project='+encodeURIComponent(id)),enabled:connected&&!!id,refetchInterval:15000})
  const vars=connected?variables.data||[]:[], deployments=connected?builds.data||[]:[]
  const activeVars=vars.filter(v=>v.targets.includes(target)&&v.name.toLowerCase().includes(search.toLowerCase()))
  const dates=(stamp?:number)=>stamp?shortDate(stamp):'Unavailable'
  const count=(env:string)=>!variables.data||!connected?'—':vars.filter(v=>v.targets.includes(env)).length
  return <div className="dep-page"><PageHeading title={target?cap(target)+' / '+(project?.name||'Environment'):'Environments'} description={target?'Configuration metadata and builds for the selected project.':'Inspect deployment targets and their configuration.'} action={connected?<Button onClick={()=>{projectList.refetch();if(id){variables.refetch();builds.refetch()}}}><RefreshCw size={14}/>Refresh</Button>:<Button variant="primary" onClick={connect}>Connect Vercel</Button>}/>
  <div className="dep-toolbar"><select aria-label="Vercel project" value={id} onChange={e=>setChosen(e.target.value)} disabled={!connected||!projectList.data?.length}><option value="">Select project</option>{projectList.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{target&&<Button onClick={()=>{setTarget('');setSearch('')}}>← All environments</Button>}</div>
  {!target?<><div className="dep-cards">{environments.map(env=><div className="dep-stat" key={env}><Layers size={18}/><strong>{cap(env)}</strong><span>{count(env)} variables</span><span>{env==='production'?project?.production_branch||'Production branch unavailable':env==='preview'?'Preview builds':'Local development'}</span><Button onClick={()=>{if(connected&&project)setTarget(env);else if(!connected)connect()}} disabled={connected&&!project}>{connected?'Inspect environment':'Connect account'}<ArrowRight size={13}/></Button></div>)}</div><div className="dep-banner"><Lock size={16}/><span>Environment variable names and targets are visible to accounts with project access. Secret values stay in Vercel.</span></div></>:
  <div className="dep-selection"><Section title="Environment variables" label={String(count(target))}><label className="dep-search"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter variables…" aria-label="Filter variables"/></label><div className="dep-table-scroll"><table className="dep-table"><thead><tr><th>Name</th><th>Type</th><th>Branch</th><th>Updated</th></tr></thead><tbody>{activeVars.map((v,i)=><tr key={v.name+'-'+i}><td><code>{v.name}</code></td><td>{v.type}</td><td>{v.branch||'All'}</td><td>{dates(v.updated_at)}</td></tr>)}{!activeVars.length&&<tr><td colSpan={4}>{variables.isPending?'Loading configuration…':'No matching variables.'}</td></tr>}</tbody></table></div></Section>
  <div className="dep-page"><Section title="Environment details"><Facts items={[[ 'Project',project?.name ],['Target',cap(target)],['Git provider',project?.git],['Production branch',project?.production_branch]]}/></Section><Section title="Recent deployments">{deployments.filter(d=>d.target===target).slice(0,4).map(d=><p key={d.uid}><Link to={idPath(d.uid)}>{d.state} · {shortDate(d.created)} →</Link></p>)}{!deployments.some(d=>d.target===target)&&<p>No builds returned for this target.</p>}</Section></div></div>}
  {[projectList.error,variables.error,builds.error].filter(Boolean).map((e,i)=><p role="alert" key={i}>{e!.message}</p>)}</div>
}

