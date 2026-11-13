import { useState } from 'react'
import { Link,useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Info,RefreshCw } from 'lucide-react'
import { Button,PageHeading } from '../components/Primitives'
import { BuildDialog,Facts,OpenUrl,Section,Tabs,cap,stateName,root,shortDate,urlFor,type Deployment } from '../components/DeploymentControls'
import { request } from '../lib/api'

const time=(value?:number|string)=>value?new Date(typeof value==='string'&&/^\d+$/.test(value)?Number(value):value).toLocaleTimeString():'—'
const terminal=(s:string)=>['READY','ERROR','CANCELED'].includes(s)
export function DeploymentDetail({id,connected,connect}:{id:string;connected:boolean;connect:()=>void}){
  const [params,setParams]=useSearchParams(), active=params.get('view')||'overview'
  const [redeploy,setRedeploy]=useState(false)
  const detail=useQuery({queryKey:['vercel','deployment',id],queryFn:()=>request<Deployment>(root+'/deployments/'+encodeURIComponent(id)),enabled:connected,refetchInterval:q=>q.state.data&&terminal(q.state.data.state)?false:15000})
  const data=detail.data
  const logs=useQuery({queryKey:['vercel','logs',id],queryFn:()=>request<{created?:number;text:string}[]>(root+'/logs/'+encodeURIComponent(id)),enabled:connected&&!!data&&['overview','logs'].includes(active),refetchInterval:()=>data&&!terminal(data.state)?15000:false})
  if(!connected||!data)return <div className="dep-page"><PageHeading title="Deployment details" description={id}/><div className="dep-banner"><Info size={17}/>{!connected?'Connect Vercel to inspect this deployment.':detail.error?.message||'Loading deployment…'}</div><div className="dep-actions">{!connected?<Button onClick={connect}>Connect Vercel</Button>:detail.error&&<Button onClick={()=>detail.refetch()}>Retry</Button>}<Link to="/app/deployments">Back to deployments →</Link></div></div>
  const finished=data.completed_at||data.ready_at
  const duration=data.building_at&&finished&&finished>=data.building_at?Math.round((finished-data.building_at)/1000)+' sec':undefined
  const timeline:[string,number|undefined,string][]=[['Created',data.created,'Deployment created'],['Building',data.building_at,'Build started'],[stateName(data.state),finished,'Provider reported the final state']]
  const logPanel=<Section title="Build logs" label={duration}><div className="dep-logs">{logs.isError?<p role="alert">{logs.error.message}</p>:logs.isPending?<p>Reading build logs…</p>:!logs.data?.length?<p>Vercel returned no build log entries.</p>:logs.data.map((line,i)=><div className={/\b(error|failed)\b/i.test(line.text)?'log-error':''} key={i}><time>{time(line.created)}</time><span>{line.text}</span></div>)}</div></Section>
  const timelinePanel=<Section title="Deployment timeline"><ol className="dep-timeline">{timeline.filter(([,stamp])=>stamp).map(([state,stamp,description])=><li key={state}><strong>• {state}</strong><time>{time(stamp)}</time><span>{description}</span></li>)}</ol></Section>
  return <div className="dep-page"><PageHeading title={data.name+' / '+cap(data.target)} description={data.uid+' · Created '+shortDate(data.created)+' · Vercel deployment'} action={<div className="dep-actions"><OpenUrl deployment={data}/><Button variant="primary" onClick={()=>setRedeploy(true)}><RefreshCw size={15}/>Redeploy…</Button></div>}/>
    <div className={'dep-banner '+(data.state==='ERROR'?'failure':'')}><Info size={17}/><div><strong>{data.state==='ERROR'?'Build failed':stateName(data.state)}{data.error_code?' · '+data.error_code:''}</strong><p>{data.error||(data.state==='ERROR'?'Inspect the build logs before starting another build.':'The current deployment state is reported by Vercel.')}</p></div></div>
    <Tabs options={[['overview','Overview'],['logs','Build logs'],['source','Source'],['environment','Environment'],['timeline','Timeline']]} value={active} change={view=>setParams({view})}/>
    <div className="dep-detail-grid"><div className="dep-panels">{['overview','logs'].includes(active)&&logPanel}{['overview','timeline'].includes(active)&&timelinePanel}
    {active==='source'&&<Section title="Git source"><Facts items={[['Branch',data.branch],['Commit',data.sha],['Author',data.author],['Message',data.message]]}/></Section>}
    {active==='environment'&&<Section title="Environment"><Facts items={[['Target',cap(data.target)],['Project',data.name],['Project ID',data.project_id]]}/><p>Manage environment variables in the Vercel project settings.</p><a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Open Vercel dashboard ↗</a></Section>}
    </div><aside className="dep-panels"><Section title="Build metadata"><Facts items={[['Provider','Vercel'],['Status',stateName(data.state)],['Environment',cap(data.target)],['Build duration',duration],['Branch',data.branch],['Commit',data.sha?.slice(0,7)],['Author',data.author]]}/></Section>
    <Section title="Deployment address"><code>{data.url||'Address unavailable'}</code>{urlFor(data)&&data.state==='READY'&&<OpenUrl deployment={data}/>}</Section>
    <div className="dep-banner"><Info size={16}/><div><strong>Confirm before deploying</strong><p>A new build may execute project scripts and affect provider resources.</p></div></div></aside></div>
    <Link className="dep-back" to="/app/deployments">← All deployments</Link>{redeploy&&<BuildDialog projects={[]} deployment={data} onClose={()=>setRedeploy(false)}/>}</div>
}
