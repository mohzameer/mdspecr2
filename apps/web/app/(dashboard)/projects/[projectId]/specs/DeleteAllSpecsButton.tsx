'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function DeleteAllSpecsButton({ projectId, count }: { projectId: string; count: number }) {
  const [deleting, setDeleting] = useState(false)
  const router = useRouter()

  async function handleClick() {
    if (!window.confirm(`Delete all ${count} spec(s)? This cannot be undone.`)) return
    setDeleting(true)
    await fetch(`/api/projects/${projectId}/specs`, { method: 'DELETE' })
    setDeleting(false)
    router.refresh()
  }

  return (
    <button
      onClick={handleClick}
      disabled={deleting}
      className="rounded-md border border-red-200 dark:border-red-900 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 transition-colors"
    >
      {deleting ? 'Deleting…' : 'Delete all specs'}
    </button>
  )
}
