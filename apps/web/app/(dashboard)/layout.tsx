import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { Sidebar } from '@/components/Sidebar'
import type { Organization, Project } from '@/lib/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  console.log('[layout] auth user:', user?.id ?? null, 'error:', authError?.message ?? null)
  if (!user) redirect('/login')

  // Fetch all orgs the user belongs to
  const { data: memberships, error: membershipsError } = await supabase
    .from('org_members')
    .select('role, organizations(id, name, created_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  console.log('[layout] memberships:', JSON.stringify(memberships), 'error:', membershipsError?.message ?? null)

  const orgs: Organization[] = (memberships ?? [])
    .map((m) => m.organizations as unknown as Organization)
    .filter(Boolean)

  // Determine current org from cookie or first org
  const cookieStore = await cookies()
  const cookieOrgId = cookieStore.get('current_org_id')?.value ?? null
  const currentOrg = orgs.find((o) => o.id === cookieOrgId) ?? orgs[0] ?? null

  console.log('[layout] cookie org_id:', cookieOrgId, 'resolved org:', currentOrg?.id ?? null)

  // Fetch projects for current org
  let projects: Project[] = []
  if (currentOrg) {
    const { data, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('org_id', currentOrg.id)
      .order('created_at', { ascending: true })
    console.log('[layout] projects:', JSON.stringify(data), 'error:', projectsError?.message ?? null)
    projects = (data ?? []) as Project[]
  } else {
    console.log('[layout] no current org — skipping projects fetch')
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
