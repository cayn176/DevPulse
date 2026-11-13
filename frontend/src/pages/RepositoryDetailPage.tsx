import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowUpRight, Copy, ExternalLink, GitBranch, GitFork, Globe2, LockKeyhole, Package, Star, Tag } from 'lucide-react'
import { motion } from 'motion/react'
import { Link, useParams } from 'react-router-dom'
import { EmptyPanel, ErrorPanel, LoadingPanel, Panel, SectionTitle } from '../components/Primitives'
import { RepositoryWorkbench } from '../components/RepositoryWorkbench'
import { useToast } from '../components/Toast'
import { api } from '../lib/api'
import { formatDate, formatNumber, relativeDate } from '../lib/format'

export function RepositoryDetailPage() {
  const { owner = '', name = '' } = useParams()
  const queryClient = useQueryClient()
  const showToast = useToast()
  const repository = useQuery({ queryKey: ['repository', owner, name], queryFn: () => api.repository(owner, name) })
  const collections = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const favorite = useMutation({
    mutationFn: () => api.favorite(repository.data!.github_id, !repository.data!.favorite),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['repository'] }), queryClient.invalidateQueries({ queryKey: ['repositories'] }), queryClient.invalidateQueries({ queryKey: ['overview'] })])
      showToast(repository.data?.favorite ? 'Removed from favorites' : 'Added to favorites')
    },
    onError: () => showToast('Could not update favorite.', 'error'),
  })
  const addCollection = useMutation({
    mutationFn: (id: string) => api.addToCollection(id, repository.data!.github_id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['collections'] })
      showToast('Added to collection')
    },
    onError: () => showToast('Could not add to collection.', 'error'),
  })

  if (repository.isPending) return <div className="page-stack"><LoadingPanel label="Loading repository details" /></div>
  if (repository.isError) return <div className="page-stack"><Link className="back-link" to="/app/repositories"><ArrowLeft size={15} />Back to repositories</Link><ErrorPanel detail={repository.error.message} onRetry={() => void repository.refetch()} /></div>
  const repo = repository.data

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(label + ' copied')
    } catch {
      showToast('Clipboard access is unavailable in this browser.', 'error')
    }
  }

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <Link className="back-link" to="/app/repositories"><ArrowLeft size={15} />All repositories</Link>
      <div className="repo-detail-heading">
        <div>
          <div className="repo-breadcrumb"><Link to={'https://github.com/' + repo.owner_login} target="_blank">{repo.owner_login}</Link><span>/</span><strong>{repo.name}</strong></div>
          <h1>{repo.name}</h1>
          <p>{repo.description || 'No description provided.'}</p>
          <div className="detail-badges"><span className="visibility-label">{repo.visibility === 'private' ? <LockKeyhole size={13} /> : <Globe2 size={13} />}{repo.visibility}</span>{repo.archived && <span className="status-badge">Archived</span>}{repo.fork && <span className="status-badge">Fork</span>}</div>
        </div>
        <div className="detail-actions">
          <button className={'button button-secondary ' + (repo.favorite ? 'favorite-action-active' : '')} aria-pressed={repo.favorite} onClick={() => favorite.mutate()} disabled={favorite.isPending}><Star size={15} fill={repo.favorite ? 'currentColor' : 'none'} />{repo.favorite ? 'Favorited' : 'Favorite'}</button>
          <a className="button button-primary" href={repo.html_url} target="_blank" rel="noreferrer">Open on GitHub <ArrowUpRight size={15} /></a>
          {collections.data?.length ? <label className="select-button"><span>Add to collection</span><select aria-label="Add repository to a collection" defaultValue="" onChange={(event) => { if (event.target.value) addCollection.mutate(event.target.value); event.target.value = '' }}><option value="">Choose…</option>{collections.data.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}</select></label> : <Link className="button button-quiet" to="/app/collections">Create a collection</Link>}
        </div>
      </div>

      <div className="repo-detail-stat-grid">
        <DetailStat icon={<Star size={16} />} label="Stars" value={formatNumber(repo.stargazers_count)} />
        <DetailStat icon={<GitFork size={16} />} label="Forks" value={formatNumber(repo.forks_count)} />
        <DetailStat icon={<Package size={16} />} label="Open issues" value={formatNumber(repo.open_issues_count)} />
        <DetailStat icon={<GitBranch size={16} />} label="Default branch" value={repo.default_branch || 'Not available'} />
      </div>

      <div className="detail-content-grid">
        <Panel className="detail-overview-panel">
          <SectionTitle title="Repository overview" description="Current details reported by GitHub" />
          <div className="detail-key-value">
            <DetailValue label="Primary language" value={repo.primary_language || 'Not reported by GitHub'} />
            <DetailValue label="Created" value={formatDate(repo.created_at_github)} />
            <DetailValue label="Last updated" value={relativeDate(repo.updated_at_github)} />
            <DetailValue label="Last pushed" value={relativeDate(repo.pushed_at_github)} />
            <DetailValue label="License" value={repo.license_name || 'Not reported by GitHub'} />
            <DetailValue label="Watchers" value={formatNumber(repo.watchers_count)} />
          </div>
          <div className="detail-link-row">
            <button className="text-action" onClick={() => copyValue(repo.clone_url, 'HTTPS clone URL')}><Copy size={14} />Copy HTTPS clone URL</button>
            <button className="text-action" onClick={() => copyValue(repo.ssh_url, 'SSH clone URL')}><Copy size={14} />Copy SSH clone URL</button>
          </div>
        </Panel>
        <Panel className="detail-meta-panel">
          <SectionTitle title="Topics" description="Tags attached to this repository" />
          {repo.topics.length ? <div className="topic-cloud">{repo.topics.map((topic) => <span className="topic-chip" key={topic}><Tag size={11} />{topic}</span>)}</div> : <EmptyPanel title="No topics yet" detail="GitHub has not reported any topics for this repository." />}
          {repo.homepage && <a className="homepage-link" href={repo.homepage} target="_blank" rel="noreferrer">{repo.homepage.replace(/^https?:\/\//, '')}<ExternalLink size={13} /></a>}
        </Panel>
      </div>
      <RepositoryWorkbench key={repo.full_name} owner={repo.owner_login} name={repo.name}/>
    </motion.div>
  )
}

function DetailStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Panel className="detail-stat"><span>{icon}</span><small>{label}</small><strong>{value}</strong></Panel>
}

function DetailValue({ label, value }: { label: string; value: string }) {
  return <div className="detail-value"><span>{label}</span><strong>{value}</strong></div>
}
