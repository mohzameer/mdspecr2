import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/db-server'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { AdminReplyBox } from '../AdminReplyBox'
import type { SupportTicket, TicketMessage } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
}

const CRITICALITY_COLORS: Record<string, string> = {
  low:      'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
  medium:   'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  high:     'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  critical: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
}

function fmt(date: string) {
  return new Date(date).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export default async function AdminTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (userData?.role !== 'admin') redirect('/dashboard')

  const service = createSupabaseServiceClient()

  const { data: ticketRow } = await service
    .from('support_tickets')
    .select('*, users(email)')
    .eq('id', id)
    .single()

  if (!ticketRow) notFound()

  const { data: messages } = await service
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  const ticket = ticketRow as SupportTicket & { users: { email: string } | null }
  const msgs = (messages ?? []) as TicketMessage[]

  return (
    <div className="p-8 max-w-2xl">
      <Link
        href="/support-tickets"
        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4 inline-block"
      >
        ← Back to Support Tickets
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{ticket.title}</h1>
          {ticket.submitter_is_paid ? (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Pro
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Free
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{ticket.category}</span>
          <span>·</span>
          <span>{ticket.users?.email ?? '—'}</span>
          <span>·</span>
          <span>{fmt(ticket.created_at)}</span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${CRITICALITY_COLORS[ticket.criticality_label]}`}>
            {ticket.criticality_label} · {ticket.criticality_score}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}>
            {ticket.status.replace('_', ' ')}
          </span>
        </div>

        {/* AI reasoning */}
        {ticket.ai_reasoning && (
          <details className="mt-3">
            <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300">
              AI reasoning
            </summary>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 pl-2 border-l-2 border-zinc-200 dark:border-zinc-700">
              {ticket.ai_reasoning}
            </p>
          </details>
        )}
      </div>

      {/* Thread */}
      <div className="space-y-3 mb-6">
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <p className="text-xs text-zinc-400 mb-1">{ticket.users?.email ?? 'User'} · {fmt(ticket.created_at)}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{ticket.body}</p>
        </div>

        {msgs.map((msg) => {
          const isAdmin = msg.sender_role === 'admin'
          return (
            <div
              key={msg.id}
              className={`rounded-lg border p-4 ${
                isAdmin
                  ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
              }`}
            >
              <p className="text-xs text-zinc-400 mb-1">
                {isAdmin ? 'Support team' : (ticket.users?.email ?? 'User')} · {fmt(msg.created_at)}
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{msg.body}</p>
            </div>
          )
        })}
      </div>

      {/* Admin reply + status */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-3">Reply / Update status</p>
        <AdminReplyBox ticketId={id} currentStatus={ticket.status} />
      </div>
    </div>
  )
}
