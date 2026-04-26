import { redirect } from 'next/navigation'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Hard gate — non-admins never see this page
  const { data: userData } = await createSupabaseServiceClient()
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (userData?.role !== 'admin') redirect('/dashboard')

  const service = createSupabaseServiceClient()
  const [
    { count: totalUsers },
    { count: totalProjects },
    { count: totalOrgs },
  ] = await Promise.all([
    service.from('users').select('*', { count: 'exact', head: true }),
    service.from('projects').select('*', { count: 'exact', head: true }),
    service.from('organizations').select('*', { count: 'exact', head: true }),
  ])

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Total Users</p>
          <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 mt-1">{totalUsers ?? 0}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Total Projects</p>
          <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 mt-1">{totalProjects ?? 0}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Total Orgs</p>
          <p className="text-3xl font-semibold text-zinc-900 dark:text-zinc-50 mt-1">{totalOrgs ?? 0}</p>
        </div>
      </div>
    </div>
  )
}
