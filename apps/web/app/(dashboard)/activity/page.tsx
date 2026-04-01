import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { ActivityFeed } from '@/components/ActivityFeed'

export default async function ActivityPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const currentOrgId = cookieStore.get('current_org_id')?.value
  if (!currentOrgId) redirect('/dashboard')

  const { data: projectIds } = await supabase
    .from('projects')
    .select('id')
    .eq('org_id', currentOrgId)

  const ids = (projectIds ?? []).map((p) => p.id)

  const { data: specIds } = await supabase
    .from('specs')
    .select('id')
    .in('project_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])

  const sids = (specIds ?? []).map((s) => s.id)

  const { data: activity } = await supabase
    .from('spec_publish_targets')
    .select('id, status, last_error, published_at, target_type, specs(path)')
    .in('spec_id', sids.length ? sids : ['00000000-0000-0000-0000-000000000000'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50)

  const items = (activity ?? []).map((row) => ({
    id: row.id,
    spec_path: (row.specs as any)?.path ?? '',
    target_type: row.target_type,
    status: row.status,
    last_error: row.last_error,
    published_at: row.published_at,
    agent_run: null,
  }))

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Activity</h1>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <ActivityFeed orgId={currentOrgId} initialItems={items} />
      </div>
    </div>
  )
}
