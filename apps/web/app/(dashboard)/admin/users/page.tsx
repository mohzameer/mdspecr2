import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { cn } from '@/lib/utils'
import { OrgSelect } from './OrgSelect'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

  // Hard gate
  const { data: userData } = await service
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (userData?.role !== 'admin') redirect('/dashboard')

  const { data: orgs } = await service
    .from('organizations')
    .select('id, name')
    .order('name', { ascending: true })

  const { org: selectedOrgId } = await searchParams
  const selectedOrg = orgs?.find((o) => o.id === selectedOrgId) ?? null

  let rows: {
    userId: string
    email: string
    orgRole: string
    joinedAt: string
    projects: { id: string; name: string; role: string }[]
  }[] = []

  if (selectedOrg) {
    // Fetch org members (user_id FK points to auth.users — can't join directly via PostgREST)
    const { data: members } = await service
      .from('org_members')
      .select('user_id, role, created_at')
      .eq('org_id', selectedOrg.id)
      .order('created_at', { ascending: true })

    const memberUserIds = (members ?? []).map((m) => m.user_id)

    // Fetch public.users for those IDs separately
    const { data: users } = memberUserIds.length > 0
      ? await service
          .from('users')
          .select('id, email')
          .in('id', memberUserIds)
      : { data: [] }

    // Fetch all projects in this org
    const { data: projects } = await service
      .from('projects')
      .select('id, name')
      .eq('org_id', selectedOrg.id)
      .order('name', { ascending: true })

    const projectIds = (projects ?? []).map((p) => p.id)

    // Fetch project memberships for this org's projects
    const { data: projectMembers } = projectIds.length > 0
      ? await service
          .from('project_members')
          .select('user_id, role, project_id')
          .in('project_id', projectIds)
      : { data: [] }

    const usersMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]))

    rows = (members ?? []).map((m) => {
      const u = usersMap[m.user_id]
      const userProjects = (projectMembers ?? [])
        .filter((pm) => pm.user_id === m.user_id)
        .map((pm) => {
          const project = (projects ?? []).find((p) => p.id === pm.project_id)
          return { id: pm.project_id, name: project?.name ?? '—', role: pm.role }
        })
      return {
        userId: m.user_id,
        email: u?.email ?? m.user_id,
        orgRole: m.role,
        joinedAt: m.created_at,
        projects: userProjects,
      }
    })
  }

  const orgRoleColors: Record<string, string> = {
    owner: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    member: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  }

  const projectRoleColors: Record<string, string> = {
    admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    member: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
    viewer: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
  }

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Users</h1>

      {/* Org dropdown */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
          Organization
        </label>
        <OrgSelect orgs={orgs ?? []} selectedOrgId={selectedOrgId} />
      </div>

      {/* Users table */}
      {!selectedOrg ? (
        <p className="text-sm text-zinc-500">Select an organization to view its users.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-zinc-500">No members in this organization.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Org Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Projects</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((row) => (
                <tr key={row.userId} className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                    {row.email}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize', orgRoleColors[row.orgRole] ?? orgRoleColors.member)}>
                      {row.orgRole}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.projects.length === 0 ? (
                      <span className="text-zinc-400 text-xs">No projects</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {row.projects.map((p) => (
                          <span key={p.id} className="inline-flex items-center gap-1">
                            <span className="text-zinc-700 dark:text-zinc-300">{p.name}</span>
                            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium capitalize', projectRoleColors[p.role] ?? projectRoleColors.member)}>
                              {p.role}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(row.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
