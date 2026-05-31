'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Project {
  id: string
  name: string
  description: string | null
  default_integration: string | null
  default_type: 'wiki' | 'task'
}

interface IntegrationRow {
  id: string
  type: string
  status: string
}

const INTEGRATION_LABELS: Record<string, string> = {
  notion: 'Notion',
  clickup: 'ClickUp',
  confluence: 'Confluence',
  jira: 'Jira',
  s3: 'S3',
}

export default function GeneralSettingsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [defaultIntegration, setDefaultIntegration] = useState<string>('')
  const [defaultType, setDefaultType] = useState<'wiki' | 'task'>('wiki')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch('/api/integrations/list').then((r) => r.json()),
    ]).then(([p, ints]: [Project, IntegrationRow[]]) => {
      setProject(p)
      setName(p.name)
      setDescription(p.description ?? '')
      setDefaultType(p.default_type ?? 'wiki')

      const connected = (Array.isArray(ints) ? ints : []).filter((i) => i.status === 'connected')
      setIntegrations(Array.isArray(ints) ? ints : [])

      // Auto-default integration to the first connected one if none is set yet
      if (p.default_integration) {
        setDefaultIntegration(p.default_integration)
      } else if (connected.length > 0) {
        setDefaultIntegration(connected[0].type)
      } else {
        setDefaultIntegration('')
      }
    })
  }, [projectId])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch(`/api/projects/${projectId}/update`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        default_integration: defaultIntegration || null,
        default_type: defaultType,
      }),
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
  }

  if (!project) return <div className="p-8 text-sm text-zinc-400">Loading…</div>

  const connected = integrations.filter((i) => i.status === 'connected')

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
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Default type</label>
          <p className="text-xs text-zinc-500 mb-2">
            Used when a spec has no <code className="font-mono">type:</code> declared in frontmatter.
          </p>
          <select
            value={defaultType}
            onChange={(e) => setDefaultType(e.target.value as 'wiki' | 'task')}
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
          >
            <option value="wiki">wiki — publish as-is</option>
            <option value="task">task — transform with the Task Template before publishing</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Default integration</label>
          <p className="text-xs text-zinc-500 mb-2">
            Used when a spec has no <code className="font-mono">integration:</code> declared in frontmatter.
          </p>
          <select
            value={defaultIntegration}
            onChange={(e) => setDefaultIntegration(e.target.value)}
            disabled={connected.length === 0}
            className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500 disabled:opacity-50"
          >
            <option value="">None — every spec must declare its own integration</option>
            {connected.map((i) => (
              <option key={i.id} value={i.type}>
                {INTEGRATION_LABELS[i.type] ?? i.type}
              </option>
            ))}
          </select>
          {connected.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              No integrations connected yet. Connect one on the Integrations page.
            </p>
          )}
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
