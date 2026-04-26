'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import type { TicketStatus } from '@/lib/types'

const STATUSES: { value: TicketStatus; label: string }[] = [
  { value: 'open',        label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
]

export function AdminReplyBox({
  ticketId,
  currentStatus,
}: {
  ticketId: string
  currentStatus: TicketStatus
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<TicketStatus>(currentStatus)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: status !== currentStatus ? status : undefined,
          body: body.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to update')
      }
      setBody('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 shrink-0">Status</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Write a reply to the user… (optional)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <Button
        type="submit"
        size="sm"
        disabled={loading || (status === currentStatus && !body.trim())}
      >
        {loading ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}
