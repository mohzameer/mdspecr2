'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function ReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to send')
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
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Write a reply…"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button type="submit" size="sm" disabled={loading || !body.trim()}>
        {loading ? 'Sending…' : 'Send reply'}
      </Button>
    </form>
  )
}
