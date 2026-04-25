'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CancelSubscriptionButton() {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCancel() {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/billing/cancel', { method: 'POST' })
    if (res.ok) {
      setConfirming(false)
      router.refresh()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error === 'paddle_error'
        ? 'Could not reach billing provider. Try again or contact support.'
        : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-sm text-red-600 dark:text-red-400 underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300"
      >
        Cancel subscription
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800 dark:text-red-200">Cancel your subscription?</p>
      <p className="text-xs text-red-700 dark:text-red-300">
        You&apos;ll keep Pro access until the end of your current billing period. After that your account reverts to the free plan.
      </p>
      {error && <p className="text-xs text-red-700 dark:text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleCancel}
          disabled={loading}
          className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Cancelling…' : 'Yes, cancel'}
        </button>
        <button
          onClick={() => { setConfirming(false); setError(null) }}
          disabled={loading}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          Keep subscription
        </button>
      </div>
    </div>
  )
}
