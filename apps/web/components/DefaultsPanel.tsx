'use client'

import { useState } from 'react'

interface Integration {
  id: string
  type: string
  status: string
  config: Record<string, unknown> | null
}

interface Props {
  // All integrations (connected ones get a card).
  integrations: Integration[]
  canEdit: boolean
}

interface ListOpt {
  id: string
  name: string
}

const LABELS: Record<string, string> = {
  notion: 'Notion',
  confluence: 'Confluence',
  clickup: 'ClickUp',
  jira: 'Jira',
  s3: 'S3',
}

// Per-integration copy for the generic "default parent" fallback.
const PARENT_FIELDS: Record<string, { label: string; placeholder: string; help: string }> = {
  notion: {
    label: 'Default parent page',
    placeholder: 'alias, page ID, or notion.so URL',
    help: 'Specs with no parent: publish under this page. Empty → workspace root.',
  },
  confluence: {
    label: 'Default parent page',
    placeholder: 'alias, page ID, or Atlassian URL',
    help: 'Specs with no parent: publish under this page. Empty → space root.',
  },
  s3: {
    label: 'Default key prefix',
    placeholder: 'e.g. docs/',
    help: 'Specs with no parent: use this key prefix. Empty → bucket root.',
  },
}

export function DefaultsPanel({ integrations, canEdit }: Props) {
  const connected = integrations.filter((i) => i.status === 'connected')

  if (connected.length === 0) {
    return <p className="text-sm text-zinc-500">Connect an integration to set its routing defaults.</p>
  }

  return (
    <div className="space-y-3">
      {connected.map((i) => {
        if (i.type === 'clickup') return <ClickUpDefault key={i.id} integration={i} canEdit={canEdit} />
        if (i.type === 'jira') return <JiraDefault key={i.id} integration={i} />
        return <ParentDefault key={i.id} integration={i} canEdit={canEdit} />
      })}
    </div>
  )
}

function CardShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50 mb-1">{title}</p>
      {children}
    </div>
  )
}

// ---- Notion / Confluence / S3: a single default_parent text field ----------

function ParentDefault({ integration, canEdit }: { integration: Integration; canEdit: boolean }) {
  const field = PARENT_FIELDS[integration.type]
  const config = (integration.config ?? {}) as { default_parent?: string | null }
  const [value, setValue] = useState(config.default_parent ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_parent: value.trim() || null }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? body.error ?? 'Could not save.')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <CardShell title={`${LABELS[integration.type]} — ${field.label.toLowerCase()}`}>
      <p className="text-xs text-zinc-500 mb-2">{field.help}</p>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={field.placeholder}
          disabled={!canEdit}
          className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
        />
        {canEdit && (
          <button
            onClick={save}
            disabled={saving}
            className="shrink-0 rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {saved && <p className="text-xs text-green-600 dark:text-green-400 mt-2">Saved.</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
    </CardShell>
  )
}

// ---- Jira: read-only (publishes to its configured project; parent ignored) --

function JiraDefault({ integration }: { integration: Integration }) {
  const config = (integration.config ?? {}) as { project_key?: string }
  return (
    <CardShell title="Jira — default destination">
      <p className="text-xs text-zinc-500">
        Publishes to project{' '}
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{config.project_key ?? '—'}</span> as a Task.
        Change the project by reconnecting Jira.
      </p>
    </CardShell>
  )
}

// ---- ClickUp: default task list picker (space → list → save) ----------------

interface Space {
  id: string // bare space ID ('space:' prefix stripped)
  name: string
}

function ClickUpDefault({ integration, canEdit }: { integration: Integration; canEdit: boolean }) {
  const config = (integration.config ?? {}) as { default_list_id?: string; lists?: ListOpt[] }
  const [defaultListId, setDefaultListId] = useState(config.default_list_id ?? '')
  const [knownLists, setKnownLists] = useState<ListOpt[]>(config.lists ?? [])

  const [editing, setEditing] = useState(false)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpace, setSelectedSpace] = useState('')
  const [lists, setLists] = useState<ListOpt[]>([])
  const [pickedListId, setPickedListId] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const currentName = knownLists.find((l) => l.id === defaultListId)?.name

  async function openEditor() {
    setEditing(true)
    setError(null)
    if (spaces.length > 0) return
    setLoading(true)
    try {
      const res = await fetch(`/api/integrations/${integration.id}/clickup-targets`)
      if (!res.ok) throw new Error('Could not load ClickUp spaces.')
      const data = (await res.json()) as { targets?: Array<{ id: string; name: string; kind: string }> }
      setSpaces(
        (data.targets ?? [])
          .filter((t) => t.kind === 'space')
          .map((t) => ({ id: t.id.replace(/^space:/, ''), name: t.name }))
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function loadLists(spaceId: string) {
    setSelectedSpace(spaceId)
    setLists([])
    setPickedListId('')
    if (!spaceId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/${integration.id}/clickup-lists?space_id=${spaceId}`)
      if (!res.ok) throw new Error('Could not load lists for that space.')
      const data = (await res.json()) as { lists?: ListOpt[] }
      setLists(data.lists ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    if (!pickedListId) {
      setError('Pick a list to set as the default.')
      return
    }
    const picked = lists.find((l) => l.id === pickedListId)
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_list_id: pickedListId, lists: picked ? [picked] : [] }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.detail ?? body.error ?? 'Could not save the default list.')
      }
      setDefaultListId(pickedListId)
      setKnownLists(picked ? [picked] : [])
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">ClickUp — default task list</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {defaultListId ? (
              <>Tasks with no <code className="font-mono">parent:</code> go to <span className="font-medium text-zinc-700 dark:text-zinc-300">{currentName ?? `list ${defaultListId}`}</span>.</>
            ) : (
              <>No default list set — <code className="font-mono">type: task</code> specs without a <code className="font-mono">parent:</code> will be rejected.</>
            )}
          </p>
        </div>
        {canEdit && !editing && (
          <button
            onClick={openEditor}
            className="shrink-0 rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600"
          >
            {defaultListId ? 'Change' : 'Set default list'}
          </button>
        )}
      </div>

      {saved && <p className="text-xs text-green-600 dark:text-green-400 mt-2">Saved.</p>}

      {editing && (
        <div className="mt-4 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Space</label>
            <select
              value={selectedSpace}
              onChange={(e) => loadLists(e.target.value)}
              disabled={loading}
              className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
            >
              <option value="">Select a space…</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {selectedSpace && (
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">List</label>
              <select
                value={pickedListId}
                onChange={(e) => setPickedListId(e.target.value)}
                disabled={loading || lists.length === 0}
                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
              >
                <option value="">{lists.length === 0 ? (loading ? 'Loading…' : 'No lists in this space') : 'Select a list…'}</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving || !pickedListId}
              className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save default'}
            </button>
            <button
              onClick={() => { setEditing(false); setError(null) }}
              className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {!editing && error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{error}</p>}
    </div>
  )
}
