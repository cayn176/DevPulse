import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Activity, ArrowUpRight, BarChart3, ChevronDown, ChevronLeft, ChevronRight,
  Command, Compass, FolderHeart, FolderOpen, LayoutDashboard, LogOut, Menu,
  Moon, Search, Settings2, Star, Sun, X, Sparkles, Cable,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { Brand } from './Brand'
import { IconButton, Input } from './Primitives'
import { useTheme } from './Theme'
import { useToast } from './Toast'

const primaryLinks = [
  { label: 'AI Studio', to: '/app/ai', icon: Sparkles },
  { label: 'Integrations', to: '/app/integrations', icon: Cable },
  { label: 'Overview', to: '/app', icon: LayoutDashboard, end: true },
  { label: 'Repositories', to: '/app/repositories', icon: FolderOpen },
  { label: 'Analytics', to: '/app/analytics', icon: BarChart3 },
  { label: 'Activity', to: '/app/activity', icon: Activity },
  { label: 'Explore', to: '/app/explore', icon: Compass },
]

const pageTitles: Record<string, string> = {
  '/app/ai': 'AI Studio',
  '/app/integrations': 'Integrations',
  '/app': 'Overview',
  '/app/repositories': 'Repositories',
  '/app/analytics': 'Analytics',
  '/app/activity': 'Activity',
  '/app/explore': 'Explore',
  '/app/collections': 'Collections',
  '/app/settings': 'Settings',
}

export function WorkspaceLayout({ user }: { user: User }) {
  const location = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const showToast = useToast()
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('devpulse-sidebar-collapsed') === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const collections = useQuery({ queryKey: ['collections'], queryFn: api.collections })

  useEffect(() => {
    localStorage.setItem('devpulse-sidebar-collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((value) => !value)
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setAccountOpen(false)
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await client.clear()
      navigate('/', { replace: true })
    },
    onError: () => showToast('Could not end this session. Try again.', 'error'),
  })

  const title = useMemo(() => {
    if (location.pathname.startsWith('/app/repositories/')) return 'Repository'
    if (/^\/app\/collections\/[^/]+$/.test(location.pathname)) return 'Collection'
    return pageTitles[location.pathname] || 'DevPulse'
  }, [location.pathname])

  const goToSearch = (value: string) => {
    const query = value.trim()
    setCommandOpen(false)
    setSearchText('')
    navigate(query ? '/app/repositories?q=' + encodeURIComponent(query) : '/app/repositories')
  }

  return (
    <div className={'app-shell ' + (collapsed ? 'sidebar-collapsed' : '')}>
      {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={'sidebar ' + (mobileOpen ? 'sidebar-mobile-open' : '')} aria-label="Main navigation">
        <div className="sidebar-top">
          <Brand compact={collapsed} />
          <IconButton className="sidebar-collapse" label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}>
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </IconButton>
          <IconButton className="sidebar-mobile-close" label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></IconButton>
        </div>

        <button className="workspace-switcher" onClick={() => setAccountOpen((value) => !value)} title={user.login}>
          {user.avatar_url ? <img className="avatar avatar-small" src={user.avatar_url} alt="" /> : <span className="avatar avatar-small avatar-fallback">{user.login.slice(0, 1).toUpperCase()}</span>}
          <span className="workspace-switcher-text"><strong>{user.name || user.login}</strong><small>Personal workspace</small></span>
          <ChevronDown size={14} className="workspace-chevron" />
        </button>

        <div className="nav-scroll">
          <div className="nav-section-label">{!collapsed && 'Workspace'}</div>
          <nav className="nav-group">
            {primaryLinks.map(({ label, to, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => 'nav-link ' + (isActive ? 'nav-active' : '')} title={collapsed ? label : undefined} onClick={() => setMobileOpen(false)}>
                <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
                {label === 'Repositories' && <span className="nav-count">{user.repository_count}</span>}
              </NavLink>
            ))}
          </nav>

          <div className="nav-divider" />
          <div className="nav-section-label nav-section-row">
            {!collapsed && <span>Organize</span>}
            {!collapsed && <Link to="/app/collections" className="nav-add" aria-label="View collections">+</Link>}
          </div>
          <nav className="nav-group">
            <NavLink to="/app/repositories?favorite=true" className={({ isActive }) => 'nav-link ' + (location.pathname === '/app/repositories' && new URLSearchParams(location.search).get('favorite') === 'true' ? 'nav-active' : isActive && location.pathname !== '/app/repositories' ? 'nav-active' : '')} title={collapsed ? 'Favorites' : undefined} onClick={() => setMobileOpen(false)}>
              <Star size={17} strokeWidth={1.8} /><span>Favorites</span>
            </NavLink>
            <NavLink to="/app/collections" className={({ isActive }) => 'nav-link ' + (isActive ? 'nav-active' : '')} title={collapsed ? 'Collections' : undefined} onClick={() => setMobileOpen(false)}>
              <FolderHeart size={17} strokeWidth={1.8} /><span>Collections</span>
            </NavLink>
            {!collapsed && collections.data?.slice(0, 3).map((collection) => (
              <NavLink key={collection.id} to={'/app/collections/' + collection.id} className={({ isActive }) => 'nav-link nav-link-subtle ' + (isActive ? 'nav-active' : '')} onClick={() => setMobileOpen(false)}>
                <span className={'collection-dot dot-' + collection.color} /><span>{collection.name}</span><small>{collection.repository_count}</small>
              </NavLink>
            ))}
          </nav>

          {!collapsed && <div className="nav-divider" />}
          <div className="nav-group nav-bottom-links">
            <NavLink to="/app/settings" className={({ isActive }) => 'nav-link ' + (isActive ? 'nav-active' : '')} title={collapsed ? 'Settings' : undefined} onClick={() => setMobileOpen(false)}>
              <Settings2 size={17} strokeWidth={1.8} /><span>Settings</span>
            </NavLink>
          </div>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-account">
            {user.avatar_url ? <img className="avatar" src={user.avatar_url} alt="" /> : <span className="avatar avatar-fallback">{user.login.slice(0, 1).toUpperCase()}</span>}
            <div className="account-text"><strong>{user.login}</strong><span>Connected on GitHub</span></div>
            <button className="icon-button account-menu-trigger" aria-label="Account menu" onClick={() => setAccountOpen((value) => !value)}><ChevronDown size={15} /></button>
          </div>
          {accountOpen && (
            <div className="account-popover" role="menu">
              <Link to="/app/settings" role="menuitem" onClick={() => setAccountOpen(false)}><Settings2 size={15} />Account settings</Link>
              <button role="menuitem" onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={15} />Sign out</button>
            </div>
          )}
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <IconButton className="mobile-menu-button" label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={18} /></IconButton>
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <button className="global-search-trigger" onClick={() => setCommandOpen(true)} aria-label="Search or navigate">
              <Search size={15} /><span>Search your workspace</span><kbd>⌘ K</kbd>
            </button>
            <IconButton label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</IconButton>
            <a className="top-github-link" href={'https://github.com/' + user.login} target="_blank" rel="noreferrer" aria-label="Open GitHub profile"><ArrowUpRight size={17} /></a>
          </div>
        </header>

        <main className="page-content" id="main-content">
          <Outlet context={{ user }} />
        </main>
      </div>

      <AnimatePresence>
        {commandOpen && (
          <motion.div className="command-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false) }}>
            <motion.div className="command-panel" role="dialog" aria-modal="true" aria-label="Search workspace" initial={{ opacity: 0, y: -10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}>
              <form className="command-search" onSubmit={(event) => { event.preventDefault(); goToSearch(searchText) }}>
                <Search size={18} />
                <Input autoFocus placeholder="Search repositories or jump to a page…" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
                <kbd>ESC</kbd>
              </form>
              <div className="command-body">
                <div className="command-label">Quick navigation</div>
                {[...primaryLinks.slice(0, 5)].map(({ label, to, icon: Icon }) => <button key={to} onClick={() => { setCommandOpen(false); navigate(to) }}><Icon size={16} /><span>{label}</span><ArrowUpRight size={14} /></button>)}
                <button onClick={() => { setCommandOpen(false); navigate('/app/settings') }}><Settings2 size={16} /><span>Settings</span><ArrowUpRight size={14} /></button>
              </div>
              <div className="command-hint"><Command size={13} /> Enter a repository name to search across your projects.</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
