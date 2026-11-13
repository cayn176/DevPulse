import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, GitFork, FolderGit2, RefreshCw, Star, StarHalf } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ActivityFeed } from '../components/ActivityFeed'
import { RepositoryCard } from '../components/RepositoryCard'
import { Button, EmptyPanel, ErrorPanel, LoadingPanel, PageHeading, Panel, SectionTitle } from '../components/Primitives'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { formatNumber, relativeDate } from '../lib/format'

export function OverviewPage() {
  const client = useQueryClient()
  const showToast = useToast()
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const activity = useQuery({ queryKey: ['activity'], queryFn: api.activity, staleTime: 60_000 })
  const sync = useMutation({
    mutationFn: api.sync,
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['overview'] }),
        client.invalidateQueries({ queryKey: ['repositories'] }),
        client.invalidateQueries({ queryKey: ['me'] }),
      ])
      showToast('Synced ' + result.repository_count + ' repositories')
    },
    onError: () => showToast('Sync could not finish. Your last saved data is still available.', 'error'),
  })

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <PageHeading
        eyebrow={new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}
        title="Your workspace, at a glance."
        description="A clear view of the public projects connected to your GitHub account."
        action={<Button icon={<RefreshCw size={15} />} loading={sync.isPending} onClick={() => sync.mutate()}>Sync data</Button>}
      />

      {overview.isPending ? <LoadingPanel /> : overview.isError ? <ErrorPanel detail={overview.error.message} onRetry={() => void overview.refetch()} /> : (
        <>
          <div className="metrics-grid">
            <MetricCard label="Repositories" value={overview.data.total_repositories} hint="Repositories accessible to your account" icon={<FolderGit2 size={17} />} accent="violet" />
            <MetricCard label="Stars received" value={overview.data.total_stars} hint="Across your synchronized projects" icon={<Star size={17} />} accent="amber" />
            <MetricCard label="Forks" value={overview.data.total_forks} hint="GitHub reported forks across projects" icon={<GitFork size={17} />} accent="blue" />
            <MetricCard label="Favorites" value={overview.data.favorites} hint="Saved in your DevPulse workspace" icon={<StarHalf size={17} />} accent="green" />
          </div>

          <div className="overview-grid">
            <Panel className="language-panel">
              <SectionTitle title="Primary languages" description="Count of repositories by GitHub's primary language" action={<Link className="panel-link" to="/app/analytics">Details <ArrowRight size={14} /></Link>} />
              {overview.data.primary_languages.length ? (
                <div className="language-bars">
                  <div className="language-stacked">
                    {overview.data.primary_languages.map((item) => <span key={item.language} style={{ width: item.share + '%', background: languageColor(item.language) }} title={item.language + ': ' + item.share + '%'} />)}
                  </div>
                  <div className="language-legend">
                    {overview.data.primary_languages.slice(0, 6).map((item) => (
                      <div className="language-legend-item" key={item.language}>
                        <i style={{ background: languageColor(item.language) }} />
                        <span>{item.language}</span>
                        <strong>{item.repositories}</strong>
                        <small>{item.share}%</small>
                      </div>
                    ))}
                    {overview.data.primary_languages.length > 6 && <Link to="/app/analytics" className="text-action">+{overview.data.primary_languages.length - 6} more</Link>}
                  </div>
                  <p className="chart-footnote">Based on each repository's primary language, not code size or time spent programming.</p>
                </div>
              ) : <EmptyPanel title="No language data yet" detail="GitHub has not reported a primary language for these repositories." />}
            </Panel>

            <Panel className="activity-panel">
              <SectionTitle title="Recent activity" description="Public events from your GitHub account" action={<Link className="panel-link" to="/app/activity">All activity <ArrowRight size={14} /></Link>} />
              {activity.isPending ? <LoadingPanel label="Loading public activity" /> : activity.isError ? <ErrorPanel title="Activity is unavailable" detail={activity.error.message} onRetry={() => void activity.refetch()} /> : <ActivityFeed data={activity.data} compact />}
            </Panel>
          </div>

          <Panel className="recent-repos-panel">
            <SectionTitle title="Recently updated" description="The latest repository updates GitHub reported" action={<Link className="panel-link" to="/app/repositories">All repositories <ArrowRight size={14} /></Link>} />
            {overview.data.recently_updated.length ? (
              <div className="recent-repo-grid">{overview.data.recently_updated.slice(0, 3).map((repository, index) => <motion.div key={repository.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}><RepositoryCard repository={repository} /></motion.div>)}</div>
            ) : <EmptyPanel title="Your workspace is ready" detail="Connect and synchronize GitHub to see your repositories here." action={<Link to="/app/settings" className="button button-primary button-small">Connection settings</Link>} />}
          </Panel>

          <div className="overview-footer-note"><span className="freshness-light" /><span>Last synchronized {relativeDate(overview.data.synced_at)}</span><span className="note-divider" />GitHub repository data</div>
        </>
      )}
    </motion.div>
  )
}

function MetricCard({ label, value, hint, icon, accent }: { label: string; value: number | null; hint: string; icon: React.ReactNode; accent: string }) {
  return (
    <Panel className="metric-card">
      <div className={'metric-icon metric-' + accent}>{icon}</div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value == null ? '—' : formatNumber(value)}</div>
      <div className="metric-hint">{hint}</div>
    </Panel>
  )
}

function languageColor(language: string) {
  const colors: Record<string, string> = { TypeScript: '#5c9eff', JavaScript: '#eac54f', Python: '#58a6ff', Rust: '#e27b54', Go: '#38bdf8', HTML: '#e88157', CSS: '#a78bfa', Java: '#e68a5f', Swift: '#f16f4e', Kotlin: '#bc8cff', Ruby: '#ed6a72', PHP: '#9896e8', Vue: '#45b883' }
  return colors[language] || '#9a7bff'
}
