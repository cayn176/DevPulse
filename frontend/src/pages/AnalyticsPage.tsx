import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, GitFork, Star } from 'lucide-react'
import { motion } from 'motion/react'
import { ErrorPanel, LoadingPanel, PageHeading, Panel, SectionTitle } from '../components/Primitives'
import { api } from '../lib/api'
import { formatNumber } from '../lib/format'

export function AnalyticsPage() {
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview })
  const repositoryLeaders = useQuery({ queryKey: ['repositories', 'leaders'], queryFn: () => api.repositories({ sort: 'stars', order: 'desc', page_size: 8 }) })

  if (overview.isPending || repositoryLeaders.isPending) return <div className="page-stack"><PageHeading title="Analytics" description="Understand the shape of your public GitHub portfolio." /><LoadingPanel label="Calculating from synchronized repository data" /></div>
  if (overview.isError || repositoryLeaders.isError) return <div className="page-stack"><PageHeading title="Analytics" description="Understand the shape of your public GitHub portfolio." /><ErrorPanel detail={overview.error?.message || repositoryLeaders.error?.message} onRetry={() => { void overview.refetch(); void repositoryLeaders.refetch() }} /></div>

  const languages = overview.data.primary_languages
  const leaders = repositoryLeaders.data.items.slice(0, 8).map((repo) => ({ name: repo.name.length > 22 ? repo.name.slice(0, 20) + '…' : repo.name, stars: repo.stargazers_count }))
  const hasLanguageData = languages.length > 0
  const hasLeaderData = leaders.some((item) => item.stars > 0)

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeading eyebrow="YOUR PORTFOLIO" title="Analytics" description="Repository signals from your latest GitHub synchronization." />
      <div className="analytics-stat-row">
        <StatMini icon={<BarChart3 size={16} />} label="Repositories" value={overview.data.total_repositories} />
        <StatMini icon={<Star size={16} />} label="Stars" value={overview.data.total_stars} />
        <StatMini icon={<GitFork size={16} />} label="Forks" value={overview.data.total_forks} />
        <StatMini icon={<span className="analytics-stat-dot" />} label="Primary languages" value={languages.length} />
      </div>
      <div className="analytics-grid">
        <Panel className="chart-panel language-chart-panel">
          <SectionTitle title="Language mix" description="Share of repositories by primary language" />
          {hasLanguageData ? (
            <div className="donut-layout">
              <div className="donut-chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={languages} dataKey="repositories" nameKey="language" innerRadius="68%" outerRadius="92%" paddingAngle={3} stroke="none">
                      {languages.map((language) => <Cell key={language.language} fill={languageColor(language.language)} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: 'var(--text-primary)' }} formatter={(value, _name, item) => [value, item.payload.language]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center"><strong>{overview.data.total_repositories}</strong><span>repositories</span></div>
              </div>
              <div className="donut-legend">{languages.slice(0, 8).map((item) => <div key={item.language}><i style={{ background: languageColor(item.language) }} /><span>{item.language}</span><strong>{item.repositories}</strong><small>{item.share}%</small></div>)}</div>
            </div>
          ) : <div className="chart-empty"><span>No primary language data is available for this account yet.</span></div>}
          <p className="chart-footnote">This counts GitHub's primary language per repository. It is not a code-size or time-spent measure.</p>
        </Panel>
        <Panel className="chart-panel stars-chart-panel">
          <SectionTitle title="Stars by repository" description="Most-starred repositories in your synchronized set" />
          {hasLeaderData ? (
            <div className="bar-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaders} layout="vertical" margin={{ top: 4, right: 18, left: 4, bottom: 4 }} barCategoryGap={12}>
                  <CartesianGrid stroke="var(--border-soft)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(154,123,255,.06)' }} />
                  <Bar dataKey="stars" fill="#9a7bff" radius={[0, 5, 5, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="chart-empty"><span>GitHub has not reported stars for this repository set.</span></div>}
          <p className="chart-footnote">Values are the current star counts returned by GitHub; no historical trend is inferred.</p>
        </Panel>
      </div>
      <Panel className="analytics-note"><div className="note-orb">i</div><div><strong>Data with context</strong><p>This release focuses on current repository metadata. Commit history and contribution activity require separate sources and coverage rules, so they are not represented as analytics here.</p></div></Panel>
    </motion.div>
  )
}

function StatMini({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="analytics-stat"><span>{icon}</span><div><small>{label}</small><strong>{formatNumber(value)}</strong></div></div>
}

function languageColor(language: string) {
  const colors: Record<string, string> = { TypeScript: '#5c9eff', JavaScript: '#eac54f', Python: '#58a6ff', Rust: '#e27b54', Go: '#38bdf8', HTML: '#e88157', CSS: '#a78bfa', Java: '#e68a5f', Swift: '#f16f4e', Kotlin: '#bc8cff', Ruby: '#ed6a72', PHP: '#9896e8', Vue: '#45b883' }
  return colors[language] || '#9a7bff'
}

const tooltipStyle = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: 12,
}
