'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeactivateSubscriptionButton({ userId }: { userId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDeactivate() {
    setLoading(true)
    const res = await fetch('/api/admin/billing/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId }),
    })
    if (res.ok) {
      setConfirming(false)
      router.refresh()
    } else {
      setLoading(false)
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-xs text-red-600 dark:text-red-400 underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300"
      >
        Deactivate
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleDeactivate}
        disabled={loading}
        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? 'Deactivating…' : 'Confirm'}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={loading}
        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        Cancel
      </button>
    </div>
  )
}
