import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { cn } from '@/lib/utils'
import { OrgSelect } from './OrgSelect'
import { TabNav } from './TabNav'

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; tab?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createSupabaseServiceClient()

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

  const { org: selectedOrgId, tab } = await searchParams
  const activeTab = tab === 'projects' ? 'projects' : 'users'
  const selectedOrg = orgs?.find((o) => o.id === selectedOrgId) ?? null

  const orgRoleColors: Record<string, string> = {
    owner: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
    admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    member: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
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

      {!selectedOrg ? (
        <p className="text-sm text-zinc-500">Select an organization to view its users and projects.</p>
      ) : (
        <>
          <TabNav orgId={selectedOrg.id} activeTab={activeTab} />

          {activeTab === 'users' ? (
            <UsersTab service={service} orgId={selectedOrg.id} orgRoleColors={orgRoleColors} />
          ) : (
            <ProjectsTab service={service} orgId={selectedOrg.id} />
          )}
        </>
      )}
    </div>
  )
}

async function UsersTab({
  service,
  orgId,
  orgRoleColors,
}: {
  service: ReturnType<typeof createSupabaseServiceClient>
  orgId: string
  orgRoleColors: Record<string, string>
}) {
  const { data: members } = await service
    .from('org_members')
    .select('user_id, role, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  const userIds = (members ?? []).map((m) => m.user_id)

  const { data: users } = userIds.length > 0
    ? await service.from('users').select('id, email').in('id', userIds)
    : { data: [] }

  const usersMap = Object.fromEntries((users ?? []).map((u) => [u.id, u]))

  if (!members || members.length === 0) {
    return <p className="text-sm text-zinc-500">No members in this organization.</p>
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Email</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Role</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {members.map((m) => {
            const u = usersMap[m.user_id]
            return (
              <tr key={m.user_id} className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">
                  {u?.email ?? m.user_id}
                </td>
                <td className="px-4 py-3">
                  <span className={cn('inline-flex px-2 py-0.5 rounded text-xs font-medium capitalize', orgRoleColors[m.role] ?? orgRoleColors.member)}>
                    {m.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                  {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

async function ProjectsTab({
  service,
  orgId,
}: {
  service: ReturnType<typeof createSupabaseServiceClient>
  orgId: string
}) {
  const { data: projects } = await service
    .from('projects')
    .select('id, name, description, created_at')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (!projects || projects.length === 0) {
    return <p className="text-sm text-zinc-500">No projects in this organization.</p>
  }

  const projectIds = projects.map((p) => p.id)
  const { data: memberCounts } = await service
    .from('project_members')
    .select('project_id')
    .in('project_id', projectIds)

  const countByProject = (memberCounts ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.project_id] = (acc[row.project_id] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Project</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Description</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Members</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {projects.map((p) => (
            <tr key={p.id} className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
              <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{p.name}</td>
              <td className="px-4 py-3 text-zinc-500 max-w-xs truncate">{p.description ?? '—'}</td>
              <td className="px-4 py-3 text-zinc-500">{countByProject[p.id] ?? 0}</td>
              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
