import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Check, KeyRound, RefreshCw, ShieldCheck, SunMoon, Trash2, Unplug } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { Button, Dialog, PageHeading, Panel } from '../components/Primitives'
import { useTheme } from '../components/Theme'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import type { User } from '../lib/types'
import { formatDate, relativeDate } from '../lib/format'
import { useState } from 'react'

export function SettingsPage() {
  const { user } = useOutletContext<{ user: User }>()
  const { theme, toggleTheme } = useTheme()
  const client = useQueryClient()
  const navigate = useNavigate()
  const showToast = useToast()
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const sync = useMutation({
    mutationFn: api.sync,
    onSuccess: async (result) => {
      await Promise.all([client.invalidateQueries({ queryKey: ['overview'] }), client.invalidateQueries({ queryKey: ['repositories'] }), client.invalidateQueries({ queryKey: ['me'] })])
      showToast('Synchronized ' + result.repository_count + ' repositories')
    },
    onError: () => showToast('GitHub sync failed. Try again later.', 'error'),
  })
  const disconnect = useMutation({
    mutationFn: api.disconnect,
    onSuccess: async (result) => {
      await client.clear()
      showToast(result.github_revocation_failed ? 'Local data was removed. Review GitHub Settings → Applications or Personal access tokens to revoke the saved credential.' : 'GitHub disconnected and local account data removed.')
      navigate('/', { replace: true })
    },
    onError: () => showToast('Could not disconnect this account. Try again.', 'error'),
  })

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeading eyebrow="WORKSPACE PREFERENCES" title="Settings" description="Manage your DevPulse workspace and GitHub connection." />
      <nav className="settings-sections" aria-label="Settings sections">{[['Appearance','appearance'],['Agents','agents'],['AI providers','providers'],['Models','models'],['Connections','integrations'],['Security','security'],['Help','help'],['About','about']].map(([name,path])=><Link key={path} to={'/app/'+path}>{name} →</Link>)}</nav>
      <Panel className="settings-panel">
        <div className="settings-section-heading"><span className="settings-icon"><SunMoon size={17} /></span><div><h2>Appearance</h2><p>Choose the theme for this browser.</p></div></div>
        <div className="settings-row">
          <div><strong>Color theme</strong><small>Your selection is saved on this device.</small></div>
          <div className="theme-choice-group" role="group" aria-label="Color theme">
            <button className={theme === 'dark' ? 'is-selected' : ''} onClick={() => theme !== 'dark' && toggleTheme()} aria-pressed={theme === 'dark'}>Dark</button>
            <button className={theme === 'light' ? 'is-selected' : ''} onClick={() => theme !== 'light' && toggleTheme()} aria-pressed={theme === 'light'}>Light</button>
          </div>
        </div>
      </Panel>
      <Panel className="settings-panel">
        <div className="settings-section-heading"><span className="settings-icon"><KeyRound size={17} /></span><div><h2>GitHub connection</h2><p>Public profile and repository data currently connected to DevPulse.</p></div></div>
        <div className="connected-account-row">
          {user.avatar_url ? <img className="avatar settings-avatar" src={user.avatar_url} alt="" /> : <span className="avatar settings-avatar avatar-fallback">{user.login.slice(0, 1).toUpperCase()}</span>}
          <div><strong>{user.name || user.login}</strong><small><a href={'https://github.com/' + user.login} target="_blank" rel="noreferrer">@{user.login} <ArrowUpRight size={12} /></a></small></div>
          <span className="connected-pill"><i />Connected</span>
        </div>
        <div className="settings-row">
          <div><strong>Access granted</strong><small>OAuth reads your profile. Personal tokens use the repository permissions selected on GitHub.</small></div>
          <code className="scope-chip">{user.scopes.length ? user.scopes.join(', ') : 'public access'}</code>
        </div>
        <div className="settings-row">
          <div><strong>Repositories in this workspace</strong><small>Repositories accessible with your GitHub permissions</small></div>
          <span className="settings-value">{user.repository_count}</span>
        </div>
        <div className="settings-row">
          <div><strong>Last synchronization</strong><small>{user.synced_at ? formatDate(user.synced_at) + ' · ' + relativeDate(user.synced_at) : 'No successful synchronization yet'}</small></div>
          <Button size="small" variant="secondary" icon={<RefreshCw size={14} />} loading={sync.isPending} onClick={() => sync.mutate()}>Sync now</Button>
        </div>
        <div className="permission-callout"><ShieldCheck size={15} /><span>DevPulse synchronizes public and private repositories permitted by your GitHub connection. To change access, update the token permissions and sync again.</span></div>
      </Panel>
      <Panel className="settings-panel settings-danger-panel">
        <div className="settings-section-heading"><span className="settings-icon settings-danger-icon"><Unplug size={17} /></span><div><h2>Disconnect GitHub</h2><p>Remove the connected account and all locally stored DevPulse data.</p></div></div>
        <div className="settings-danger-row"><p>This removes your profile, synchronized repository cache, favorites, collections, sessions, AI conversations, provider keys, and encrypted GitHub token from DevPulse. Your repositories on GitHub are not changed.</p><Button variant="danger" icon={<Trash2 size={14} />} onClick={() => setDisconnectOpen(true)}>Disconnect and delete data</Button></div>
      </Panel>
      <p className="settings-footnote"><Check size={14} />GitHub credentials are handled by the DevPulse server, not stored in browser local storage.</p>
      <AnimatePresence>
        {disconnectOpen && <Dialog title="Disconnect GitHub and delete your data?" description="This removes the DevPulse account and local workspace records. Your GitHub repositories will remain unchanged." onClose={() => setDisconnectOpen(false)} footer={<><Button variant="quiet" onClick={() => setDisconnectOpen(false)}>Keep account</Button><Button variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>Disconnect and delete</Button></>}>
          <p className="dialog-body-copy">DevPulse will also ask GitHub to revoke its authorization. If GitHub does not confirm revocation, you can remove the app from GitHub Settings → Applications.</p>
        </Dialog>}
      </AnimatePresence>
    </motion.div>
  )
}
