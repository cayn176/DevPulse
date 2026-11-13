import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter, Grid2X2, List, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { RepositoryCard } from '../components/RepositoryCard'
import { Button, EmptyPanel, ErrorPanel, Input, LoadingPanel, PageHeading, Panel } from '../components/Primitives'
import { api } from '../lib/api'

export function RepositoriesPage() {
  const [params, setParams] = useSearchParams()
  const urlQuery = params.get('q') || ''
  const [search, setSearch] = useState(urlQuery)
  const [debouncedSearch, setDebouncedSearch] = useState(urlQuery)
  const [language, setLanguage] = useState('')
  const [archived, setArchived] = useState('all')
  const [fork, setFork] = useState('all')
  const [favorite, setFavorite] = useState(params.get('favorite') === 'true')
  const [sort, setSort] = useState('updated')
  const [view, setView] = useState<'grid' | 'list'>(() => localStorage.getItem('devpulse-repository-view') === 'list' ? 'list' : 'grid')
  const [page, setPage] = useState(1)
  const overview = useQuery({ queryKey: ['overview'], queryFn: api.overview })

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 260)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (urlQuery !== debouncedSearch) {
      const next = new URLSearchParams(params)
      if (debouncedSearch) next.set('q', debouncedSearch)
      else next.delete('q')
      setParams(next, { replace: true })
    }
  }, [debouncedSearch])

  useEffect(() => {
    localStorage.setItem('devpulse-repository-view', view)
  }, [view])

  useEffect(() => { setPage(1) }, [debouncedSearch, language, archived, fork, favorite, sort])

  const result = useQuery({
    queryKey: ['repositories', debouncedSearch, language, archived, fork, favorite, sort, page],
    queryFn: () => api.repositories({
      q: debouncedSearch || undefined,
      language: language || undefined,
      archived: archived === 'all' ? undefined : archived === 'archived',
      fork: fork === 'all' ? undefined : fork === 'forks',
      favorite: favorite ? true : undefined,
      sort,
      order: sort === 'name' ? 'asc' : 'desc',
      page,
      page_size: 24,
    }),
  })

  const filtersActive = Boolean(debouncedSearch || language || archived !== 'all' || fork !== 'all' || favorite)
  const clearFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setLanguage('')
    setArchived('all')
    setFork('all')
    setFavorite(false)
    setParams({}, { replace: true })
  }

  return (
    <div className="page-stack">
      <PageHeading eyebrow="YOUR GITHUB PROJECTS" title="Repositories" description="Browse, search, and keep your projects organized." action={<span className="count-badge">{result.data ? result.data.total + ' repositories' : '—'}</span>} />

      <Panel className="repository-toolbar">
        <label className="repository-search">
          <Search size={16} />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a repository…" aria-label="Search repositories by name or description" />
          {search && <button className="icon-button clear-search" aria-label="Clear search" onClick={() => setSearch('')}><X size={14} /></button>}
          <kbd>/</kbd>
        </label>
        <div className="filter-controls">
          <label className="filter-select-wrap"><span className="sr-only">Filter by language</span><select className="select-control" value={language} onChange={(event) => setLanguage(event.target.value)}><option value="">All languages</option>{overview.data?.primary_languages.map((item) => <option key={item.language} value={item.language}>{item.language}</option>)}</select><SlidersHorizontal size={14} /></label>
          <label className="filter-select-wrap"><span className="sr-only">Filter archived repositories</span><select className="select-control" value={archived} onChange={(event) => setArchived(event.target.value)}><option value="all">Any status</option><option value="active">Active</option><option value="archived">Archived</option></select><Filter size={14} /></label>
          <label className="filter-select-wrap filter-fork"><span className="sr-only">Filter forks</span><select className="select-control" value={fork} onChange={(event) => setFork(event.target.value)}><option value="all">Original + forks</option><option value="original">Original only</option><option value="forks">Forks only</option></select></label>
          <label className="filter-select-wrap"><span className="sr-only">Sort repositories</span><select className="select-control" value={sort} onChange={(event) => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="stars">Most stars</option><option value="forks">Most forks</option><option value="issues">Open issues</option><option value="name">Name</option></select></label>
          <button className={'favorite-filter ' + (favorite ? 'is-active' : '')} onClick={() => setFavorite((value) => !value)} aria-pressed={favorite}><Star size={14} fill={favorite ? 'currentColor' : 'none'} />Favorites</button>
          <div className="view-switch" role="group" aria-label="Repository layout">
            <button className={view === 'grid' ? 'is-selected' : ''} onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}><Grid2X2 size={15} /></button>
            <button className={view === 'list' ? 'is-selected' : ''} onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}><List size={15} /></button>
          </div>
        </div>
        {filtersActive && <div className="active-filter-row"><span>Filtered results</span><Button size="small" variant="quiet" icon={<X size={13} />} onClick={clearFilters}>Clear filters</Button></div>}
      </Panel>

      {result.isPending ? <LoadingPanel label="Loading repositories from your workspace" /> : result.isError ? <ErrorPanel detail={result.error.message} onRetry={() => void result.refetch()} /> : result.data.items.length ? (
        <>
          <div className={'repository-grid ' + (view === 'list' ? 'repository-list' : '')}>{result.data.items.map((repository) => <RepositoryCard key={repository.id} repository={repository} layout={view} />)}</div>
          <div className="pagination-row">
            <span>Showing {(page - 1) * result.data.page_size + 1}–{Math.min(page * result.data.page_size, result.data.total)} of {result.data.total}</span>
            <div><Button size="small" variant="quiet" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span className="page-number">{page}</span><Button size="small" variant="quiet" disabled={page * result.data.page_size >= result.data.total} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
          </div>
        </>
      ) : filtersActive ? (
        <EmptyPanel title="No matching repositories" detail="Try another search or clear one of the filters." action={<Button variant="quiet" size="small" onClick={clearFilters}>Clear filters</Button>} />
      ) : (
        <EmptyPanel title="No repositories synchronized yet" detail="Connect GitHub, then sync the repositories accessible to your account in Settings." action={<Button icon={<Filter size={15} />} onClick={() => window.location.assign('/app/settings')}>Open settings</Button>} />
      )}
    </div>
  )
}
