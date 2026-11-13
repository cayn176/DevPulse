import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { Button, Dialog, Input } from './Primitives'
import { request } from '../lib/api'

export type Deployment = {uid:string;name:string;project_id?:string;url?:string;state:string;target:string;created?:number;building_at?:number;ready_at?:number;completed_at?:number;branch?:string;sha?:string;author?:string;message?:string;error?:string;error_code?:string}
export type Project = {id:string;name:string;git:string|null;production_branch:string|null}
export type Account = {connected:boolean;username?:string;team?:string}
export const root='/api/vercel'
export const statusQuery=['vercel','status']
export const cap=(text:string)=>text?text[0].toUpperCase()+text.slice(1).toLowerCase():'Unknown'
export const stateName=(value:string)=>value==='ERROR'?'Failed':cap(value)
export const idPath=(id:string)=>'/app/deployments/'+encodeURIComponent(id)
export const shortDate=(date?:number)=>date?new Date(date).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—'
export const urlFor=(d:Deployment)=>d.url&&/^([A-Za-z0-9-]+\.)+[A-Za-z0-9-]+$/.test(d.url)?'https://'+d.url:undefined
const json=(method:string,body?:unknown):RequestInit=>({method,...(body?{body:JSON.stringify(body)}:{})})

export function Section({title,label,children}:{title:string;label?:string;children:ReactNode}){
  return <section className="dep-panel"><header><h2>{title}</h2>{label&&<small>{label}</small>}</header><div className="dep-panel-body">{children}</div></section>
}
export function Facts({items}:{items:[string,ReactNode][]}){
  return <dl className="dep-facts">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl>
}
export function Tabs({options,value,change}:{options:[string,string][];value:string;change:(s:string)=>void}){
  return <nav aria-label="Deployment views" className="dep-tabs">{options.map(([id,label])=><button key={id} className={id===value?'active':''} aria-pressed={id===value} onClick={()=>change(id)}>{label}</button>)}</nav>
}
export function OpenUrl({deployment,label='Open deployment'}:{deployment:Deployment;label?:string}){
  const href=urlFor(deployment)
  return href&&deployment.state==='READY'?<a className="button button-secondary" href={href} target="_blank" rel="noreferrer">{label}<ExternalLink size={13}/></a>:<Button disabled>{label}</Button>
}
export function Connection({account,onClose}:{account?:Account;onClose:()=>void}){
  const cache=useQueryClient(),[token,setToken]=useState(''),[team,setTeam]=useState(account?.team||'')
  const change=useMutation({mutationFn:async(type:'save'|'remove')=>{
    await request(root+'/connection',type==='save'?json('PUT',{token,team}):json('DELETE'))
    setToken('')
    await cache.cancelQueries({queryKey:['vercel']})
    cache.removeQueries({queryKey:['vercel'],predicate:q=>q.queryKey[1]!=='status'})
    cache.setQueryData(statusQuery,{connected:false})
    await cache.invalidateQueries({queryKey:statusQuery})
  },onSuccess:onClose})
  return <Dialog title={account?.connected?'Vercel account':'Connect Vercel'} description="Verify access to the projects you want to manage." onClose={()=>!change.isPending&&onClose()}>
    <form className="dep-form" onSubmit={e=>{e.preventDefault();change.mutate('save')}}>{account?.username&&<p>Connected as <b>{account.username}</b>.</p>}
      <label>Access token<Input type="password" autoComplete="off" required minLength={8} value={token} onChange={e=>setToken(e.target.value)}/></label>
      <label>Team ID (optional)<Input value={team} onChange={e=>setTeam(e.target.value)} placeholder="team_…"/></label>
      <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer">Create a Vercel token ↗</a>
      {change.error&&<p role="alert">{change.error.message}</p>}<div className="dep-actions"><Button type="submit" variant="primary" loading={change.isPending}>Verify and connect</Button>{account?.connected&&<Button type="button" disabled={change.isPending} onClick={()=>change.mutate('remove')}>Disconnect</Button>}</div>
    </form></Dialog>
}
export function BuildDialog({projects,deployment,onClose}:{projects:Project[];deployment?:Deployment;onClose:()=>void}){
  const eligible=projects.filter(p=>p.git==='github')
  const [id,setId]=useState(eligible[0]?.id||''),[branch,setBranch]=useState(eligible[0]?.production_branch||''),[target,setTarget]=useState('preview'),[review,setReview]=useState(!!deployment)
  const cache=useQueryClient(),navigate=useNavigate()
  const submit=useMutation({mutationFn:()=>deployment
    ?request<{id:string}>(root+'/deployments/'+encodeURIComponent(deployment.uid)+'/redeploy',json('POST',{confirm:true}))
    :request<{id:string}>(root+'/deployments',json('POST',{project:id,branch:branch.trim(),target,confirm:true})),
    onSuccess:async r=>{await cache.invalidateQueries({queryKey:['vercel','deployments']});onClose();navigate(idPath(r.id))}})
  const name=deployment?.name||eligible.find(p=>p.id===id)?.name||'—'
  return <Dialog title={review?(deployment?'Confirm redeployment':'Confirm deployment'):'Trigger deployment'} onClose={()=>!submit.isPending&&onClose()} footer={<><Button disabled={submit.isPending} onClick={onClose}>Cancel</Button>{review?<Button variant="primary" loading={submit.isPending} onClick={()=>submit.mutate()}>{deployment?'Redeploy':'Deploy'} to {deployment?.target||target}</Button>:<Button variant="primary" disabled={!id||!branch.trim()} onClick={()=>setReview(true)}>Review deployment</Button>}</>}>
    {review?<><Facts items={[['Project',name],['Environment',cap(deployment?.target||target)],['Branch',deployment?.branch||branch],...(deployment?[['Source deployment',deployment.uid],['Commit',deployment.sha]] as [string,ReactNode][]:[])]}/><p className="dep-muted">Vercel will start a new build using this source and the project’s configured resources.</p></>:<div className="dep-form">
      <label>Vercel project<select value={id} onChange={e=>{setId(e.target.value);setBranch(eligible.find(p=>p.id===e.target.value)?.production_branch||'')}}>{eligible.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {!eligible.length&&<p>Link a GitHub repository to a Vercel project to build a branch.</p>}<label>Git branch<Input value={branch} onChange={e=>setBranch(e.target.value)} required placeholder="Branch name"/></label>
      <label>Environment<select value={target} onChange={e=>setTarget(e.target.value)}><option value="preview">Preview</option><option value="production">Production</option></select></label></div>}
    {submit.error&&<p className="dep-error" role="alert">{submit.error.message}</p>}</Dialog>
}
