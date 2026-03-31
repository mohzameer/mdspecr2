import { redirect, notFound } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/db-server'

export default async function ProjectMembersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, org_id')
    .eq('id', projectId)
    .single()
  if (!project) notFound()

  const { data: members } = await supabase
    .from('project_members')
    .select('id, role, created_at, users(id, email)')
    .eq('project_id', projectId)
    .order('created_at')

  const { data: orgMembers } = await supabase
    .from('org_members')
    .select('user_id, role, users(id, email)')
    .eq('org_id', project.org_id)

  const projectMemberIds = new Set((members ?? []).map((m) => (m.users as any)?.id))
  const eligibleOrgMembers = (orgMembers ?? []).filter(
    (om) => !projectMemberIds.has(om.user_id)
  )

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Project members</h1>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 mb-6">
        {(members ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm text-zinc-900 dark:text-zinc-50">{(m.users as any)?.email}</p>
            </div>
            <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded capitalize">
              {m.role}
            </span>
          </div>
        ))}
        {(!members || members.length === 0) && (
          <div className="px-4 py-6 text-center text-sm text-zinc-400">No project-specific members.</div>
        )}
      </div>

      {eligibleOrgMembers.length > 0 && (
        <div>
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">Add org member to project</p>
          <form
            action={async (formData: FormData) => {
              'use server'
              const userId = formData.get('user_id') as string
              const role = formData.get('role') as string
              const supabase2 = await createSupabaseServerClient()
              await supabase2.from('project_members').insert({ project_id: projectId, user_id: userId, role })
            }}
            className="flex gap-2"
          >
            <select
              name="user_id"
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              {eligibleOrgMembers.map((om) => (
                <option key={om.user_id} value={om.user_id}>
                  {(om.users as any)?.email}
                </option>
              ))}
            </select>
            <select
              name="role"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
            >
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900"
            >
              Add
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
