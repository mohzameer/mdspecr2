'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Project {
  id: string
  name: string
  description: string | null
  spec_dirs: string[]
}

export default function GeneralSettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [specDirs, setSpecDirs] = useState<string[]>([])
  const [newDir, setNewDir] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/config`)
      .then((r) => r.json())
      .then((p: Project) => {
        setProject(p)
        setName(p.name)
        setDescription(p.description ?? '')
        setSpecDirs(p.spec_dirs ?? [])
      })
  }, [projectId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/projects/${projectId}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, spec_dirs: specDirs }),
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  function addDir() {
    const d = newDir.trim()
    if (d && !specDirs.includes(d)) {
      setSpecDirs([...specDirs, d])
      setNewDir('')
    }
  }

  function removeDir(dir: string) {
    setSpecDirs(specDirs.filter((d) => d !== dir))
  }

  if (!project) return <div className="p-8 text-sm text-zinc-400">Loading…</div>

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">General settings</h1>
      <form onSubmit={save} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Project name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Spec directories</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {specDirs.map((dir) => (
              <span key={dir} className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 text-xs font-mono px-2 py-1 rounded">
                {dir}
                <button type="button" onClick={() => removeDir(dir)} className="text-zinc-400 hover:text-zinc-700">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newDir}
              onChange={(e) => setNewDir(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDir() } }}
              placeholder="/specs"
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
            <button type="button" onClick={addDir} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
              Add
            </button>
          </div>
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
