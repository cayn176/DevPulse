import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {  ChevronDown, Info, ListChecks, Play, Plus, Search, Workflow as WorkflowIcon } from 'lucide-react'
import { Button, Dialog, Input, PageHeading } from '../components/Primitives'
import { automation, type Workflow, type WorkflowValues, type WorkflowRun, type Preview } from '../lib/automation'
import { projects, type LocalProject } from '../lib/projects'
import '../styles/reference-manager.css'

const actionNames={task:'Create a local task',git_review:'Prepare a Git review task'}
const newWorkflow:WorkflowValues={name:'',instructions:'',project_id:null,action:'task',enabled:true}
const formatTime=(value:string)=>new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
const invalidate=(cache:ReturnType<typeof useQueryClient>)=>cache.invalidateQueries({queryKey:['local-work']})

function WorkflowEditor({workflow,list,onClose,onSaved}:{workflow:Workflow|null;list:LocalProject[];onClose:()=>void;onSaved:(id:string)=>void}){
  const [form,setForm]=useState<WorkflowValues>(workflow?{name:workflow.name,instructions:workflow.instructions,project_id:workflow.project_id,action:workflow.action,enabled:workflow.enabled}:{...newWorkflow})
  const save=useMutation({mutationFn:()=>automation.save(form,workflow?.id),onSuccess:w=>onSaved(w.id)})
  return <Dialog title={workflow?'Edit workflow':'Create workflow'} description="Choose the task to prepare each time you run this workflow." onClose={()=>!save.isPending&&onClose()}>
    <form className="ref-form" onSubmit={e=>{e.preventDefault();save.mutate()}}>
      <label>Workflow name<Input autoFocus value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Review working tree" maxLength={140} required/></label>
      <label>Project<select value={form.project_id||''} onChange={e=>setForm({...form,project_id:e.target.value||null})} required={form.action==='git_review'}><option value="">Workspace</option>{list.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Action<select value={form.action} onChange={e=>setForm({...form,action:e.target.value as Workflow['action']})}>{Object.entries(actionNames).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
      <label>Task instructions<textarea value={form.instructions} onChange={e=>setForm({...form,instructions:e.target.value})} placeholder="Describe the follow-up task…" maxLength={1000} required/></label>
      {form.action==='git_review'&&<small>The preview includes the selected project's current branch and up to 30 changed file paths.</small>}
      <label className="ref-check"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>Enable manual runs</label>
      {save.error&&<p role="alert" className="ref-error">{save.error.message}</p>}
      <div className="ref-actions"><Button type="submit" variant="primary" loading={save.isPending}>{workflow?'Save workflow':'Create workflow'}</Button><Button type="button" disabled={save.isPending} onClick={onClose}>Cancel</Button></div>
    </form></Dialog>
}

function RunReview({workflow,onClose,onRun}:{workflow:Workflow;onClose:()=>void;onRun:(run:WorkflowRun)=>void}){
  const [requestId]=useState(()=>crypto.randomUUID()),[snapshot,setSnapshot]=useState<Preview|null>(null)
  const preview=useQuery({queryKey:['workflow-preview',workflow.id,requestId],queryFn:()=>automation.preview(workflow.id),retry:false})
  const result=snapshot??preview.data
  const execute=useMutation({mutationFn:()=>automation.execute(workflow.id,result!.revision,requestId),onSuccess:onRun})
  return <Dialog title="Preview run" description={workflow.name} onClose={()=>!execute.isPending&&onClose()} footer={<><Button disabled={execute.isPending} onClick={onClose}>Cancel</Button><Button variant="primary" loading={execute.isPending} disabled={!result||!workflow.enabled} onClick={()=>execute.mutate()}>Confirm and create task</Button></>}>
    <div className="ref-form"><strong>Task to be created</strong><pre className="ref-output">{result?.text||preview.error?.message||'Preparing task…'}</pre><small>Creates one item in Tasks. Remote services and project files are unchanged.</small>
    {!workflow.enabled&&<p>Enable this workflow to run it.</p>}
    {execute.error&&<div role="alert"><p className="ref-error">{execute.error.message}</p><Button onClick={async()=>{const updated=await preview.refetch();if(updated.data){setSnapshot(updated.data);execute.reset()}}}>Refresh preview</Button></div>}</div>
  </Dialog>
}

function RunList({rows}:{rows:WorkflowRun[]}){
  const [opened,setOpened]=useState<string|null>(null)
  return <div className="ref-box"><div className="ref-panel-heading"><h2>Execution history</h2><small>Latest 200 runs</small></div>
    {rows.length?rows.map(r=><div className="ref-run" key={r.id}><button aria-expanded={opened===r.id} onClick={()=>setOpened(opened===r.id?null:r.id)}><strong>{r.name}</strong><span>{formatTime(r.created_at)} <ChevronDown size={14}/></span></button>
      {opened===r.id&&<><pre className="ref-output">{r.output}</pre><Link to="/app/tasks">{r.task_id?'Open Tasks':'Task removed · View Tasks'} →</Link></>}</div>):<div className="ref-blank"><ListChecks size={22}/><strong>No runs yet</strong><p>Run a workflow to record its result here.</p></div>}</div>
}

export function AutomationPage(){
  const cache=useQueryClient()
  const work=useQuery({queryKey:['local-work','workflows'],queryFn:automation.workflows})
  const history=useQuery({queryKey:['local-work','runs'],queryFn:automation.runs})
  const hosts=useQuery({queryKey:['local-projects'],queryFn:()=>projects.list()})
  const [tab,setTab]=useState('Workflows'),[search,setSearch]=useState(''),[project,setProject]=useState(''),[state,setState]=useState('')
  const [selected,setSelected]=useState(''),[editor,setEditor]=useState<Workflow|null|undefined>(undefined),[review,setReview]=useState<Workflow|null>(null)
  const [deleting,setDeleting]=useState<Workflow|null>(null)
  const manifest=work.data||[], runs=history.data||[], list=hosts.data||[]
  const names=new Map(list.map(p=>[p.id,p.name]))
  const filtered=manifest.filter(w=>w.name.toLowerCase().includes(search.toLowerCase())&&(!project||w.project_id===project)&&(!state||String(w.enabled)===state))
  const current=filtered.find(w=>w.id===selected)||filtered[0]
  const last=current?runs.find(r=>r.workflow_id===current.id):null
  const change=useMutation({mutationFn:async(w:Workflow)=>{await automation.save({name:w.name,project_id:w.project_id,action:w.action,instructions:w.instructions,enabled:!w.enabled},w.id)},onSuccess:()=>invalidate(cache)})
  const remove=useMutation({mutationFn:(id:string)=>automation.remove(id),onSuccess:async()=>{setDeleting(null);await invalidate(cache)}})
  const openNew=()=>setEditor(null)
  return <div className="ref-page"><PageHeading title="Automation" description="Inspect each trigger and review the task before it runs." action={<Button variant="primary" onClick={openNew}><Plus size={16}/>Create workflow</Button>}/>
    <div className="ref-notice"><Info size={18}/><div><strong>Manual workflows · Local execution</strong><p>Preview a task or collect Git changes from a registered project. Each run requires confirmation and records its result in this workspace.</p></div></div>
    <div className="ref-tabs">{['Workflows','Execution history','Permissions'].map(t=><button className={t===tab?'active':''} key={t} onClick={()=>setTab(t)}>{t}{t==='Workflows'&&' · '+manifest.length}</button>)}</div>
    {tab==='Permissions'?<div className="ref-box"><div className="ref-panel-heading"><h2>Workflow permissions</h2></div><div className="ref-permissions">{[['Manual trigger','Only you can start a run. A disabled workflow can still be previewed.'],['Project access','Git review reads the branch and file status of the selected registered project.'],['Local task creation','Review the exact task text and confirm to create it.']].map(([key,description])=><div key={key}><strong>{key}</strong><p>{description}</p></div>)}</div></div>:tab==='Execution history'?<RunList rows={runs}/>:<>
      <div className="ref-filters"><label className="ref-search"><Search size={16}/><input aria-label="Search workflows" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search workflows…"/></label>
      <select value={project} aria-label="Filter projects" onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{list.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select value={state} aria-label="Filter states" onChange={e=>setState(e.target.value)}><option value="">All states</option><option value="true">Enabled</option><option value="false">Disabled</option></select></div>
      <div className="ref-box ref-table-wrap"><table className="ref-table"><thead><tr>{['Workflow','Trigger','Action','Project','State','Last run'].map(v=><th key={v}>{v}</th>)}</tr></thead><tbody>{filtered.map(w=><tr key={w.id} className={current?.id===w.id?'chosen':''} onClick={()=>setSelected(w.id)}><td><button className="ref-row-select" onClick={()=>setSelected(w.id)}>{w.name}</button></td><td>Manual run</td><td>{actionNames[w.action]}</td><td>{w.project_id?names.get(w.project_id)||'Project unavailable':'Workspace'}</td><td>{w.enabled?'Enabled':'Disabled'}</td><td>{runs.find(r=>r.workflow_id===w.id)?formatTime(runs.find(r=>r.workflow_id===w.id)!.created_at):'—'}</td></tr>)}</tbody></table>
        {!filtered.length&&<div className="ref-blank"><WorkflowIcon size={25}/><strong>{work.isPending?'Loading workflows…':work.isError?'Could not load workflows':manifest.length?'No matching workflows':'No workflows yet'}</strong><p>{work.isError?work.error.message:manifest.length?'Adjust the filters to find a workflow.':'Create a manual workflow for a repeatable follow-up task.'}</p>{!manifest.length&&!work.isPending&&!work.isError&&<button className="ref-text-link" onClick={openNew}>Create your first workflow →</button>}</div>}</div>
      <div className="ref-split"><div className="ref-box"><div className="ref-panel-heading"><h2>{current?.name||'Workflow details'}</h2>{current&&<small>Selected workflow</small>}</div><div className="ref-box-body">
        {current?<><div className="ref-facts"><div><small>Trigger</small><strong>Manual run</strong></div><div><small>Action</small><strong>{actionNames[current.action]}</strong></div></div><p>{current.instructions}</p><div className="ref-actions"><Button onClick={()=>setEditor(current)}>Edit workflow</Button><Button onClick={()=>setReview(current)}><Play size={13}/>Preview run</Button><Button disabled={change.isPending} onClick={()=>change.mutate(current)}>{current.enabled?'Disable':'Enable'}</Button><Button variant="quiet" onClick={()=>setDeleting(current)}>Delete</Button></div></>:<p>Select a workflow to inspect its trigger, action and permissions.</p>}</div></div>
      <div className="ref-box"><div className="ref-panel-heading"><h2>Execution history</h2></div><div className="ref-box-body">
      {last?<><span className="ref-status good">Task created</span><dl className="ref-kv"><dt>Timestamp</dt><dd>{formatTime(last.created_at)}</dd><dt>Trigger source</dt><dd>Manual run</dd><dt>External changes</dt><dd>None</dd></dl><button className="ref-text-link" onClick={()=>setTab('Execution history')}>Inspect run details →</button></>:<p>No confirmed runs for this workflow.</p>}</div></div></div>
    </>}
    {(history.error||hosts.error||change.error)&&<p role="alert" className="ref-error">{(history.error||hosts.error||change.error)?.message}</p>}
    {editor!==undefined&&<WorkflowEditor workflow={editor} list={list} onClose={()=>setEditor(undefined)} onSaved={async id=>{setSelected(id);setTab('Workflows');setProject('');setSearch('');setState('');setEditor(undefined);await invalidate(cache)}}/>}
    {review&&<RunReview workflow={review} onClose={()=>setReview(null)} onRun={async()=>{setReview(null);await invalidate(cache)}}/>}
    {deleting&&<Dialog title="Delete workflow?" description={deleting.name} onClose={()=>!remove.isPending&&setDeleting(null)} footer={<><Button onClick={()=>setDeleting(null)} disabled={remove.isPending}>Cancel</Button><Button variant="danger" onClick={()=>remove.mutate(deleting.id)} loading={remove.isPending}>Delete workflow</Button></>}><p>Existing tasks and execution history will stay in this workspace.</p>{remove.error&&<p className="ref-error">{remove.error.message}</p>}</Dialog>}
  </div>
}

export { TasksPage } from './TasksBoard'
