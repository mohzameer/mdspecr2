'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OrganizationSettingsPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/org/current')
      .then((r) => r.json())
      .then((org) => { setOrgName(org?.name ?? ''); setLoading(false) })
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/org/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: orgName }),
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  if (loading) return <div className="p-8 text-sm text-zinc-400">Loading…</div>

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Organization settings</h1>
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Organization name</label>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            required
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
