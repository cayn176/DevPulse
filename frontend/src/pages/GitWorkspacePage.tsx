import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Input, PageHeading, Panel, Dialog } from '../components/Primitives'
import { projects, type GitAction } from '../lib/projects'

export function GitWorkspacePage() {
  const [params,setParams]=useSearchParams(), cache=useQueryClient()
  const list=useQuery({queryKey:['local-projects'], queryFn:()=>projects.list()})
  const id=params.get('project')||list.data?.[0]?.id||''
  const git=useQuery({queryKey:['project-git',id], queryFn:()=>projects.git(id),enabled:!!id})
  const [file,setFile]=useState(''), [branch,setBranch]=useState(''), [message,setMessage]=useState('')
  const [review,setReview]=useState<GitAction|null>(null), [notice,setNotice]=useState('')
  const change=git.data?.changes.find(f=>f.path===file)
  const diff=useQuery({queryKey:['git-diff',id,file,change?.staged],queryFn:()=>projects.diff(id,file,change?.staged),enabled:!!id&&!!change})
  const run=useMutation({mutationFn:()=>projects.act(id,review!),onSuccess:async result=>{
    setNotice(result.output);setReview(null);setMessage('')
    await Promise.all([cache.invalidateQueries({queryKey:['project-git']}),cache.invalidateQueries({queryKey:['git-diff']}),cache.invalidateQueries({queryKey:['local-projects']})])
    if(result.project)setParams({project:result.project.id})
  }})
  function prepare(action:string){run.reset();setReview({action,paths:file?[file]:[],message,branch,confirm:true})}
  return <div className="page-stack"><PageHeading eyebrow="DEVELOPMENT" title="Git & version control" action={<Button onClick={()=>git.refetch()} disabled={!id}>Refresh</Button>}/>
    <div className="quick-links"><select aria-label="Project" value={id} onChange={e=>{setFile('');setParams({project:e.target.value})}}>{list.data?.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><Link to="/app/projects">Manage projects →</Link></div>
    {!id?<p>Open a project to see its Git status.</p>:git.data && <>{!git.data.is_repository?<Button onClick={()=>prepare('init')}>Initialize Git repository</Button>:<div className="git-layout"><Panel className="native-card"><h2>{git.data.branch || 'Detached HEAD'}</h2><div className="quick-links">{['pull','push'].map(a=><Button key={a} onClick={()=>prepare(a)}>{a}</Button>)}</div><h3>Working tree</h3>{!git.data.changes.length&&<p>Working tree clean.</p>}{git.data.changes.map(f=><button className={'session-link '+(f.path===file?'selected':'')} key={f.path} onClick={()=>setFile(f.path)}>{f.status}　{f.path}</button>)}
    <h3>Commit</h3><Input placeholder="Commit message" value={message} onChange={e=>setMessage(e.target.value)}/><Button disabled={!message.trim()||!git.data.changes.some(f=>f.staged)} onClick={()=>prepare('commit')}>Commit staged files</Button>
    <h3>Branches & worktrees</h3><Input placeholder="Branch name" list="branch-names" value={branch} onChange={e=>setBranch(e.target.value)}/><datalist id="branch-names">{git.data.branches.map(b=><option key={b}>{b}</option>)}</datalist><div className="quick-links">{['branch','switch','worktree'].map(a=><Button key={a} disabled={!branch} onClick={()=>prepare(a)}>{a==='branch'?'New branch':a==='switch'?'Switch':'New worktree'}</Button>)}</div></Panel>
    <Panel className="native-card"><h2>{change?file:'Changes'}</h2>{change?<><div className="quick-links">{['stage','unstage','restore'].map(a=><Button key={a} onClick={()=>prepare(a)}>{a}</Button>)}</div><pre>{diff.data?.diff||diff.data?.modified||diff.error?.message||'Loading diff…'}</pre></>:<p>Select a file to inspect changes.</p>}<h3>Recent commits</h3>{git.data.commits.map(c=><div key={c.sha} className="row-line"><code>{c.sha.slice(0,7)}</code> {c.message} <small>{c.author}</small></div>)}</Panel></div>}</>}
    {notice&&<p role="status">{notice}</p>}{(git.error||list.error)&&<p role="alert">{(git.error||list.error)?.message}</p>}
    {review&&<Dialog title={'Confirm Git '+review.action} description={list.data?.find(p=>p.id===id)?.path} onClose={()=>!run.isPending&&setReview(null)} footer={<><Button disabled={run.isPending} onClick={()=>setReview(null)}>Cancel</Button><Button variant="primary" loading={run.isPending} onClick={()=>run.mutate()}>Confirm {review.action}</Button></>}><p>{review.action==='restore'?'Discard unstaged changes to '+file:review.action==='commit'?message:review.action==='push'||review.action==='pull'?'Remote origin · '+git.data?.branch:['switch','branch','worktree'].includes(review.action)?branch:file}</p>{run.error&&<p role="alert">{run.error.message}</p>}</Dialog>}</div>
}

