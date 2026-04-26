'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CATEGORIES = [
  'Bug / Error',
  'Billing',
  'Account Access',
  'Feature Request',
  'Performance',
  'Data / Content',
  'Other',
]

export function TicketForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim() || !category || !body.trim()) {
      setError('All fields are required.')
      return
    }
    if (body.trim().length < 20) {
      setError('Description must be at least 20 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category, body: body.trim() }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error ?? 'Failed to submit ticket')
      }
      setSuccess(true)
      setTitle('')
      setCategory('')
      setBody('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-700 dark:text-green-300">
        Your support ticket has been submitted. We&apos;ll get back to you soon.{' '}
        <button
          className="underline font-medium"
          onClick={() => setSuccess(false)}
        >
          Submit another
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Short summary of your issue"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          required
        >
          <option value="" disabled>Select a category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="body">Description</Label>
        <textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          minLength={20}
          placeholder="Describe your issue in detail…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
          required
        />
        <p className="text-xs text-muted-foreground">{body.length} characters (min 20)</p>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Submitting…' : 'Submit ticket'}
      </Button>
    </form>
  )
}
