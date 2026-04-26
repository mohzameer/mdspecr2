import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { Sidebar } from '@/components/Sidebar'
import type { Organization, Project } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all orgs the user belongs to
  const { data: memberships } = await supabase
    .from('org_members')
    .select('role, organizations(id, name, created_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const orgs: Organization[] = (memberships ?? [])
    .map((m) => m.organizations as unknown as Organization)
    .filter(Boolean)

  // Determine current org from cookie or first org
  const cookieStore = await cookies()
  const currentOrgId = cookieStore.get('current_org_id')?.value ?? orgs[0]?.id ?? null
  const currentOrg = orgs.find((o) => o.id === currentOrgId) ?? orgs[0] ?? null

  // Fetch projects for current org
  let projects: Project[] = []
  if (currentOrg) {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', currentOrg.id)
      .order('created_at', { ascending: true })
    projects = (data ?? []) as Project[]
  }

  // Check platform admin role via service client (bypasses RLS)
  const { data: userData } = await createSupabaseServiceClient()
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = userData?.role === 'admin'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar orgs={orgs} currentOrg={currentOrg} projects={projects} isAdmin={isAdmin} />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
