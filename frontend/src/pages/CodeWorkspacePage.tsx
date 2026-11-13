import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import Editor, { DiffEditor, loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker.js?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker'
import CssWorker from 'monaco-editor/language/css/css.worker.js?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker.js?worker'
import { ChevronDown, ChevronRight, FileCode, Folder, GitBranch, Plus, Save, Search, X } from 'lucide-react'
import { Button, Dialog, EmptyPanel, Input, PageHeading } from '../components/Primitives'
import { FileInspector, EditorConsole } from '../components/ProjectInspector'
import '../styles/development.css'
import { useTheme } from '../components/Theme'
import { projects, type ProjectFile } from '../lib/projects'

;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: (_: string, label: string) => label === 'json' ? new JsonWorker() : ['typescript', 'javascript'].includes(label) ? new TsWorker() : ['css', 'scss', 'less'].includes(label) ? new CssWorker() : ['html', 'handlebars', 'razor'].includes(label) ? new HtmlWorker() : new EditorWorker() }
loader.config({ monaco })
type OpenFile = ProjectFile & { draft: string }
const languages: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', json: 'json', css: 'css', html: 'html', py: 'python', rs: 'rust', go: 'go', md: 'markdown', yml: 'yaml', yaml: 'yaml', sql: 'sql', sh: 'shell', ps1: 'powershell', toml: 'ini' }
const languageFor = (path: string) => languages[path.split('.').at(-1) || ''] || 'plaintext'

function Directory({ id, path = '', depth = 0, onOpen }: { id: string; path?: string; depth?: number; onOpen: (path: string) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const query = useQuery({ queryKey: ['project-tree', id, path], queryFn: () => projects.tree(id, path) })
  return <div>{query.data?.items.map(item => <div key={item.path}><button className="explorer-row" style={{ paddingLeft: 12 + depth * 13 }} onClick={() => item.directory ? setExpanded(value => ({ ...value, [item.path]: !value[item.path] })) : onOpen(item.path)}>{item.directory ? <>{expanded[item.path] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={14} /></> : <><span className="explorer-indent" /><FileCode size={14} /></>}<span>{item.name}</span></button>{item.directory && expanded[item.path] && <Directory id={id} path={item.path} depth={depth + 1} onOpen={onOpen} />}</div>)}{query.isError && <p className="project-inline-error">{query.error.message}</p>}{query.data?.limited && <p className="project-inline-error">Directory limited to 1,000 entries.</p>}</div>
}

export function CodeWorkspacePage() {
  const [params]=useSearchParams()
  return <ProjectEditor key={params.get('project')||''}/>
}
function ProjectEditor() {
  const [params, setParams] = useSearchParams()
  const id = params.get('project') || ''
  const editor=useRef<monaco.editor.IStandaloneCodeEditor|null>(null)
  const initialFile=useRef(params.get('file') || '')
  const [output,setOutput]=useState<string[]>([])
  const [problems,setProblems]=useState<string[]>([])
  function log(message:string){setOutput(lines=>[...lines,new Date().toLocaleTimeString()+'  '+message].slice(-80))}
  const [files, setFiles] = useState<OpenFile[]>([])
  const [active, setActive] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [newFile, setNewFile] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [closeDirty, setCloseDirty] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)
  const client = useQueryClient()
  const { theme } = useTheme()
  const all = useQuery({ queryKey: ['local-projects'], queryFn: () => projects.list() })
  const project = useQuery({ queryKey: ['local-project', id], queryFn: () => projects.get(id), enabled: !!id })
  const git = useQuery({ queryKey: ['project-git', id], queryFn: () => projects.git(id), enabled: !!id })
  const matches = useQuery({ queryKey: ['project-search', id, searchTerm], queryFn: () => projects.search(id, searchTerm), enabled: !!id && !!searchTerm })
  const current = files.find(file => file.path === active)
  const changed = files.some(file => file.content !== file.draft)
  const diff = useQuery({ queryKey: ['project-diff', id, active], queryFn: () => projects.diff(id, active), enabled: !!id && !!active && showDiff })
  const save = useMutation({ mutationFn: () => projects.write(id, current!.path, current!.draft, current!.hash), onSuccess: async value => { setFiles(rows => rows.map(row => row.path === value.path ? { ...value, draft: row.draft===current?.draft ? value.content : row.draft } : row)); log('Saved '+value.path); await client.invalidateQueries({ queryKey: ['project-git', id] }) } })
  const create = useMutation({ mutationFn: () => projects.write(id, newPath, '', null), onSuccess: async value => { setFiles(rows => [...rows, { ...value, draft: value.content }]); setActive(value.path); setNewFile(false); setNewPath(''); await client.invalidateQueries({ queryKey: ['project-tree', id] }) } })
  const vscode = useMutation({ mutationFn: () => projects.vscode(id) })
  async function open(path: string) { setError(''); setShowDiff(false); if (files.some(f => f.path === path)) { setActive(path); return } try { const value = await projects.read(id, path); setFiles(rows => [...rows.filter(row => row.path !== path), { ...value, draft: value.content }]); setActive(path) } catch (err) { setError((err as Error).message) } }
  useEffect(()=>{
    if(id && initialFile.current) {const path=initialFile.current;initialFile.current='';void open(path)}
  },[id])
  useEffect(()=>{
    const model=()=>editor.current?.getModel()
    const refresh=()=>{const doc=model();setProblems(doc?monaco.editor.getModelMarkers({resource:doc.uri}).map(m=>m.startLineNumber+':'+m.startColumn+'  '+m.message):[])}
    const sub=monaco.editor.onDidChangeMarkers(refresh)
    refresh()
    return ()=>sub.dispose()
  },[active])
  useEffect(()=>{
    if(!changed)return
    const beforeNavigation=(e:MouseEvent)=>{
      const link=e.target instanceof Element?e.target.closest('a[href]'):null
      if(link && !e.ctrlKey && !e.metaKey && link.getAttribute('target')!=='_blank' && !window.confirm('Leave the editor and discard unsaved changes?')){e.preventDefault();e.stopPropagation()}
    }
    document.addEventListener('click',beforeNavigation,true)
    return ()=>document.removeEventListener('click',beforeNavigation,true)
  },[changed])
  async function changedFile(action:'mkdir'|'rename'|'delete',path:string){
    if(action==='delete' && current) close(current.path)
    if(action==='rename' && current){setFiles(rows=>rows.map(f=>f.path===current.path?{...f,path}:f));setActive(path)}
    log(action+' '+path)
    await Promise.all([client.invalidateQueries({queryKey:['project-tree',id]}),client.invalidateQueries({queryKey:['project-git',id]}),client.invalidateQueries({queryKey:['project-search',id]})])
  }
  function close(path: string) { setFiles(rows => rows.filter(row => row.path !== path)); if (active === path) setActive(files.find(f => f.path !== path)?.path || ''); setCloseDirty(null) }
  useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (changed) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler) }, [changed])
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (current && !save.isPending && current.draft !== current.content) save.mutate() } }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler) }, [current, save])
  if (!id) return <div className="page-stack"><PageHeading eyebrow="DEVELOPMENT" title="Code Workspace" description="Choose a project to explore files, edit code and review changes." /><div className="project-picker-list">{all.data?.map(row => <button key={row.id} onClick={() => setParams({ project: row.id })}><Folder size={18} /><span><strong>{row.name}</strong><small>{row.path}</small></span><ChevronRight size={16} /></button>)}</div>{!all.data?.length && <EmptyPanel title="Open a project first" detail="The editor reads only registered project folders." action={<Link className="button button-primary button-normal" to="/app/projects">Open projects</Link>} />}</div>
  return <div className="code-workspace"><div className="code-heading"><div><span className="eyebrow">CODE WORKSPACE</span><h1>Code Workspace</h1><small>{project.data?.name || 'Project'}　<GitBranch size={12} />{git.data?.branch || 'No Git repository'} · {project.data?.framework || 'Local files'}</small></div><div className="project-actions"><Link className="button button-secondary button-small" to={'/app/git?project=' + id}>Version control</Link><Button size="small" onClick={() => vscode.mutate()}>Open in VS Code</Button><Button size="small" variant="primary" disabled={!current || current.content === current.draft} loading={save.isPending} onClick={() => save.mutate()}><Save size={13} />Save</Button></div></div>
    {(error || project.error || save.error || vscode.error) && <p className="inline-alert" role="alert">{error || project.error?.message || save.error?.message || vscode.error?.message}</p>}
    <div className="code-layout"><aside className="code-explorer"><div className="explorer-heading"><span>EXPLORER</span><button aria-label="Create file" onClick={() => { create.reset(); setNewFile(true) }}><Plus size={15} /></button></div><form className="explorer-search" onSubmit={event => { event.preventDefault(); setSearchTerm(search.trim()) }}><Search size={13} /><input aria-label="Search file contents" placeholder="Find in project…" value={search} onChange={e => { setSearch(e.target.value); if (!e.target.value) setSearchTerm('') }} /></form>{searchTerm ? <div className="project-search-results"><Button size="small" variant="quiet" onClick={() => { setSearch(''); setSearchTerm('') }}>Clear search</Button>{matches.data?.matches.map((match, index) => <button key={index} onClick={() => open(match.path)}><strong>{match.path}:{match.line}</strong><span>{match.text}</span></button>)}{matches.data?.matches.length === 0 && <p>No matches.</p>}{matches.data?.limited && <p>Showing a bounded result set.</p>}{matches.isError && <p>{matches.error.message}</p>}</div> : <Directory id={id} onOpen={open} />}</aside>
    <section className="code-editor"><div className="editor-upper"><div className="editor-tabs">{files.map(file => <div key={file.path} className={file.path === active ? 'active' : ''}><button onClick={() => { setActive(file.path); setShowDiff(false) }} title={file.path}>{file.path.split('/').at(-1)}{file.content !== file.draft && <span className="dirty-dot" />}</button><button aria-label={'Close ' + file.path} onClick={() => file.content !== file.draft ? setCloseDirty(file.path) : close(file.path)}><X size={12} /></button></div>)}</div>{current ? <><div className="editor-breadcrumb"><span>{current.path}</span><button onClick={() => setShowDiff(value => !value)}>{showDiff ? 'Edit file' : 'Compare with HEAD'}</button></div><div className="monaco-container">{showDiff ? diff.isError ? <p className="project-inline-error">{diff.error.message}</p> : <DiffEditor height="100%" language={languageFor(active)} theme={theme === 'dark' ? 'vs-dark' : 'light'} original={diff.data?.original || ''} modified={current.draft} options={{ readOnly: true, minimap: { enabled: false }, renderSideBySide: true, fontSize: 13 }} /> : <Editor height="100%" onMount={instance=>{editor.current=instance}} path={id + '/' + current.path} language={languageFor(current.path)} theme={theme === 'dark' ? 'vs-dark' : 'light'} value={current.draft} onChange={value => setFiles(rows => rows.map(row => row.path === active ? { ...row, draft: value || '' } : row))} options={{ minimap: { enabled: false }, fontSize: 13, fontFamily: 'Consolas, monospace', padding: { top: 16 }, automaticLayout: true, scrollBeyondLastLine: false }} />}</div></> : <EmptyPanel title="Your code, in focus" detail="Select a file from the explorer. Use Ctrl+S to save, and compare changes with Git HEAD before committing." />}</div><EditorConsole id={id} changes={git.data?.changes||[]} problems={problems} output={output} onOpen={open}/></section><FileInspector id={id} file={current} language={languageFor(active)} change={git.data?.changes.find(c=>c.path===active)} onFileChange={changedFile}/></div><div className="editor-status"><span>{files.filter(f => f.content !== f.draft).length} unsaved files</span><span>UTF-8 · Project-scoped access · Secrets excluded</span></div>
    {newFile && <Dialog title="Create a file" description="Use a path relative to this project. Existing files will not be overwritten." onClose={() => setNewFile(false)} footer={<><Button onClick={() => setNewFile(false)}>Cancel</Button><Button variant="primary" disabled={!newPath.trim()} loading={create.isPending} onClick={() => create.mutate()}>Create file</Button></>}><label className="project-form">File path<Input value={newPath} onChange={e => setNewPath(e.target.value)} placeholder="src/new-file.ts" /></label>{create.isError && <p className="inline-alert">{create.error.message}</p>}</Dialog>}
    {closeDirty && <Dialog title="Discard unsaved edits?" description={closeDirty} onClose={() => setCloseDirty(null)} footer={<><Button onClick={() => setCloseDirty(null)}>Keep editing</Button><Button variant="danger" onClick={() => close(closeDirty)}>Discard edits and close</Button></>}><p>The file on disk will remain unchanged. Only unsaved editor changes will be discarded.</p></Dialog>}
  </div>
}
