'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/db'

interface AgentRunInfo {
  template_name: string
  status: string
  duration_ms: number | null
  error: string | null
}

interface ActivityItem {
  id: string
  spec_path: string
  target_type: string
  status: string
  last_error: string | null
  published_at: string | null
  agent_run: AgentRunInfo | null
}

interface ActivityFeedProps {
  projectId?: string
  orgId?: string
  initialItems: ActivityItem[]
}

const statusColors: Record<string, string> = {
  published: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
  queued: 'text-yellow-600 dark:text-yellow-400',
}

const statusLabels: Record<string, string> = {
  published: 'synced',
  failed: 'failed',
  queued: 'queued',
}

const agentStatusColors: Record<string, string> = {
  completed: 'text-green-600 dark:text-green-400',
  failed: 'text-red-600 dark:text-red-400',
  running: 'text-yellow-600 dark:text-yellow-400',
  queued: 'text-zinc-400',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ActivityFeed({ projectId, orgId, initialItems }: ActivityFeedProps) {
  const [items, setItems] = useState<ActivityItem[]>(initialItems)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    const channel = supabase
      .channel('activity-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spec_publish_targets' },
        async () => {
          const { data } = await supabase
            .from('spec_publish_targets')
            .select('id, spec_id, status, last_error, published_at, target_type, specs(path, project_id, projects(org_id))')
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(30)
          if (data) {
            setItems((prev) => {
              const agentMap = Object.fromEntries(prev.map((i) => [i.id, i.agent_run]))
              return data.map((row) => ({
                id: row.id,
                spec_path: (row.specs as any)?.path ?? '',
                target_type: row.target_type,
                status: row.status,
                last_error: row.last_error,
                published_at: row.published_at,
                agent_run: agentMap[row.id] ?? null,
              }))
            })
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_runs' },
        async () => {
          // On any agent_run change, refetch and merge into existing items
          const { data: agentRuns } = await supabase
            .from('agent_runs')
            .select('id, spec_id, status, duration_ms, error, templates(name)')
            .order('created_at', { ascending: false })
            .limit(30)

          if (agentRuns) {
            const agentMap: Record<string, AgentRunInfo> = {}
            for (const run of agentRuns) {
              agentMap[run.spec_id] = {
                template_name: (run.templates as any)?.name ?? 'Unknown template',
                status: run.status,
                duration_ms: run.duration_ms,
                error: run.error,
              }
            }
            setItems((prev) => prev.map((item) => ({
              ...item,
              agent_run: agentMap[item.id] ?? item.agent_run,
            })))
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [projectId, orgId])

  if (items.length === 0) {
    return <p className="text-sm text-zinc-400 py-8 text-center">No activity yet</p>
  }

  return (
    <div className="space-y-0 divide-y divide-zinc-100 dark:divide-zinc-800">
      {items.map((item) => (
        <div key={item.id} className="py-3">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300 truncate">{item.spec_path}</p>
            <div className="flex items-center gap-3 shrink-0 text-xs">
              <span className="text-zinc-400">→ {item.target_type}</span>
              <span className={statusColors[item.status] ?? 'text-zinc-400'}>
                {statusLabels[item.status] ?? item.status}
              </span>
              {item.published_at && (
                <span className="text-zinc-400">{timeAgo(item.published_at)}</span>
              )}
            </div>
          </div>

          {/* Agent run line */}
          {item.agent_run && (
            <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
              <span>Agent: {item.agent_run.template_name}</span>
              <span className={agentStatusColors[item.agent_run.status] ?? 'text-zinc-400'}>
                {item.agent_run.status}
              </span>
              {item.agent_run.duration_ms != null && (
                <span>{item.agent_run.duration_ms}ms</span>
              )}
              {item.agent_run.error && (
                <span className="text-red-500 truncate">{item.agent_run.error}</span>
              )}
            </div>
          )}

          {item.last_error && (
            /auth error|401|403/i.test(item.last_error) ? (
              <p className="text-xs text-red-500 mt-0.5">
                Authentication failed —{' '}
                <a href="/integrations" className="underline hover:text-red-700 dark:hover:text-red-300">
                  reconnect this integration
                </a>
                {' '}to resume syncing.
              </p>
            ) : (
              <p className="text-xs text-red-500 mt-0.5 truncate">{item.last_error}</p>
            )
          )}
        </div>
      ))}
    </div>
  )
}
