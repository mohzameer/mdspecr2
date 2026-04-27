import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/db-server'
import { createSupabaseServiceClient } from '@/lib/db-server'
import type { SupportTicketWithUser } from '@/lib/types'

const CRITICALITY_COLORS: Record<string, string> = {
  low:      'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

const STATUS_COLORS: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
}

function fmt(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminSupportTicketsPage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string; paid?: string; category?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'admin') redirect('/dashboard')

  const params = await searchParams
  const statusFilter   = params?.status   ?? ''
  const paidFilter     = params?.paid     ?? ''
  const categoryFilter = params?.category ?? ''

  const service = createSupabaseServiceClient()
  let query = service
    .from('support_tickets')
    .select('*, users(email)')
    .order('submitter_is_paid', { ascending: false })
    .order('criticality_score',  { ascending: false })

  if (statusFilter)   query = query.eq('status', statusFilter)
  if (categoryFilter) query = query.eq('category', categoryFilter)
  if (paidFilter === 'true')  query = query.eq('submitter_is_paid', true)
  if (paidFilter === 'false') query = query.eq('submitter_is_paid', false)

  const { data } = await query
  const tickets = (data ?? []) as SupportTicketWithUser[]

  function filterUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    const merged = { status: statusFilter, paid: paidFilter, category: categoryFilter, ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    const s = p.toString()
    return `/support-tickets${s ? `?${s}` : ''}`
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Support Tickets</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6 text-sm">
        {/* Paid filter */}
        <div className="flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5">
          <span className="text-zinc-500 dark:text-zinc-400 text-xs">Plan:</span>
          {[['', 'All'], ['true', 'Paid'], ['false', 'Free']].map(([v, label]) => (
            <Link
              key={v}
              href={filterUrl({ paid: v })}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                paidFilter === v
                  ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5">
          <span className="text-zinc-500 dark:text-zinc-400 text-xs">Status:</span>
          {[['', 'All'], ['open', 'Open'], ['in_progress', 'In Progress'], ['resolved', 'Resolved']].map(([v, label]) => (
            <Link
              key={v}
              href={filterUrl({ status: v })}
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                statusFilter === v
                  ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      {tickets.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">No tickets found.</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Plan</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Criticality</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Submitted by</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                  <td className="px-4 py-3">
                    {ticket.submitter_is_paid ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        Pro
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        Free
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CRITICALITY_COLORS[ticket.criticality_label]}`}>
                      {ticket.criticality_label} · {ticket.criticality_score}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <Link
                      href={`/support-tickets/${ticket.id}`}
                      className="font-medium text-zinc-900 dark:text-zinc-50 hover:underline inline-flex items-center gap-1.5 truncate"
                    >
                      <span className="truncate">{ticket.title}</span>
                      {ticket.admin_unread_count > 0 && (
                        <span className="shrink-0 flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-semibold leading-none">
                          {ticket.admin_unread_count}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{ticket.category}</td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs truncate max-w-[160px]">
                    {ticket.users?.email ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs whitespace-nowrap">{fmt(ticket.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
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
