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

  const { data: specIds } = await supabase
    .from('specs')
    .select('id')
    .eq('project_id', projectId)

  const ids = (specIds ?? []).map((s) => s.id)

  const { data: activity } = await supabase
    .from('spec_publish_targets')
    .select('id, status, last_error, published_at, target_type, specs(path)')
    .in('spec_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(50)

  const items = (activity ?? []).map((row) => ({
    id: row.id,
    spec_path: (row.specs as any)?.path ?? '',
    target_type: row.target_type,
    status: row.status,
    last_error: row.last_error,
    published_at: row.published_at,
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
