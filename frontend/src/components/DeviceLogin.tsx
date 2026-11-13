import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button, Input } from './Primitives'
import { request } from '../lib/api'

export function DeviceLogin({configured, onDone}:{configured:boolean;onDone:()=>void}){
  const [id,setId]=useState(''),[opened,setOpened]=useState(false)
  const [flow,setFlow]=useState<{user_code:string;verification_uri:string;interval:number}|null>(null)
  const [error,setError]=useState('')
  const begin=useMutation({mutationFn:()=>request<NonNullable<typeof flow>>('/auth/github/device',{method:'POST',body:JSON.stringify({client_id:id.trim()})}),onSuccess:data=>{setError('');setFlow(data)}})
  useEffect(()=>{
    if(!flow)return
    let cancelled=false
    let timer:ReturnType<typeof setTimeout>
    const check=async()=>{
      try{
        const data=await request<{pending?:boolean;interval?:number;ok?:boolean}>('/auth/github/device/check',{method:'POST'})
        if(cancelled)return
        if(data.ok){onDone();return}
        timer=setTimeout(check,(data.interval||5)*1000)
      }catch(e){if(!cancelled){setError((e as Error).message);setFlow(null)}}
    }
    timer=setTimeout(check,flow.interval*1000)
    return ()=>{cancelled=true;clearTimeout(timer)}
  },[flow,onDone])
  return <div className="device-login"><Button variant="primary" onClick={()=>{setOpened(true);if(configured&&!flow)begin.mutate()}}>Continue with GitHub</Button>
    {opened && <div className="ai-form">{!configured && !flow&&<form className="ai-form" onSubmit={e=>{e.preventDefault();begin.mutate()}}><label>GitHub OAuth App client ID<Input required value={id} onChange={e=>setId(e.target.value)} placeholder="Public client ID"/></label><p>Enable device flow in your GitHub OAuth App settings. You can also connect directly with a personal token below.</p><a href="https://github.com/settings/developers" target="_blank" rel="noreferrer">GitHub app settings ↗</a><Button type="submit" loading={begin.isPending}>Get sign-in code</Button></form>}
    {flow&&<div role="status"><p>Enter this code on GitHub and authorize DevPulse.</p><strong className="device-code">{flow.user_code}</strong><a className="button button-secondary" href={flow.verification_uri} target="_blank" rel="noreferrer">Open GitHub sign-in ↗</a><p>Waiting for authorization…</p><Button onClick={()=>{setFlow(null);setOpened(false)}}>Cancel</Button></div>}
    {(begin.error||error)&&<p role="alert">{error||begin.error?.message}</p>}</div>}</div>
}

