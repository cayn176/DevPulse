import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LayoutGrid, List, Plus, Search, Trash2 } from 'lucide-react'
import { Button, Dialog, Input, PageHeading } from '../components/Primitives'
import { automation, type Task, type TaskValues, type TaskStatus, type TaskPriority } from '../lib/automation'
import { projects, type LocalProject } from '../lib/projects'

const columns: [TaskStatus,string][]=[['backlog','Backlog'],['todo','To do'],['in_progress','In progress'],['review','Review'],['done','Done']]
const priorities:TaskPriority[]=['low','normal','high','urgent']
const newTask=(status:TaskStatus):TaskValues=>({text:'',description:'',project_id:null,status,priority:'normal'})

function TaskEditor({initial,id,list,close}:{initial:TaskValues;id?:string;list:LocalProject[];close:()=>void}){
  const [form,setForm]=useState<TaskValues>({...initial})
  const [deleting,setDeleting]=useState(false)
  const cache=useQueryClient()
  const save=useMutation({mutationFn:()=>deleting&&id?automation.removeTask(id):automation.saveTask(form,id),onSuccess:async()=>{await cache.invalidateQueries({queryKey:['local-work','tasks']});close()}})
  const update=(key:keyof TaskValues,value:string|null)=>setForm({...form,[key]:value})
  return <Dialog title={deleting?'Remove this task?':id?'Task details':'Create task'} onClose={()=>!save.isPending&&close()}>
    {deleting?<><p>{form.text}</p><div className="ref-actions"><Button onClick={()=>setDeleting(false)}>Keep task</Button><Button loading={save.isPending} variant="danger" onClick={()=>save.mutate()}>Remove task</Button></div></>:
    <form className="ref-form" onSubmit={e=>{e.preventDefault();save.mutate()}}>
      <label>Title<Input autoFocus required maxLength={1000} value={form.text} onChange={e=>update('text',e.target.value)}/></label>
      <div className="quick-links"><label>Due date<Input type="date" value={form.due_date||''} onChange={e=>update('due_date',e.target.value||null)}/></label><label>Labels<Input maxLength={240} placeholder="ui, release" value={form.labels||''} onChange={e=>update('labels',e.target.value)}/></label></div>
      {!!(initial as Task).history?.length&&<details><summary>Task activity</summary>{(initial as Task).history?.slice().reverse().map((item,i)=><p key={i}>{new Date(item.time).toLocaleString()} · {item.fields.join(', ')}</p>)}</details>}
      <label>Description<textarea rows={4} maxLength={6000} value={form.description} onChange={e=>update('description',e.target.value)}/></label>
      <label>Project<select value={form.project_id||''} onChange={e=>update('project_id',e.target.value||null)}><option value="">Workspace</option>{list.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="ref-filters"><label>Status<select value={form.status} onChange={e=>update('status',e.target.value)}>{columns.map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label><label>Priority<select value={form.priority} onChange={e=>update('priority',e.target.value)}>{priorities.map(p=><option key={p}>{p}</option>)}</select></label></div>
      <div className="ref-actions"><Button type="submit" variant="primary" disabled={!form.text.trim()} loading={save.isPending}>{id?'Save changes':'Create task'}</Button>{id&&<Button type="button" onClick={()=>setDeleting(true)}><Trash2 size={13}/>Remove</Button>}</div>
    </form>}{save.error&&<p role="alert" className="ref-error">{save.error.message}</p>}
  </Dialog>
}

export function TasksPage(){
  const tasks=useQuery({queryKey:['local-work','tasks'],queryFn:automation.tasks})
  const projectList=useQuery({queryKey:['local-projects'],queryFn:()=>projects.list()})
  const [view,setView]=useState<'board'|'list'>('board'),[selected,setSelected]=useState<{values:TaskValues;id?:string}|null>(null)
  const [tab,setTab]=useState<string>('all'),[priority,setPriority]=useState(''),[project,setProject]=useState(''),[search,setSearch]=useState('')
  const rows=tasks.data||[],list=projectList.data||[]
  const matches=rows.filter(r=>(tab==='all'||tab===r.status)&&(!priority||r.priority===priority)&&(!project||r.project_id===project)&&(r.text+' '+r.description).toLowerCase().includes(search.toLowerCase()))
  const projectName=(task:Task)=>list.find(p=>p.id===task.project_id)?.name||'Workspace'
  const create=(status:TaskStatus='todo')=>setSelected({values:{...newTask(status),project_id:project||null}})
  const open=(task:Task)=>setSelected({values:task,id:task.id})
  return <div className="ref-page"><PageHeading title="Tasks" description={rows.length+' tasks in your workspace'} action={<div className="ref-actions"><Button onClick={()=>setView(view==='board'?'list':'board')}>{view==='board'?<List size={15}/>:<LayoutGrid size={15}/>} {view==='board'?'List view':'Board view'}</Button><Button variant="primary" onClick={()=>create()}><Plus size={15}/>Create task</Button></div>}/>
    <div className="ref-tabs">{[['all','All tasks'],...columns].map(([value,label])=><button key={value} className={tab===value?'active':''} onClick={()=>setTab(value)}>{label}</button>)}</div>
    <div className="ref-filters"><label className="ref-search"><Search size={15}/><input placeholder="Search tasks…" aria-label="Search tasks" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filter projects" value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{list.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><select aria-label="Filter priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{priorities.map(p=><option key={p}>{p}</option>)}</select></div>
    {view==='board'?<div className="ref-taskboard">{columns.filter(([value])=>tab==='all'||tab===value).map(([value,label])=><section className="ref-box task-lane" key={value}><header><h2>{label}</h2><small>{matches.filter(t=>t.status===value).length}</small><button aria-label={'Add to '+label} onClick={()=>create(value)}><Plus size={13}/></button></header>{matches.filter(t=>t.status===value).map(t=><button className="board-task" key={t.id} onClick={()=>open(t)}><small>{projectName(t)}</small><strong>{t.text}</strong>{t.description&&<p>{t.description}</p>}<span>{t.priority}</span></button>)}</section>)}</div>:
    <div className="ref-scroll"><table className="ref-table"><thead><tr>{['Task','Project','Status','Priority','Created'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{matches.map(t=><tr key={t.id}><td><button onClick={()=>open(t)}>{t.text}</button></td><td>{projectName(t)}</td><td>{columns.find(([v])=>v===t.status)?.[1]}</td><td>{t.priority}</td><td>{new Date(t.created_at).toLocaleDateString()}</td></tr>)}{!matches.length&&<tr><td colSpan={5}>No tasks match this view.</td></tr>}</tbody></table></div>}
    {(tasks.error||projectList.error)&&<p role="alert">{(tasks.error||projectList.error)?.message}</p>}{selected&&<TaskEditor initial={selected.values} id={selected.id} list={list} close={()=>setSelected(null)}/>}</div>
}

