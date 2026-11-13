import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, Bot, Boxes, Cable, ChevronLeft, ChevronRight, Code2, Command, FolderOpen, GitBranch, Home, Layers, LogOut, Menu, Moon, Search, Settings2, Shield, Sparkles, Sun, X, CloudUpload, BookOpen, CheckSquare, ChartNoAxesCombined, Workflow, History, LayoutGrid, Bell, ChevronsUpDown, ChevronDown, Plus } from 'lucide-react'
import { useTheme } from './Theme'
import { Brand } from './Brand'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { useQueryClient } from '@tanstack/react-query'

const groups = [
  { title: 'HOME', links: [{ label: 'Overview', path: '/app', icon: Home }, { label: 'Activity Center', path: '/app/workspace-activity', icon: Activity }] },
  { title: 'AI WORKSPACE', links: [{ label: 'Agents', path: '/app/agents', icon: Bot }, { label: 'Conversations', path: '/app/conversations', icon: Command }, { label: 'Agent Sessions', path: '/app/sessions', icon: Layers }, { label: 'Models', path: '/app/models', icon: Boxes }] },
  { title: 'DEVELOPMENT', links: [{ label: 'Projects', path: '/app/projects', icon: FolderOpen }, { label: 'Code Workspace', path: '/app/code', icon: Code2 }, { label: 'Repositories', path: '/app/repositories', icon: GitBranch }, { label: 'Git & Version Control', path: '/app/git', icon: GitBranch }] },
  { title: 'DEVPULSE', links: [{ label: 'DevPulse AI', path: '/app/assistant', icon: Sparkles }, { label: 'Tasks', path: '/app/tasks', icon: CheckSquare }, { label: 'Automation', path: '/app/automation', icon: Workflow }, { label: 'Activity', path: '/app/activity', icon: Activity }] },
  { title: 'DEPLOYMENT', links: [{ label: 'Deployment Center', path: '/app/deployments', icon: CloudUpload }, { label: 'Environments', path: '/app/environments', icon: Boxes }, { label: 'Deployment History', path: '/app/deployment-history', icon: History }] },
  { title: 'INTEGRATIONS', links: [{ label: 'Connected Apps', path: '/app/connected-apps', icon: Cable }, { label: 'Integration Manager', path: '/app/integrations', icon: LayoutGrid }, { label: 'Integration Guides', path: '/app/guides', icon: BookOpen }] },
  { title: 'INSIGHTS', links: [{ label: 'Repository Analytics', path: '/app/analytics', icon: ChartNoAxesCombined }, { label: 'Development Analytics', path: '/app/development-analytics', icon: Activity }] },
  { title: 'SYSTEM', links: [{ label: 'General', path: '/app/settings', icon: Settings2 }, { label: 'Appearance', path: '/app/appearance', icon: Sun }, { label: 'AI Providers', path: '/app/providers', icon: Cable }, { label: 'Security', path: '/app/security', icon: Shield }, { label: 'Help & Documentation', path: '/app/help', icon: BookOpen }, { label: 'About', path: '/app/about', icon: Command }] },
]

export function NativeWorkspaceLayout({ user }: { user: User }) {
  const { theme, toggleTheme } = useTheme()
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [quick, setQuick] = useState(false)
  const [collapsed, setCollapsed] = useState(()=>localStorage.getItem('dp-rail')==='compact')
  useEffect(()=>{localStorage.setItem('dp-rail',collapsed?'compact':'expanded');document.documentElement.dataset.rail=collapsed?'compact':'expanded'},[collapsed])
  const [mobile, setMobile] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  const [error, setError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const cache = useQueryClient()
  const links = groups.flatMap(g => g.links)
  const title = links.find(item => item.path === location.pathname)?.label || 'Workspace'
  useEffect(() => { const handle = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearch(value => value === null ? '' : null) } if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setQuick(true) } if (e.key === 'Escape') { setSearch(null); setMobile(false); setQuick(false) } }; window.addEventListener('keydown', handle); return () => window.removeEventListener('keydown', handle) }, [])
  return <div className={'app-shell native-shell ' + (collapsed ? 'sidebar-collapsed' : '')}>
    {mobile && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside className={'sidebar ' + (mobile ? 'sidebar-mobile-open' : '')}><div className="sidebar-top"><Brand compact={collapsed} /><button className="icon-button sidebar-collapse" aria-label="Toggle sidebar" onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button></div>
      {!collapsed && <Link className="native-workspace-label" to="/app/projects"><span>{user.login === 'local' ? 'Personal workspace' : user.login + ' workspace'}</span><ChevronsUpDown size={13}/></Link>}
      <div className="nav-scroll">{groups.map(group => <div key={group.title}><button className="nav-section-label" aria-expanded={!hidden[group.title] || collapsed} onClick={()=>setHidden(current=>({...current,[group.title]:!current[group.title]}))}>{collapsed ? '·' : group.title}{!collapsed&&<ChevronDown size={12} style={{transform:hidden[group.title]?'rotate(-90deg)':''}}/>}</button><nav className="nav-group" style={{display:hidden[group.title]&&!collapsed?'none':undefined}}> {group.links.map(({ path, label, icon: Icon }) => <NavLink to={path} end key={path} title={label} onClick={() => setMobile(false)} className={({ isActive }) => 'nav-link ' + (isActive ? 'nav-active' : '')}><Icon size={16} strokeWidth={1.6} /><span>{label}</span></NavLink>)}</nav></div>)}</div>
      <div className="sidebar-footer"><button className="quick-create" onClick={()=>setQuick(true)}><Plus size={15}/>{!collapsed&&<>Quick create <kbd>Ctrl N</kbd></>}</button><div className="native-account"><span className="avatar avatar-fallback">{user.login.slice(0,1).toUpperCase()}</span>{!collapsed && <div><strong>{user.name || user.login}</strong><small>{user.login === 'local' ? 'Local session' : 'GitHub account'}</small></div>}<button className="icon-button" title="Sign out" onClick={async () => { try { await api.logout(); cache.clear(); navigate('/connect') } catch { setError('Could not sign out.') } }}><LogOut size={15} /></button></div>{error && <small role="alert">{error}</small>}</div>
    </aside>
    <div className="main-column"><header className="topbar"><div className="topbar-title"><button className="icon-button mobile-menu-button" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={18} /></button><button className="icon-button desktop-toggle" aria-label="Toggle navigation" onClick={()=>setCollapsed(!collapsed)}><LayoutGrid size={16}/></button><span className="breadcrumb-root">{user.login==='local'?'Personal workspace':user.login}</span><span className="breadcrumb-separator">/</span><span>{title}</span></div><div className="topbar-actions"><button className="global-search-trigger" onClick={() => setSearch('')}><Search size={14} /><span>Search workspace…</span><kbd>Ctrl K</kbd></button><button className="icon-button" aria-label="Toggle theme" onClick={toggleTheme}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button><span className="workspace-badge">{user.login==='local'?'LOCAL WORKSPACE': 'GITHUB WORKSPACE'}</span><Link className="icon-button" aria-label="Activity center" to="/app/workspace-activity"><Bell size={16}/></Link></div></header><main className="page-content" id="main-content"><Outlet context={{ user }} /></main><footer className="native-footnote"><span>●　{user.login==='local'?'Local workspace':user.login}</span><span>DevPulse / 0.3.0</span></footer></div>
    {quick && <div className="command-backdrop" onClick={()=>setQuick(false)}><section className="command-panel" role="dialog" aria-label="Quick create"><div className="command-search"><strong>Quick create</strong></div><div className="command-body">{[['Project','projects'],['Conversation','conversations'],['Workflow','automation'],['Task','tasks']].map(([name,path])=><button key={path} onClick={()=>{setQuick(false);navigate('/app/'+path)}}><Plus size={15}/>{name}</button>)}</div></section></div>}
    {search !== null && <div className="command-backdrop" onClick={() => setSearch(null)}><section className="command-panel" role="dialog" aria-label="Workspace navigation" onClick={e => e.stopPropagation()}><div className="command-search"><Search size={18} /><input autoFocus aria-label="Search navigation" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a workspace, tool or setting…" /><button className="icon-button" onClick={() => setSearch(null)} aria-label="Close"><X size={16} /></button></div><div className="command-body">{links.filter(link => link.label.toLowerCase().includes(search.toLowerCase())).map(link => <button key={link.path} onClick={() => { setSearch(null); navigate(link.path) }}><link.icon size={16} />{link.label}</button>)}</div></section></div>}
  </div>
}

