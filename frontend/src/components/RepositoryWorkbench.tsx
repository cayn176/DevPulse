import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, RefreshCw } from 'lucide-react'
import { Button, Dialog, Input, Panel } from './Primitives'
import { request } from '../lib/api'
import { projects } from '../lib/projects'

type Resource = { id: string | number; title: string; url?: string; text?: string }
const tabs = {branches:'Branches',commits:'Commits',pulls:'Pull requests',issues:'Issues',readme:'README',actions:'Actions',settings:'Settings'}

export function RepositoryWorkbench({owner,name}: {owner:string;name:string}) {
  const [tab,setTab] = useState<keyof typeof tabs>('branches')
  const [dialog,setDialog] = useState<'issue'|'clone'|null>(null)
  const [title,setTitle] = useState(''), [body,setBody] = useState('')
  const [folder,setFolder] = useState(name), [published,setPublished] = useState('')
  const [inspect,setInspect]=useState<{kind:string;id:string|number}|null>(null)
  const cache=useQueryClient(), navigate=useNavigate()
  const repo=owner+'/'+name
  const base='/api/repo-tools/'+encodeURIComponent(owner)+'/'+encodeURIComponent(name)
  const rows=useQuery({queryKey:['repo-resources',repo,tab],queryFn:()=>request<Resource[]>(base+'/'+tab),retry:false})
  const detail=useQuery({queryKey:['repo-inspect',repo,inspect?.kind,inspect?.id],queryFn:()=>request<{title:string;text:string;url:string;state?:string;author?:string;branch?:string;base?:string;files:{name:string;added:number;removed:number}[]}>(base+'/'+inspect!.kind+'/'+inspect!.id),enabled:!!inspect,retry:false})
  const clone=useMutation({
    mutationFn:()=>projects.create({action:'clone',name:folder,description:'',remote_url:'https://github.com/'+repo+'.git',use_github_account:true}),
    onSuccess:async p=>{await cache.invalidateQueries({queryKey:['local-projects']});navigate('/app/code?project='+p.id)},
  })
  const create=useMutation({
    mutationFn:()=>request<{url:string}>(base+'/issues',{method:'POST',body:JSON.stringify({title,body,confirm:true})}),
    onSuccess:async r=>{setPublished(r.url);setDialog(null);setTitle('');setBody('');setTab('issues');await cache.invalidateQueries({queryKey:['repo-resources',repo,'issues']})},
  })
  return <Panel className="native-card"><div className="spread"><h2>Repository workspace</h2><div className="quick-links"><Link className="button button-secondary" to={'/app/assistant?repo='+encodeURIComponent(repo)}>Open in DevPulse AI →</Link><Button onClick={()=>{clone.reset();setFolder(name);setDialog('clone')}}><GitBranch size={15}/>Clone locally</Button></div></div>
    <div className="quick-links" role="tablist" aria-label="Repository data">{Object.entries(tabs).map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={'button '+(tab===key?'button-primary':'button-quiet')} onClick={()=>setTab(key as keyof typeof tabs)}>{label}</button>)}</div>
    <div className="spread"><small>Live from GitHub</small><div className="quick-links">{tab==='issues'&&<Button onClick={()=>{create.reset();setDialog('issue')}}>New issue</Button>}<Button onClick={()=>rows.refetch()} disabled={rows.isFetching}><RefreshCw size={13}/>Refresh</Button></div></div>
    {rows.isLoading?<p>Loading {tabs[tab].toLowerCase()}…</p>:rows.error?<p role="alert">{rows.error.message}</p>:rows.data?.length?rows.data.map(row=><div key={row.id} className="row-line">{tab==='commits'&&<code>{String(row.id).slice(0,7)}　</code>}{tab==='pulls'||tab==='issues'?'#'+row.id+'　':''}{['issues','pulls','commits'].includes(tab)?<button className="text-action" onClick={()=>setInspect({kind:tab,id:row.id})}>{row.title} →</button>:row.url?.startsWith('https://github.com/')?<a href={row.url} target="_blank" rel="noreferrer">{row.title} ↗</a>:row.title}{row.text&&<pre style={{whiteSpace:'pre-wrap',maxHeight:440,overflow:'auto'}}>{row.text}</pre>}</div>):<p>No {tabs[tab].toLowerCase()} returned.</p>}
    {published&&<a href={published} target="_blank" rel="noreferrer">View created issue ↗</a>}
    {inspect&&<Dialog title={detail.data?.title||'Repository details'} description={repo+' · '+inspect.kind+' / '+inspect.id} onClose={()=>setInspect(null)}><div className="ai-form">{detail.isPending?<p>Loading…</p>:detail.error?<p role="alert">{detail.error.message}</p>:<><p>{[detail.data?.state,detail.data?.author,detail.data?.branch,detail.data?.base].filter(Boolean).join(' · ')}</p><pre>{detail.data?.text}</pre>{detail.data?.files.map(f=><p key={f.name}>{f.name}　+{f.added} / −{f.removed}</p>)}{detail.data?.url?.startsWith('https://github.com/')&&<a href={detail.data.url} target="_blank" rel="noreferrer">Open on GitHub ↗</a>}</>}</div></Dialog>}
    {dialog==='clone'&&<Dialog title="Clone this repository?" description={repo} onClose={()=>!clone.isPending&&setDialog(null)} footer={<><Button disabled={clone.isPending} onClick={()=>setDialog(null)}>Cancel</Button><Button variant="primary" disabled={!folder.trim()} loading={clone.isPending} onClick={()=>clone.mutate()}>Clone repository</Button></>}><label>New project folder<Input value={folder} onChange={e=>setFolder(e.target.value)}/></label><p>Git will use your connected GitHub account and create a local copy in the workspace directory.</p>{clone.error&&<p role="alert">{clone.error.message}</p>}</Dialog>}
    {dialog==='issue'&&<Dialog title="Create GitHub issue" description={repo} onClose={()=>!create.isPending&&setDialog(null)} footer={<><Button disabled={create.isPending} onClick={()=>setDialog(null)}>Cancel</Button><Button variant="primary" disabled={!title.trim()} loading={create.isPending} onClick={()=>create.mutate()}>Publish issue</Button></>}><div className="ai-form"><label>Title<Input value={title} maxLength={256} onChange={e=>setTitle(e.target.value)}/></label><label>Description<textarea value={body} maxLength={20000} onChange={e=>setBody(e.target.value)}/></label></div>{create.error&&<p role="alert">{create.error.message}</p>}</Dialog>}
  </Panel>
}
