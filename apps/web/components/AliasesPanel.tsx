'use client'

import { useState } from 'react'

interface Integration {
  id: string
  type: string
  status: string
}

interface AliasRow {
  id: string
  name: string
  native_id: string
  native_url: string | null
  display_name: string | null
  integration_id: string
  integrations: { id: string; type: string; status: string } | null
}

interface Props {
  initialAliases: AliasRow[]
  connectedIntegrations: Integration[]
  canEdit: boolean
}

const integrationLabels: Record<string, string> = {
  notion: 'Notion',
  confluence: 'Confluence',
  clickup: 'ClickUp',
  jira: 'Jira',
  s3: 'S3',
}

function extractNativeId(url: string): { native_id: string; native_url: string } {
  const trimmed = url.trim()
  if (!trimmed) return { native_id: '', native_url: '' }

  if (!trimmed.startsWith('http')) return { native_id: trimmed, native_url: '' }

  let native_id = trimmed

  const spaceMatch = trimmed.match(/\/v\/s\/([0-9]+)/)
  if (spaceMatch) native_id = spaceMatch[1]
  else {
    const listMatch = trimmed.match(/\/li\/([0-9]+)/)
    if (listMatch) native_id = listMatch[1]
  }
  if (native_id === trimmed) {
    const docMatch = trimmed.match(/\/docs\/([a-zA-Z0-9-]+)/)
    if (docMatch) native_id = docMatch[1]
  }

  return { native_id, native_url: trimmed }
}

export function AliasesPanel({ initialAliases, connectedIntegrations, canEdit }: Props) {
  const [aliases, setAliases] = useState<AliasRow[]>(initialAliases)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', integration_id: '', native_id: '', native_url: '', display_name: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')

  function applyUrlInput(raw: string) {
    const { native_id, native_url } = extractNativeId(raw)
    setForm((f) => ({ ...f, native_id, native_url }))
    setUrlInput(raw)
  }

  async function fetchAliases() {
    const res = await fetch('/api/aliases')
    if (res.ok) setAliases(await res.json())
  }

  async function createAlias(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setForm({ name: '', integration_id: '', native_id: '', native_url: '', display_name: '' })
      setUrlInput('')
      setShowForm(false)
      fetchAliases()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to create alias')
    }
    setSaving(false)
  }

  async function updateAlias(aliasId: string) {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/aliases/${aliasId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setEditingId(null)
      setForm({ name: '', integration_id: '', native_id: '', native_url: '', display_name: '' })
      setUrlInput('')
      fetchAliases()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to update alias')
    }
    setSaving(false)
  }

  async function deleteAlias(aliasId: string) {
    if (!confirm('Delete this alias? Any spec referencing it will fail on next publish.')) return
    await fetch(`/api/aliases/${aliasId}`, { method: 'DELETE' })
    fetchAliases()
  }

  function startEditing(alias: AliasRow) {
    setEditingId(alias.id)
    setForm({
      name: alias.name,
      integration_id: alias.integration_id,
      native_id: alias.native_id,
      native_url: alias.native_url ?? '',
      display_name: alias.display_name ?? '',
    })
    setUrlInput(alias.native_url ?? alias.native_id)
    setShowForm(false)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm text-zinc-500 max-w-lg">
          Aliases map human-readable names to target containers in your integrations. Reference them as the{' '}
          <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">parent</code>{' '}
          field in your spec frontmatter.
        </p>
        {canEdit && connectedIntegrations.length > 0 && (
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setError(null) }}
            className="shrink-0 ml-4 rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            + New Alias
          </button>
        )}
      </div>

      {connectedIntegrations.length === 0 && (
        <p className="text-sm text-zinc-400 py-4">No integrations connected. Connect one on the Integrations page first.</p>
      )}

      {showForm && (
        <form onSubmit={createAlias} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Alias name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              placeholder="eng-docs"
              hint="Lowercase, hyphens allowed. Used as parent: in frontmatter."
            />
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Integration</label>
              <select
                value={form.integration_id}
                onChange={(e) => setForm({ ...form, integration_id: e.target.value })}
                required
                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">Select integration</option>
                {connectedIntegrations.map((i) => (
                  <option key={i.id} value={i.id}>{integrationLabels[i.type] ?? i.type}</option>
                ))}
              </select>
            </div>
          </div>
          <Field
            label="Display name"
            value={form.display_name}
            onChange={(v) => setForm({ ...form, display_name: v })}
            placeholder="Engineering Docs"
            required={false}
          />
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">URL or ID</label>
            <input
              value={urlInput}
              onChange={(e) => applyUrlInput(e.target.value)}
              placeholder="https://app.clickup.com/…/v/s/90181… or space/folder/doc ID"
              required
              className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
            />
            {form.native_id && form.native_id !== urlInput && (
              <p className="text-xs text-zinc-400 mt-1">Extracted ID: <code className="font-mono">{form.native_id}</code></p>
            )}
            {!form.native_id && urlInput && (
              <p className="text-xs text-zinc-400 mt-1">Using as raw ID: <code className="font-mono">{urlInput}</code></p>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50">
              {saving ? 'Creating…' : 'Create Alias'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setError(null) }} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
              Cancel
            </button>
          </div>
        </form>
      )}

      {aliases.length > 0 && (
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
          {aliases.map((alias) => {
            const intType = alias.integrations?.type
            const isEditing = editingId === alias.id

            return (
              <div key={alias.id} className="p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Alias name" value={form.name} onChange={(v) => setForm({ ...form, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="eng-docs" />
                      <Field label="Display name" value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} placeholder="Engineering Docs" required={false} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">URL or ID</label>
                      <input
                        value={urlInput}
                        onChange={(e) => applyUrlInput(e.target.value)}
                        placeholder="https://app.clickup.com/…/v/s/90181… or space/folder/doc ID"
                        required
                        className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      />
                      {form.native_id && form.native_id !== urlInput && (
                        <p className="text-xs text-zinc-400 mt-1">Extracted ID: <code className="font-mono">{form.native_id}</code></p>
                      )}
                    </div>
                    {error && <p className="text-xs text-red-500">{error}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => updateAlias(alias.id)} disabled={saving} className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => { setEditingId(null); setError(null) }} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <code className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-50">{alias.name}</code>
                      {intType && (
                        <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded capitalize">{integrationLabels[intType] ?? intType}</span>
                      )}
                      {alias.display_name && (
                        <span className="text-xs text-zinc-500">{alias.display_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-400 max-w-48 truncate" title={alias.native_id}>{alias.native_id}</span>
                      {canEdit && (
                        <>
                          <button onClick={() => startEditing(alias)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">Edit</button>
                          <button onClick={() => deleteAlias(alias.id)} className="text-xs text-zinc-500 hover:text-red-600">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {aliases.length === 0 && connectedIntegrations.length > 0 && !showForm && (
        <p className="text-sm text-zinc-400 py-4">No aliases yet. Create one to reference it as <code className="font-mono text-xs">parent</code> in your spec frontmatter.</p>
      )}
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, hint, mono, required = true, optionalLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  mono?: boolean
  required?: boolean
  optionalLabel?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
        {label}{optionalLabel && <span className="font-normal text-zinc-400 ml-1">(optional)</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 ${mono ? 'font-mono' : ''}`}
      />
      {hint && <p className="text-xs text-zinc-400 mt-1">{hint}</p>}
    </div>
  )
}
