import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import type { Project } from '@/lib/types'
import { NewProjectButton } from './NewProjectButton'

export default async function ProjectsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const currentOrgId = cookieStore.get('current_org_id')?.value

  if (!currentOrgId) redirect('/dashboard')

  const { data: projects } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('created_at', { ascending: false })

  const { data: ownerMember } = await supabase
    .from('org_members')
    .select('user_id')
    .eq('org_id', currentOrgId)
    .eq('role', 'owner')
    .single()

  const { data: subscription } = ownerMember
    ? await supabase.from('subscriptions').select('plan').eq('user_id', ownerMember.user_id).single()
    : { data: null }

  const atLimit = (!subscription || subscription.plan === 'free') && (projects?.length ?? 0) >= 1

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Projects</h1>
        <NewProjectButton atLimit={atLimit} />
      </div>

      {!projects || projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-12 text-center">
          <p className="text-sm text-zinc-500 mb-4">No projects yet.</p>
          <Link href="/onboarding?skip_org=1" className="text-sm font-medium text-zinc-900 dark:text-zinc-50 underline">
            Create your first project →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {(projects as Project[]).map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}/specs`}
              className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h2>
                  {project.description && (
                    <p className="text-xs text-zinc-500 mt-0.5">{project.description}</p>
                  )}
                </div>
                {project.registered_repo && (
                  <span className="text-xs font-mono text-zinc-400 bg-zinc-50 dark:bg-zinc-800 px-2 py-1 rounded">
                    {project.registered_repo}
                  </span>
                )}
              </div>
              {project.spec_dirs.length > 0 && (
                <div className="flex gap-1 mt-3 flex-wrap">
                  {project.spec_dirs.map((dir) => (
                    <span key={dir} className="text-xs font-mono text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                      {dir}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
