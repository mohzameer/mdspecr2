'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function RepositorySettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const router = useRouter()

  const [registeredRepo, setRegisteredRepo] = useState<string | null>(null)
  const [newRepo, setNewRepo] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((p: { registered_repo: string | null }) => {
        setRegisteredRepo(p.registered_repo)
        setNewRepo(p.registered_repo ?? '')
      })
  }, [projectId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/projects/${projectId}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registered_repo: newRepo.trim() || null }),
    })
    setRegisteredRepo(newRepo.trim() || null)
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-2">Repository</h1>
      <p className="text-sm text-zinc-500 mb-6">
        This project is bound to exactly one repository. Update this if the repo was renamed or migrated.
      </p>

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-6">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Registered repository</p>
        <p className="font-mono text-sm text-zinc-900 dark:text-zinc-50">
          {registeredRepo ?? <span className="text-zinc-400 italic">Not yet registered (set on first publish)</span>}
        </p>
      </div>

      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Update registered repository
          </label>
          <input
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            placeholder="owner/repo-name"
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 transition-colors"
        >
          {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Update repository'}
        </button>
      </form>
    </div>
  )
}
