import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Compass, GitFork, Search, Star } from 'lucide-react'
import { motion } from 'motion/react'
import { Button, EmptyPanel, ErrorPanel, Input, LoadingPanel, PageHeading } from '../components/Primitives'
import { api } from '../lib/api'
import { formatNumber, relativeDate } from '../lib/format'

export function ExplorePage() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(input.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [input])
  const results = useQuery({
    queryKey: ['explore', query],
    queryFn: () => api.explore(query),
    enabled: query.length >= 2,
    staleTime: 45_000,
  })

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeading eyebrow="PUBLIC GITHUB" title="Explore" description="Find public repositories across GitHub. Search results come directly from GitHub." />
      <label className="explore-search">
        <Search size={18} />
        <Input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Try a language, topic, or project name…" aria-label="Search public repositories" />
        {input && <Button variant="quiet" size="small" onClick={() => { setInput(''); setQuery('') }}>Clear</Button>}
      </label>
      {query.length < 2 ? <EmptyPanel title="A world of public code" detail="Enter at least two characters to search GitHub's public repositories." action={<span className="explore-mini-note"><Compass size={15} />Live results · ranked by stars</span>} /> : results.isPending ? <LoadingPanel label="Searching public repositories on GitHub" /> : results.isError ? <ErrorPanel title="GitHub search is unavailable" detail={results.error.message} onRetry={() => void results.refetch()} /> : (
        <>
          <div className="explore-result-summary"><span>{formatNumber(results.data.total_count)} repositories found</span>{results.data.rate_limit_remaining != null && <small>{results.data.rate_limit_remaining} search requests left in this window</small>}</div>
          {results.data.items.length ? <div className="explore-grid">{results.data.items.map((repo, index) => (
            <motion.article className="explore-card panel" key={repo.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 7) * 0.035 }}>
              <div className="repo-card-top"><div className="repo-identity"><span className="repo-avatar explore-avatar">{repo.full_name.split('/')[0].slice(0, 1).toUpperCase()}</span><div className="repo-title-wrap"><a className="repo-name" href={repo.html_url} target="_blank" rel="noreferrer">{repo.full_name}</a><span className="repo-owner">Public repository</span></div></div><a className="icon-button" href={repo.html_url} target="_blank" rel="noreferrer" aria-label={'Open ' + repo.full_name + ' on GitHub'}><ArrowUpRight size={16} /></a></div>
              <p className="repo-description">{repo.description || 'No description provided.'}</p>
              <div className="repo-meta"><span className="repo-language">{repo.language || 'Language not set'}</span><span><Star size={14} />{formatNumber(repo.stargazers_count)}</span><span><GitFork size={14} />{formatNumber(repo.forks_count)}</span><span>{relativeDate(repo.updated_at)}</span></div>
            </motion.article>
          ))}</div> : <EmptyPanel title={'No results for “' + query + '”'} detail="Try a broader language, topic, or repository name." />}
        </>
      )}
      <p className="explore-disclaimer">Explore shows public GitHub search results. GitHub applies a separate rate limit to unauthenticated searches.</p>
    </motion.div>
  )
}
