import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/db-server'
import { TicketForm } from './TicketForm'
import type { SupportTicket } from '@/lib/types'

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
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const tab = params?.tab === 'tickets' ? 'tickets' : 'new'

  const { data } = await supabase
    .from('support_tickets')
    .select('id, title, category, status, criticality_label, criticality_score, created_at, last_message_sender_role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const tickets = (data ?? []) as Pick<
    SupportTicket,
    'id' | 'title' | 'category' | 'status' | 'criticality_label' | 'criticality_score' | 'created_at' | 'last_message_sender_role'
  >[]

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Support</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-200 dark:border-zinc-800">
        {[
          { key: 'new',     label: 'New Ticket' },
          { key: 'tickets', label: `My Tickets${tickets.length > 0 ? ` (${tickets.length})` : ''}` },
        ].map(({ key, label }) => (
          <Link
            key={key}
            href={`/settings/support${key === 'tickets' ? '?tab=tickets' : ''}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-zinc-900 dark:border-zinc-50 text-zinc-900 dark:text-zinc-50'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === 'new' ? (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
          <TicketForm />
        </div>
      ) : (
        <div>
          {tickets.length === 0 ? (
            <div className="text-sm text-zinc-500 dark:text-zinc-400 py-8 text-center">
              You haven&apos;t submitted any support tickets yet.{' '}
              <Link href="/settings/support" className="underline">Open one</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map((ticket) => (
                <Link
                  key={ticket.id}
                  href={`/settings/support/${ticket.id}`}
                  className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 truncate">{ticket.title}</p>
                      {ticket.last_message_sender_role === 'admin' && (
                        <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] leading-none">
                          ✉
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CRITICALITY_COLORS[ticket.criticality_label]}`}>
                        {ticket.criticality_label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[ticket.status]}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
