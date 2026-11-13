import { ArrowUpRight, GitBranch, GitCommitHorizontal, GitFork, GitPullRequest, MessageCircle, Package, Star } from 'lucide-react'
import type { Activity } from '../lib/types'
import { relativeDate } from '../lib/format'

function iconFor(type: string) {
  if (type === 'PushEvent') return GitCommitHorizontal
  if (type === 'PullRequestEvent') return GitPullRequest
  if (type === 'IssuesEvent' || type === 'IssueCommentEvent') return MessageCircle
  if (type === 'ReleaseEvent') return Package
  if (type === 'WatchEvent') return Star
  if (type === 'ForkEvent') return GitFork
  return GitBranch
}

export function ActivityFeed({ data, compact = false }: { data: Activity; compact?: boolean }) {
  if (!data.items.length) {
    return <div className="activity-empty"><span>No recent public activity was returned by GitHub.</span><small>That can mean there is no activity in the available window.</small></div>
  }
  const items = compact ? data.items.slice(0, 5) : data.items
  return (
    <div className={'activity-feed ' + (compact ? 'activity-feed-compact' : '')}>
      {items.map((item, index) => {
        const Icon = iconFor(item.type)
        return (
          <article className="activity-item" key={item.id + '-' + index}>
            <span className="activity-icon"><Icon size={15} /></span>
            <div className="activity-copy"><span>{item.summary}</span><small><a href={item.url} target="_blank" rel="noreferrer">{item.repository || 'Open repository'} <ArrowUpRight size={11} /></a><i />{relativeDate(item.created_at)}</small></div>
          </article>
        )
      })}
      <p className="activity-coverage">{data.coverage_note}</p>
    </div>
  )
}
