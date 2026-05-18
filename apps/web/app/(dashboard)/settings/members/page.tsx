import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/db-server'
import { resolveOrgId } from '@/lib/resolveOrgId'

export default async function OrgMembersPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const cookieStore = await cookies()
  const currentOrgId = await resolveOrgId(supabase, user.id, cookieStore)
  if (!currentOrgId) redirect('/dashboard')

  const { data: members } = await supabase
    .from('org_members')
    .select('id, role, created_at, users(id, email)')
    .eq('org_id', currentOrgId)
    .order('created_at')

  const { data: invites } = await supabase
    .from('org_invites')
    .select('id, email, role, status, expires_at, created_at')
    .eq('org_id', currentOrgId)
    .in('status', ['pending', 'expired'])
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Members</h1>

      {/* Members list */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 mb-6">
        {(members ?? []).map((m) => (
          <div key={m.id} className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-zinc-900 dark:text-zinc-50">{(m.users as any)?.email}</p>
            <span className={`text-xs px-2 py-0.5 rounded capitalize font-medium ${
              m.role === 'owner' ? 'bg-zinc-900 dark:bg-zinc-50 text-white dark:text-zinc-900' :
              m.role === 'admin' ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300' :
              'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
            }`}>
              {m.role}
            </span>
          </div>
        ))}
      </div>

      {/* Invite form */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-6">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Invite member</h2>
        <form
          action={async (formData: FormData) => {
            'use server'
            const email = formData.get('email') as string
            const role = formData.get('role') as string
            const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/members/invite`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ org_id: currentOrgId, email, role }),
            })
          }}
          className="flex gap-2"
        >
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
          <select
            name="role"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-1.5 text-sm font-medium text-white dark:text-zinc-900"
          >
            Invite
          </button>
        </form>
      </div>

      {/* Pending invites */}
      {invites && invites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Pending invites</h2>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm text-zinc-900 dark:text-zinc-50">{invite.email}</p>
                  <p className="text-xs text-zinc-400">
                    {invite.role} · expires {new Date(invite.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded capitalize ${
                  invite.status === 'pending' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                  'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                }`}>
                  {invite.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
