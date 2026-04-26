import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/db-server'
import { ReplyBox } from '../ReplyBox'
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

export default async function TicketThreadPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!ticket) notFound()

  const { data: messages } = await supabase
    .from('ticket_messages')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  const t = ticket as SupportTicket
  const msgs = (messages ?? []) as TicketMessage[]
  const isResolved = t.status === 'resolved'

  return (
    <div className="p-8 max-w-2xl">
      <Link
        href="/settings/support?tab=tickets"
        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 mb-4 inline-block"
      >
        ← Back to My Tickets
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">{t.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span>{t.category}</span>
          <span>·</span>
          <span>{fmt(t.created_at)}</span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${CRITICALITY_COLORS[t.criticality_label]}`}>
            {t.criticality_label}
          </span>
          <span className={`px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[t.status]}`}>
            {t.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Thread */}
      <div className="space-y-3 mb-6">
        {/* Original body as first message */}
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <p className="text-xs text-zinc-400 mb-1">You · {fmt(t.created_at)}</p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{t.body}</p>
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
                {isAdmin ? 'Support team' : 'You'} · {fmt(msg.created_at)}
              </p>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{msg.body}</p>
            </div>
          )
        })}
      </div>

      {/* Reply or resolved notice */}
      {isResolved ? (
        <div className="rounded-md bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
          This ticket has been resolved. <Link href="/settings/support" className="underline">Open a new ticket</Link> if you need further help.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <ReplyBox ticketId={id} />
        </div>
      )}
    </div>
  )
}
