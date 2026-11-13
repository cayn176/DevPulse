import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button, Input, Dialog } from './Primitives'
import { projects, type ProjectFile, type GitChange } from '../lib/projects'

type FileAction='mkdir'|'rename'|'delete'
type Props={id:string;file?:ProjectFile & {draft:string};language:string;change?:GitChange;onFileChange:(action:FileAction,path:string)=>Promise<void>}
export function FileInspector({id,file,language,change,onFileChange}:Props) {
  const [action,setAction]=useState<FileAction|null>(null)
  const [path,setPath]=useState('')
  const [copied,setCopied]=useState('')
  const modify=useMutation({mutationFn:()=>{
    if(!action) throw new Error('Select an operation.')
    return projects.fileOperation(id,action,action==='mkdir'?path:file!.path,file?.hash,action==='rename'?path:undefined)
  },onSuccess:async result=>{await onFileChange(action!,result.path);setAction(null)}})
  function begin(type:FileAction){modify.reset();setPath(type==='rename'?file?.path||'':'');setAction(type)}
  return <aside className="file-inspector"><h3>File context</h3>
    {file ? <dl>{[['File',file.path],['Language',language],['Git state',change?.status.trim()||'Unchanged'],['Encoding','UTF-8'],['Changes',file.draft===file.content?'Saved locally':'Unsaved']].map(([name,value])=><div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>:<p>Select a file in the explorer.</p>}
    <section><h3>Ask an agent</h3><p>Start a conversation in this project.</p><Link className="button button-primary button-small" to={'/app/conversations?project='+id}>Open AI workspace</Link></section>
    <h3>File tools</h3><Button size="small" onClick={()=>begin('mkdir')}>Create folder</Button>
    {file&&<><Button size="small" onClick={()=>begin('rename')}>Rename file</Button><Button size="small" onClick={()=>begin('delete')}>Delete file…</Button><Button size="small" onClick={async()=>{try{await navigator.clipboard.writeText(file.path);setCopied('Path copied.')}catch{setCopied(file.path)}}}>Copy relative path</Button></>}
    {copied&&<p role="status">{copied}</p>}
    {action&&<Dialog title={action==='mkdir'?'Create folder':action==='rename'?'Rename file':'Delete file?'} description={action==='mkdir'?'Path relative to this project':file?.path} onClose={()=>!modify.isPending&&setAction(null)} footer={<><Button disabled={modify.isPending} onClick={()=>setAction(null)}>Cancel</Button><Button variant={action==='delete'?'danger':'primary'} disabled={action!=='delete'&&!path.trim()} loading={modify.isPending} onClick={()=>modify.mutate()}>{action==='delete'?'Delete file':action==='mkdir'?'Create folder':'Rename'}</Button></>}>
    {action==='delete'?<p>The file will be removed from disk. Unsaved edits in this tab will be lost.</p>:<label>{action==='mkdir'?'Folder path':'New relative path'}<Input value={path} onChange={e=>setPath(e.target.value)} autoFocus/></label>}{modify.error&&<p role="alert">{modify.error.message}</p>}</Dialog>}
  </aside>
}

export function EditorConsole({id,changes,problems,output,onOpen}:{id:string;changes:GitChange[];problems:string[];output:string[];onOpen:(path:string)=>void}) {
  const [tab,setTab]=useState('Terminal'),[expanded,setExpanded]=useState(false),[command,setCommand]=useState('git status')
  const [transcript,setTranscript]=useState<string[]>([])
  const run=useMutation({mutationFn:()=>projects.command(id,command),onSuccess:r=>setTranscript(v=>[...v, '$ '+r.command+'\n'+r.output].slice(-12))})
  return <section className={'editor-console '+(expanded?'expanded':'')}>
    <div className="console-tabs" role="tablist">{['Terminal','Output','Problems','Git changes'].map(t=><button role="tab" aria-selected={tab===t} key={t} onClick={()=>setTab(t)}>{t}{t==='Problems'?' '+problems.length:t==='Git changes'?' '+changes.length:''}</button>)}<button className="resize-console" onClick={()=>setExpanded(!expanded)} aria-label={expanded?'Reduce panel':'Expand panel'}>{expanded?'−':'+'}</button></div>
    {tab==='Terminal'?<><form className="terminal-controls" onSubmit={e=>{e.preventDefault();run.mutate()}}><select aria-label="Project terminal command" value={command} onChange={e=>setCommand(e.target.value)}>{['git status','git log','git branch','git version','pwd','ls'].map(v=><option key={v}>{v}</option>)}</select><Button type="submit" size="small" loading={run.isPending}>Run</Button></form><pre>{transcript.length?transcript.join('\n\n'):'Select a read-only project command to inspect this workspace.'}</pre>{run.error&&<p role="alert">{run.error.message}</p>}</>:tab==='Git changes'?<div className="console-lines">{changes.length?changes.map(c=><button key={c.path} onClick={()=>onOpen(c.path)}>{c.status}　{c.path}</button>):<p>Working tree clean.</p>}</div>:tab==='Problems'?<pre>{problems.join('\n')||'No diagnostics reported for the active document.'}</pre>:<pre>{output.join('\n')||'File operations will appear here.'}</pre>}
  </section>
}

