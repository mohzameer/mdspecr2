import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { resolveOrgId } from '@/lib/resolveOrgId'
import { ActivityFeed } from '@/components/ActivityFeed'

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Admins go to their own separate page — never see the user dashboard
  const { data: userData } = await createSupabaseServiceClient()
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (userData?.role === 'admin') redirect('/admin')

  // Check actual org membership — cookie alone isn't reliable for new users
  const { count: orgCount } = await supabase
    .from('org_members')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (!orgCount) {
    redirect('/onboarding')
  }

  const cookieStore = await cookies()
  const currentOrgId = await resolveOrgId(supabase, user.id, cookieStore) ?? ''

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
        .select('id, status, last_error, published_at, updated_at, integrations(type), specs(path, type)')
        .order('updated_at', { ascending: false, nullsFirst: false })
        .limit(20),
    ])

  const activityItems = (recentActivity ?? []).map((row) => ({
    id: row.id,
    spec_path: (row.specs as any)?.path ?? '',
    spec_type: (row.specs as any)?.type ?? '',
    integration_type: (row.integrations as any)?.type ?? '',
    status: row.status,
    last_error: row.last_error,
    published_at: row.published_at,
    updated_at: row.updated_at,
    agent_run: null,
  }))

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Dashboard</h1>

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

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-4">Recent activity</h2>
        <ActivityFeed orgId={currentOrgId} initialItems={activityItems} />
      </div>
    </div>
  )
}
