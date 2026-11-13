import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, GitFork, Star, Ellipsis, Copy, FolderPlus, LockKeyhole, Globe2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { formatNumber, relativeDate } from '../lib/format'
import type { Repository } from '../lib/types'
import { useToast } from './Toast'

export function RepositoryCard({ repository, layout = 'grid' }: { repository: Repository; layout?: 'grid' | 'list' }) {
  const client = useQueryClient()
  const showToast = useToast()
  const collections = useQuery({ queryKey: ['collections'], queryFn: api.collections })
  const favorite = useMutation({
    mutationFn: () => api.favorite(repository.github_id, !repository.favorite),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['repositories'] }),
        client.invalidateQueries({ queryKey: ['overview'] }),
      ])
      showToast(repository.favorite ? 'Removed from favorites' : 'Added to favorites')
    },
    onError: () => showToast('Could not update favorite. Try again.', 'error'),
  })
  const addCollection = useMutation({
    mutationFn: (collectionId: string) => api.addToCollection(collectionId, repository.github_id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['collections'] })
      showToast('Added to collection')
    },
    onError: () => showToast('Could not add this repository to the collection.', 'error'),
  })
  const copyClone = async () => {
    try {
      await navigator.clipboard.writeText(repository.clone_url)
      showToast('HTTPS clone URL copied')
    } catch {
      showToast('Clipboard access is unavailable in this browser.', 'error')
    }
  }

  return (
    <article className={'repository-card ' + (layout === 'list' ? 'repository-card-list' : '')}>
      <div className="repo-card-top">
        <div className="repo-identity">
          <span className="repo-avatar" aria-hidden="true">{repository.name.slice(0, 1).toUpperCase()}</span>
          <div className="repo-title-wrap">
            <Link to={'/app/repositories/' + encodeURIComponent(repository.owner_login) + '/' + encodeURIComponent(repository.name)} className="repo-name">{repository.name}</Link>
            <span className="repo-owner">{repository.owner_login}</span>
          </div>
        </div>
        <div className="repo-actions">
          <button className={'icon-button favorite-toggle ' + (repository.favorite ? 'is-favorite' : '')} aria-label={repository.favorite ? 'Remove favorite' : 'Add favorite'} aria-pressed={repository.favorite} onClick={() => favorite.mutate()} disabled={favorite.isPending} title={repository.favorite ? 'Remove favorite' : 'Add favorite'}><Star size={16} fill={repository.favorite ? 'currentColor' : 'none'} /></button>
          <a className="icon-button" href={repository.html_url} target="_blank" rel="noreferrer" aria-label={'Open ' + repository.full_name + ' on GitHub'} title="Open on GitHub"><ArrowUpRight size={16} /></a>
        </div>
      </div>
      <p className="repo-description">{repository.description || 'No description provided.'}</p>
      {repository.topics.length > 0 && <div className="topic-row">{repository.topics.slice(0, 3).map((topic) => <span className="topic-chip" key={topic}>{topic}</span>)}</div>}
      <div className="repo-meta">
        <span className="repo-language">{repository.primary_language && <i style={{ background: languageColor(repository.primary_language) }} />}{repository.primary_language || 'Language not set'}</span>
        <span><Star size={14} />{formatNumber(repository.stargazers_count)}</span>
        <span><GitFork size={14} />{formatNumber(repository.forks_count)}</span>
        <span>{repository.archived ? 'Archived' : relativeDate(repository.updated_at_github)}</span>
      </div>
      <div className="repo-card-footer">
        <span className="visibility-label">{repository.visibility === 'private' ? <LockKeyhole size={13} /> : <Globe2 size={13} />}{repository.visibility}</span>
        <div className="repo-footer-actions">
          <button className="text-action" onClick={copyClone}><Copy size={13} />Clone</button>
          {collections.data?.length ? (
            <label className="collection-quick-add" title="Add to collection">
              <FolderPlus size={14} />
              <select aria-label={'Add ' + repository.name + ' to a collection'} defaultValue="" onChange={(event) => { if (event.target.value) addCollection.mutate(event.target.value); event.target.value = '' }} disabled={addCollection.isPending}>
                <option value="">Collection</option>
                {collections.data.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
              </select>
            </label>
          ) : <span className="micro-muted"><Ellipsis size={13} /></span>}
        </div>
      </div>
    </article>
  )
}

function languageColor(language: string) {
  const colors: Record<string, string> = { TypeScript: '#5c9eff', JavaScript: '#eac54f', Python: '#58a6ff', Rust: '#e27b54', Go: '#38bdf8', HTML: '#e88157', CSS: '#a78bfa', Java: '#e68a5f', Vue: '#45b883' }
  return colors[language] || '#9a7bff'
}
