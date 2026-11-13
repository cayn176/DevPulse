import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowRight, ArrowUpRight, BarChart3, GitBranch, LockKeyhole, Menu, ShieldCheck, Sparkles, X } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { Button, IconButton } from '../components/Primitives'
import { useTheme } from '../components/Theme'

const connectionMessages: Record<string, string> = {
  github_not_configured: 'GitHub sign-in is not configured yet. Add the OAuth credentials to the API environment.',
  github_authorization_cancelled: 'GitHub authorization was cancelled. You can connect whenever you are ready.',
  github_callback_invalid: 'The GitHub response was incomplete. Start sign-in again.',
  github_state_invalid: 'That sign-in request expired or could not be verified. Please try again.',
  github_token_exchange_failed: 'GitHub could not complete the authorization. Please try again.',
  github_connection_failed: 'DevPulse could not finish connecting to GitHub. Please try again.',
}

export function LandingPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenu, setMobileMenu] = useState(false)
  const status = searchParams.get('status')
  const error = searchParams.get('error')

  useEffect(() => {
    if (status === 'connected' || status === 'sync_partial') navigate('/app', { replace: true })
  }, [status, navigate])

  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <Brand />
        <nav className={'marketing-nav ' + (mobileMenu ? 'marketing-nav-open' : '')} aria-label="Main">
          <a href="#product" onClick={() => setMobileMenu(false)}>Product</a>
          <a href="#principles" onClick={() => setMobileMenu(false)}>Why DevPulse</a>
          <a href="#faq" onClick={() => setMobileMenu(false)}>FAQ</a>
        </nav>
        <div className="marketing-actions">
          <button className="theme-switch marketing-theme" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            <span className={'theme-switch-knob ' + (theme === 'light' ? 'is-light' : '')} />
          </button>
          <Button variant="quiet" className="marketing-login" onClick={() => { navigate('/connect') }}>Sign in</Button>
          <Button variant="primary" className="marketing-connect" onClick={() => { navigate('/connect') }}>Connect GitHub <ArrowRight size={15} /></Button>
          <IconButton className="marketing-menu" label={mobileMenu ? 'Close menu' : 'Open menu'} onClick={() => setMobileMenu((value) => !value)}>{mobileMenu ? <X size={19} /> : <Menu size={19} />}</IconButton>
        </div>
      </header>

      <main>
        <section className="hero-section" id="product">
          <div className="hero-copy">
            <motion.div className="hero-kicker" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <span className="status-pip" /> A quieter way to see your GitHub
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.05 }}>
              Your projects,<br /><span>in perspective.</span>
            </motion.h1>
            <motion.p className="hero-description" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}>
              One considered workspace for your repositories, activity, and the work behind them.
            </motion.p>
            {error && connectionMessages[error] && <div className="inline-alert" role="alert"><span>{connectionMessages[error]}</span></div>}
            <motion.div className="hero-actions" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
              <Button variant="primary" className="hero-primary" onClick={() => { navigate('/connect') }}>Continue with GitHub <ArrowRight size={16} /></Button>
              <a href="#principles" className="text-link">See how it works <ArrowDown size={14} /></a>
            </motion.div>
            <div className="permission-note"><LockKeyhole size={14} /><span>OAuth reads public data. Enable AI changes with a scoped personal token.</span></div>
          </div>

          <motion.div className="preview-wrap" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.75, delay: 0.18 }}>
            <div className="preview-glow" />
            <div className="preview-window">
              <div className="preview-chrome">
                <div className="window-dots"><i /><i /><i /></div>
                <div className="preview-address"><span /> app.devpulse.dev</div>
                <span className="preview-window-mark">DP</span>
              </div>
              <div className="preview-body">
                <aside className="preview-sidebar">
                  <div className="preview-logo"><span className="brand-mark"><svg viewBox="0 0 36 36" fill="none"><path d="M4 18h7l3.4-8 6.1 17 4.4-12 3.2 4H32" /></svg></span><b>dev<span>pulse</span></b></div>
                  <div className="preview-nav-item is-current"><span className="preview-nav-icon"><BarChart3 size={13} /></span>Overview</div>
                  <div className="preview-nav-item"><span className="preview-nav-icon"><GitBranch size={13} /></span>Repositories</div>
                  <div className="preview-nav-item"><span className="preview-nav-icon"><Sparkles size={13} /></span>Analytics</div>
                  <div className="preview-nav-item"><span className="preview-nav-icon"><ArrowUpRight size={13} /></span>Explore</div>
                </aside>
                <div className="preview-content">
                  <div className="preview-top"><div><span className="preview-overline">WORKSPACE</span><strong>Overview</strong></div><span className="preview-avatar">GH</span></div>
                  <div className="preview-welcome"><span className="preview-eyebrow">YOUR GITHUB, AT A GLANCE</span><strong>Make room for the work.</strong><small>Connect an account to see your repository data.</small></div>
                  <div className="preview-connect-row"><span className="preview-connect-icon"><GitBranch size={15} /></span><div><b>Repository workspace</b><small>Your projects, organized in one place</small></div><span className="preview-connect-state"><i /> Ready</span></div>
                  <div className="preview-connect-row"><span className="preview-connect-icon violet"><BarChart3 size={15} /></span><div><b>Real project signals</b><small>Only data retrieved from GitHub</small></div><span className="preview-connect-state">Live</span></div>
                  <div className="preview-privacy"><ShieldCheck size={13} /><span>Credentials stay on the server</span><span className="preview-privacy-line" /></div>
                </div>
              </div>
            </div>
            <div className="preview-caption"><span className="caption-dot" />The workspace begins with your account, not sample data.</div>
          </motion.div>
          <div className="hero-bottom-note"><span>01</span><i /> A workspace for the way you build</div>
        </section>

        <section className="principles-section" id="principles">
          <div className="section-intro">
            <span className="eyebrow">THE DEV PULSE</span>
            <h2>Less switching.<br /><span>More signal.</span></h2>
            <p>DevPulse brings the parts of GitHub you check every day into one clear place, with the source and limits of each metric kept in view.</p>
          </div>
          <div className="principle-list">
            <article><span className="principle-index">01</span><div><h3>Every repository, one view</h3><p>Search and sort your public projects, then keep the ones that matter close.</p></div><FolderOpenIcon /></article>
            <article><span className="principle-index">02</span><div><h3>Signals with context</h3><p>Stars and activity come from GitHub. Language counts describe repository primaries, not time spent coding.</p></div><BarChart3 size={18} /></article>
            <article><span className="principle-index">03</span><div><h3>Permissions that make sense</h3><p>OAuth uses profile access. A scoped personal token enables AI context and reviewed changes in selected repositories.</p></div><ShieldCheck size={18} /></article>
          </div>
        </section>

        <section className="faq-section" id="faq">
          <div className="eyebrow">GOOD TO KNOW</div>
          <div className="faq-grid">
            <div><h2>Clear by design.</h2><p>A workspace should tell you what it knows, how it knows it, and what it cannot see yet.</p></div>
            <div className="faq-items">
              <details><summary>Can DevPulse access my private repositories?<span>+</span></summary><p>DevPulse lists the repositories your GitHub connection can access. A fine-grained token lets you grant access to specific private repositories.</p></details>
              <details><summary>Where do the numbers come from?<span>+</span></summary><p>Repository totals and stars are calculated from the repository records fetched from GitHub. Activity uses the public events feed and reflects its limited recent coverage.</p></details>
              <details><summary>Can DevPulse change my repositories?<span>+</span></summary><p>With a token that grants write access, you can create repositories and publish reviewed AI changes as draft pull requests on new branches. Cursor Cloud tasks can push to their own branches after your confirmation.</p></details>
            </div>
          </div>
        </section>

        <section className="closing-section">
          <div className="closing-orb" />
          <span className="eyebrow">YOUR GITHUB ECOSYSTEM</span>
          <h2>See the shape of<br />your work.</h2>
          <Button variant="primary" className="hero-primary" onClick={() => { navigate('/connect') }}>Connect GitHub <ArrowRight size={16} /></Button>
        </section>
      </main>

      <footer className="marketing-footer">
        <Brand />
        <span>Built for developers who care about the details.</span>
        <div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://github.com" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} /></a></div>
        <small>© {new Date().getFullYear()} DevPulse</small>
      </footer>
    </div>
  )
}

function FolderOpenIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7.5V5.8A1.8 1.8 0 0 1 4.8 4H10l2 2h7.2A1.8 1.8 0 0 1 21 7.8v1.7" /><path d="M3 9.5h18l-2.1 8.1a1.8 1.8 0 0 1-1.7 1.4H5.1a1.8 1.8 0 0 1-1.7-1.4L2 11.7a1.8 1.8 0 0 1 1-2.2Z" /></svg>
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const title = kind === 'privacy' ? 'Privacy, plainly.' : 'Terms, in brief.'
  return (
    <div className="legal-page">
      <header className="legal-header"><Brand /><Link to="/" className="text-link">Back to DevPulse <ArrowUpRight size={14} /></Link></header>
      <main className="legal-content">
        <div className="eyebrow">DEV PULSE · {kind.toUpperCase()}</div>
        <h1>{title}</h1>
        {kind === 'privacy' ? (
          <>
            <p className="legal-lead">This early product connects to GitHub to show public profile and repository information. This page describes the current implementation and needs a full legal review before a public launch.</p>
            <h2>What DevPulse stores</h2><p>The server stores your GitHub profile, synchronized public repository metadata, your favorites and collections, encrypted GitHub and provider credentials, and the conversations and proposed changes you create in AI Studio. The browser receives an HttpOnly session cookie; it does not receive the GitHub token.</p>
            <h2>What DevPulse can read</h2><p>OAuth requests the GitHub <code>read:user</code> scope. Personal tokens grant the repository access you select. AI Studio sends attached files and recent conversation history to your chosen provider. Server API keys are never included in those prompts or returned to the browser.</p>
            <h2>Disconnecting</h2><p>Use Settings → Disconnect GitHub to remove your local DevPulse account data and attempt to revoke the GitHub authorization. If revocation cannot be confirmed, remove DevPulse in GitHub Settings → Applications.</p>
            <h2>Before public launch</h2><p>A project owner must configure a contact channel, retention terms, hosting/subprocessor details, and legally reviewed privacy notices before inviting public users.</p>
          </>
        ) : (
          <>
            <p className="legal-lead">DevPulse is an early development project. These notes are not a substitute for finalized terms of service.</p>
            <h2>Use of GitHub data</h2><p>DevPulse reads public GitHub profile, repository, and activity information to display a private workspace. AI Studio can create repositories and publish approved changes with the permissions granted by your GitHub token. Provider usage follows your provider account.</p>
            <h2>Availability</h2><p>The application is provided during development without a production availability promise. GitHub data is subject to GitHub API availability, permissions, and rate limits.</p>
            <h2>License</h2><p>No project license has been selected. The project owner must choose a license before authorizing redistribution or contributions.</p>
            <h2>Before public launch</h2><p>Terms, contact details, service limits, and governing law require review and selection by the project owner.</p>
          </>
        )}
      </main>
      <footer className="legal-footer"><span>Early product copy · review before public release</span><Link to="/">DevPulse home</Link></footer>
    </div>
  )
}
