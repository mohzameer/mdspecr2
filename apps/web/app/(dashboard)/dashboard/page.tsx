import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { ActivityFeed } from '@/components/ActivityFeed'

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const currentOrgId = cookieStore.get('current_org_id')?.value

  if (!currentOrgId) {
    // No org yet — prompt to create one
    return (
      <div className="flex flex-col items-center justify-center h-full py-32 text-center">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
          You don&apos;t belong to any organization yet.
        </h2>
        <p className="text-sm text-zinc-500 mb-6">
          Create your first organization or ask a teammate to invite you.
        </p>
        <div className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span>→ Use the org switcher in the sidebar to create your first organization</span>
          <span>→ Or ask a teammate to invite you to their organization</span>
        </div>
      </div>
    )
  }

  // Fetch stats
  const [{ count: specCount }, { count: projectCount }, { data: recentActivity }] =
    await Promise.all([
      supabase
        .from('specs')
        .select('*', { count: 'exact', head: true })
        .in(
          'project_id',
          (await supabase.from('projects').select('id').eq('org_id', currentOrgId)).data?.map((p) => p.id) ?? []
        ),
      supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', currentOrgId),
      supabase
        .from('spec_publish_targets')
        .select('id, status, last_error, published_at, target_type, specs(path)')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(20),
    ])

  const activityItems = (recentActivity ?? []).map((row) => ({
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
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Specs published</p>
          <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 mt-1">{specCount ?? 0}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Projects</p>
          <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 mt-1">{projectCount ?? 0}</p>
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Recent activity</h2>
        <ActivityFeed orgId={currentOrgId} initialItems={activityItems} />
      </div>
    </div>
  )
}
