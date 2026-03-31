'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/db'

interface ActivityItem {
  id: string
  spec_path: string
  target_type: string
  status: string
  last_error: string | null
  published_at: string | null
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
        {
          event: '*',
          schema: 'public',
          table: 'spec_publish_targets',
        },
        async () => {
          // Refetch on any change
          let query = supabase
            .from('spec_publish_targets')
            .select('id, status, last_error, published_at, target_type, specs(path, project_id, projects(org_id))')
            .order('published_at', { ascending: false, nullsFirst: false })
            .limit(30)

          const { data } = await query
          if (data) {
            setItems(
              data.map((row) => ({
                id: row.id,
                spec_path: (row.specs as any)?.path ?? '',
                target_type: row.target_type,
                status: row.status,
                last_error: row.last_error,
                published_at: row.published_at,
              }))
            )
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
        <div key={item.id} className="flex items-start justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-mono text-zinc-700 dark:text-zinc-300 truncate">{item.spec_path}</p>
            {item.last_error && (
              <p className="text-xs text-red-500 mt-0.5 truncate">{item.last_error}</p>
            )}
          </div>
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
      ))}
    </div>
  )
}
