import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { motion } from 'motion/react'
import { ActivityFeed } from '../components/ActivityFeed'
import { ErrorPanel, LoadingPanel, PageHeading, Panel, SectionTitle } from '../components/Primitives'
import { api } from '../lib/api'

export function ActivityPage() {
  const activity = useQuery({ queryKey: ['activity'], queryFn: api.activity, staleTime: 60_000 })
  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeading eyebrow="FROM GITHUB" title="Activity" description="A recent window into the public events on your account." action={<a className="button button-secondary button-small" href="https://docs.github.com/en/rest/activity/events" target="_blank" rel="noreferrer">About event coverage <ExternalLink size={14} /></a>} />
      <Panel className="activity-page-panel">
        <SectionTitle title="Recent public events" description="Events are provided by GitHub and can arrive with a delay." />
        {activity.isPending ? <LoadingPanel label="Loading recent GitHub events" /> : activity.isError ? <ErrorPanel detail={activity.error.message} onRetry={() => void activity.refetch()} /> : (
          <>
            <ActivityFeed data={activity.data} />
          </>
        )}
      </Panel>
    </motion.div>
  )
}
