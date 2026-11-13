import type { ReactNode } from 'react'
import { CircleDashed, Search } from 'lucide-react'
import { Input, Panel } from './Primitives'
import type { NativeSession } from '../lib/runtime'
import '../styles/reference-workspace.css'

export const providerNames: Record<string, string> = { codex: 'OpenAI Codex', claude: 'Claude Agent', cursor: 'Cursor Agent' }
export function sessionUrl(session: NativeSession) {
  const query = new URLSearchParams({agent: session.provider, session: session.id})
  if (session.project_id) query.set('project', session.project_id)
  return '/app/conversations?' + query
}
export function timestamp(value?: string|number) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})
}
export function Tabs({values, active, onChange}:{values:string[];active:string;onChange:(v:string)=>void}) {
  return <div className="rw-tabs" role="group" aria-label="Views">{values.map(v=><button key={v} type="button" aria-pressed={v===active} onClick={()=>onChange(v)}>{v}</button>)}</div>
}
export function SearchBox({value,onChange,placeholder}:{value:string;onChange:(v:string)=>void;placeholder:string}){
  return <label className="rw-search"><Search size={15}/><Input aria-label={placeholder} type="search" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>
}
export function EmptyState({title,detail,action}:{title:string;detail?:string;action?:ReactNode}){
  return <div className="rw-empty"><span className="rw-empty-icon"><CircleDashed size={19}/></span><h3>{title}</h3>{detail&&<p>{detail}</p>}{action}</div>
}
export function Section({title,action,children}:{title:string;action?:ReactNode;children:ReactNode}){
  return <Panel className="rw-section"><div className="rw-panel-head"><h2>{title}</h2>{action}</div>{children}</Panel>
}
export function Facts({rows}:{rows:[string,ReactNode][]}){
  return <dl className="rw-facts">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value??'—'}</dd></div>)}</dl>
}
export function Table({columns,rows,empty}:{columns:string[];rows:{key:string;cells:ReactNode[]}[];empty?:ReactNode}){
  return <div className="rw-table-wrap"><table className="rw-table"><thead><tr>{columns.map(c=><th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.key}>{row.cells.map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table>{!rows.length&&empty}</div>
}
export function QueryError({error,retry}:{error:Error|null;retry?:()=>void}){
  return error?<div role="alert" className="inline-alert">{error.message} {retry && <button className="rw-link" onClick={retry}>Try again</button>}</div>:null
}
export function queryWithin(date:string|number|undefined,days:string){
  if (!days) return true
  return date!==undefined && new Date(date).getTime()>=Date.now()-Number(days)*86400000
}
export function DateFilter({value,onChange}:{value:string;onChange:(s:string)=>void}){
  return <select aria-label="Date range" value={value} onChange={e=>onChange(e.target.value)}><option value="">All dates</option><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option></select>
}
export function DownloadJson(filename:string, data:unknown){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}))
  const anchor=document.createElement('a')
  anchor.href=url; anchor.download=filename; anchor.click()
  setTimeout(()=>URL.revokeObjectURL(url),5000)
}

