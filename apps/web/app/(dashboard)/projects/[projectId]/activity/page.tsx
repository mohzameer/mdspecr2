import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'
import { ActivityFeed } from '@/components/ActivityFeed'

export default async function ProjectActivityPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single()
  if (!project) notFound()

  const { data: specRows } = await supabase
    .from('specs')
    .select('id')
    .eq('project_id', projectId)

  const specIds = (specRows ?? []).map((s) => s.id)
  const safeIds = specIds.length ? specIds : ['00000000-0000-0000-0000-000000000000']

  const [activityRes, agentRunsRes] = await Promise.all([
    supabase
      .from('spec_publish_targets')
      .select('id, spec_id, status, last_error, published_at, target_type, specs(path)')
      .in('spec_id', safeIds)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(50),
    supabase
      .from('agent_runs')
      .select('id, spec_id, status, duration_ms, error, templates(name)')
      .in('spec_id', safeIds)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  // Build spec_id → latest agent run lookup
  const agentRunBySpecId: Record<string, {
    template_name: string
    status: string
    duration_ms: number | null
    error: string | null
  }> = {}
  for (const run of agentRunsRes.data ?? []) {
    if (!agentRunBySpecId[run.spec_id]) {
      agentRunBySpecId[run.spec_id] = {
        template_name: (run.templates as any)?.name ?? 'Unknown template',
        status: run.status,
        duration_ms: run.duration_ms,
        error: run.error,
      }
    }
  }

  const items = (activityRes.data ?? []).map((row) => ({
    id: row.id,
    spec_path: (row.specs as any)?.path ?? '',
    target_type: row.target_type,
    status: row.status,
    last_error: row.last_error,
    published_at: row.published_at,
    agent_run: agentRunBySpecId[row.spec_id] ?? null,
  }))

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">
        {project.name} — Activity
      </h1>
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <ActivityFeed projectId={projectId} initialItems={items} />
      </div>
    </div>
  )
}
