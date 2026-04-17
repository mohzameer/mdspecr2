'use client'

import { useState, useEffect } from 'react'

type IntegrationType = 'notion' | 'confluence' | 'clickup'

interface Integration {
  id: string
  type: IntegrationType
  status: 'connected' | 'unhealthy' | 'disconnected'
  config: Record<string, unknown> | null
}

interface AliasRow {
  id: string
  name: string
  native_id: string
  native_url: string | null
  display_name: string | null
  integration_id: string
  integrations: { id: string; type: IntegrationType; status: string } | null
}

type ConnectForm = {
  notion: { token: string; root_page_id: string }
  confluence: { base_url: string; email: string; token: string; space_key: string }
  clickup: { api_token: string; workspace_url: string }
}

function parseClickUpWorkspaceId(url: string): string | null {
  const match = url.match(/app\.clickup\.com\/(\d+)/)
  return match ? match[1] : null
}

const integrationMeta: Record<IntegrationType, { label: string; description: string; icon: string }> = {
  notion: { label: 'Notion', description: 'Publish specs as nested sub-pages in a Notion workspace.', icon: 'N' },
  confluence: { label: 'Confluence', description: 'Publish specs as a page tree in a Confluence space.', icon: 'C' },
  clickup: { label: 'ClickUp', description: 'Publish specs as ClickUp Docs in your workspace.', icon: '✓' },
}

const statusColors: Record<string, string> = {
  connected: 'text-green-600 dark:text-green-400',
  unhealthy: 'text-yellow-600 dark:text-yellow-400',
  disconnected: 'text-zinc-400',
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<IntegrationType, Integration | null>>({
    notion: null, confluence: null, clickup: null,
  })
  const [connecting, setConnecting] = useState<IntegrationType | null>(null)
  const [form, setForm] = useState<ConnectForm>({
    notion: { token: '', root_page_id: '' },
    confluence: { base_url: '', email: '', token: '', space_key: '' },
    clickup: { api_token: '', workspace_url: '' },
  })
  const [saving, setSaving] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)

  // Aliases state
  const [aliases, setAliases] = useState<AliasRow[]>([])
  const [showAliasForm, setShowAliasForm] = useState(false)
  const [aliasForm, setAliasForm] = useState({ name: '', integration_id: '', native_id: '', native_url: '', display_name: '' })
  const [aliasSaving, setAliasSaving] = useState(false)
  const [aliasError, setAliasError] = useState<string | null>(null)
  const [editingAlias, setEditingAlias] = useState<string | null>(null)

  async function fetchIntegrations() {
    const res = await fetch('/api/integrations/list')
    if (res.ok) {
      const data: Integration[] = await res.json()
      const map = { notion: null, confluence: null, clickup: null } as Record<IntegrationType, Integration | null>
      data.forEach((i) => { map[i.type] = i })
      setIntegrations(map)
    }
  }

  async function fetchAliases() {
    const res = await fetch('/api/aliases')
    if (res.ok) {
      const data: AliasRow[] = await res.json()
      setAliases(data)
    }
  }

  useEffect(() => {
    fetchIntegrations()
    fetchAliases()
  }, [])

  async function connect(type: IntegrationType, e: React.FormEvent) {
    e.preventDefault()

    if (type === 'clickup') {
      const workspaceId = parseClickUpWorkspaceId(form.clickup.workspace_url)
      if (!workspaceId) {
        setUrlError('Could not find a workspace ID in that URL. Paste your full ClickUp workspace URL.')
        return
      }
      setUrlError(null)
      const credentials = { api_token: form.clickup.api_token, workspace_id: workspaceId }
      setSaving(true)
      await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, credentials: JSON.stringify(credentials), config: credentials }),
      })
      await fetchIntegrations()
      setConnecting(null)
      setSaving(false)
      return
    }

    setSaving(true)
    await fetch('/api/integrations/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, credentials: JSON.stringify(form[type]), config: form[type] }),
    })
    await fetchIntegrations()
    setConnecting(null)
    setSaving(false)
  }

  async function disconnect(type: IntegrationType) {
    if (!confirm(`Disconnect ${integrationMeta[type].label}?`)) return
    await fetch('/api/integrations/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    fetchIntegrations()
  }

  // Alias CRUD
  const connectedIntegrations = (Object.values(integrations).filter(Boolean) as Integration[]).filter((i) => i.status === 'connected')

  async function createAlias(e: React.FormEvent) {
    e.preventDefault()
    setAliasSaving(true)
    setAliasError(null)

    const res = await fetch('/api/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aliasForm),
    })

    if (res.ok) {
      setAliasForm({ name: '', integration_id: '', native_id: '', native_url: '', display_name: '' })
      setShowAliasForm(false)
      fetchAliases()
    } else {
      const data = await res.json()
      setAliasError(data.error ?? 'Failed to create alias')
    }
    setAliasSaving(false)
  }

  async function updateAlias(aliasId: string) {
    setAliasSaving(true)
    setAliasError(null)

    const res = await fetch(`/api/aliases/${aliasId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aliasForm),
    })

    if (res.ok) {
      setEditingAlias(null)
      setAliasForm({ name: '', integration_id: '', native_id: '', native_url: '', display_name: '' })
      fetchAliases()
    } else {
      const data = await res.json()
      setAliasError(data.error ?? 'Failed to update alias')
    }
    setAliasSaving(false)
  }

  async function deleteAlias(aliasId: string) {
    if (!confirm('Delete this alias? Any .mdspecmap referencing it will fail on next publish.')) return
    await fetch(`/api/aliases/${aliasId}`, { method: 'DELETE' })
    fetchAliases()
  }

  function startEditing(alias: AliasRow) {
    setEditingAlias(alias.id)
    setAliasForm({
      name: alias.name,
      integration_id: alias.integration_id,
      native_id: alias.native_id,
      native_url: alias.native_url ?? '',
      display_name: alias.display_name ?? '',
    })
    setShowAliasForm(false)
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Integrations</h1>

      {/* Integration cards */}
      <div className="space-y-4">
        {(Object.keys(integrationMeta) as IntegrationType[]).map((type) => {
          const meta = integrationMeta[type]
          const integration = integrations[type]
          const status = integration?.status ?? 'disconnected'

          return (
            <div key={type} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-semibold text-sm text-zinc-700 dark:text-zinc-300">
                    {meta.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{meta.label}</p>
                    <p className="text-xs text-zinc-500">{meta.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium capitalize ${statusColors[status]}`}>{status}</span>
                  {status !== 'disconnected' ? (
                    <button
                      onClick={() => disconnect(type)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => { setConnecting(connecting === type ? null : type); setUrlError(null) }}
                      className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>

              {connecting === type && (
                <form onSubmit={(e) => connect(type, e)} className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                  {type === 'notion' && (
                    <>
                      <Field label="Integration token" value={form.notion.token} onChange={(v) => setForm({ ...form, notion: { ...form.notion, token: v } })} placeholder="secret_..." />
                      <Field label="Root page ID" value={form.notion.root_page_id} onChange={(v) => setForm({ ...form, notion: { ...form.notion, root_page_id: v } })} placeholder="Notion page ID" />
                    </>
                  )}
                  {type === 'confluence' && (
                    <>
                      <Field label="Base URL" value={form.confluence.base_url} onChange={(v) => setForm({ ...form, confluence: { ...form.confluence, base_url: v } })} placeholder="https://mycompany.atlassian.net" />
                      <Field label="Email" value={form.confluence.email} onChange={(v) => setForm({ ...form, confluence: { ...form.confluence, email: v } })} placeholder="you@company.com" type="email" />
                      <Field label="API token" value={form.confluence.token} onChange={(v) => setForm({ ...form, confluence: { ...form.confluence, token: v } })} placeholder="Atlassian API token" />
                      <Field label="Space key" value={form.confluence.space_key} onChange={(v) => setForm({ ...form, confluence: { ...form.confluence, space_key: v } })} placeholder="ENG" />
                    </>
                  )}
                  {type === 'clickup' && (
                    <>
                      <Field
                        label="Personal API token"
                        value={form.clickup.api_token}
                        onChange={(v) => setForm({ ...form, clickup: { ...form.clickup, api_token: v } })}
                        placeholder="pk_..."
                      />
                      <Field
                        label="Workspace URL"
                        value={form.clickup.workspace_url}
                        onChange={(v) => { setForm({ ...form, clickup: { ...form.clickup, workspace_url: v } }); setUrlError(null) }}
                        placeholder="https://app.clickup.com/90181844797/..."
                      />
                      {form.clickup.workspace_url && (
                        <p className="text-xs text-zinc-400">
                          {parseClickUpWorkspaceId(form.clickup.workspace_url)
                            ? <>Workspace ID: <span className="font-mono text-zinc-600 dark:text-zinc-300">{parseClickUpWorkspaceId(form.clickup.workspace_url)}</span></>
                            : <span className="text-yellow-600">Paste your full ClickUp workspace URL to auto-detect the ID.</span>
                          }
                        </p>
                      )}
                      {urlError && <p className="text-xs text-red-500">{urlError}</p>}
                    </>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                      {saving ? 'Connecting…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => setConnecting(null)} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>

      {/* Aliases section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Aliases</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Aliases map human-readable names to target containers in your integrations. Reference them in <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">.mdspecmap</code> as the <code className="font-mono text-xs bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">parent</code> field.
            </p>
          </div>
          {connectedIntegrations.length > 0 && (
            <button
              onClick={() => { setShowAliasForm(!showAliasForm); setEditingAlias(null); setAliasError(null) }}
              className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              + New Alias
            </button>
          )}
        </div>

        {connectedIntegrations.length === 0 && (
          <p className="text-sm text-zinc-400 py-4">Connect an integration above to create aliases.</p>
        )}

        {/* Alias form (create) */}
        {showAliasForm && (
          <form onSubmit={createAlias} className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Alias name</label>
                <input
                  value={aliasForm.name}
                  onChange={(e) => setAliasForm({ ...aliasForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="eng-docs"
                  required
                  className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-500"
                />
                <p className="text-xs text-zinc-400 mt-1">Lowercase, hyphens allowed. Used in .mdspecmap.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Integration</label>
                <select
                  value={aliasForm.integration_id}
                  onChange={(e) => setAliasForm({ ...aliasForm, integration_id: e.target.value })}
                  required
                  className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                >
                  <option value="">Select integration</option>
                  {connectedIntegrations.map((i) => (
                    <option key={i.id} value={i.id}>{integrationMeta[i.type].label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Display name</label>
              <input
                value={aliasForm.display_name}
                onChange={(e) => setAliasForm({ ...aliasForm, display_name: e.target.value })}
                placeholder="Engineering Docs"
                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Native container ID</label>
              <input
                value={aliasForm.native_id}
                onChange={(e) => setAliasForm({ ...aliasForm, native_id: e.target.value })}
                placeholder="Page ID, space ID, or folder ID in the target tool"
                required
                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <p className="text-xs text-zinc-400 mt-1">The ID of the page, space, or folder where specs will be published.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">URL <span className="font-normal text-zinc-400">(optional)</span></label>
              <input
                value={aliasForm.native_url}
                onChange={(e) => setAliasForm({ ...aliasForm, native_url: e.target.value })}
                placeholder="https://notion.so/Engineering-abc123"
                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            {aliasError && <p className="text-xs text-red-500">{aliasError}</p>}
            <div className="flex gap-2">
              <button type="submit" disabled={aliasSaving} className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                {aliasSaving ? 'Creating…' : 'Create Alias'}
              </button>
              <button type="button" onClick={() => { setShowAliasForm(false); setAliasError(null) }} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Alias list */}
        {aliases.length > 0 && (
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800">
            {aliases.map((alias) => {
              const intType = alias.integrations?.type
              const isEditing = editingAlias === alias.id

              return (
                <div key={alias.id} className="p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Alias name" value={aliasForm.name} onChange={(v) => setAliasForm({ ...aliasForm, name: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="eng-docs" />
                        <Field label="Display name" value={aliasForm.display_name} onChange={(v) => setAliasForm({ ...aliasForm, display_name: v })} placeholder="Engineering Docs" />
                      </div>
                      <Field label="Native container ID" value={aliasForm.native_id} onChange={(v) => setAliasForm({ ...aliasForm, native_id: v })} placeholder="Page/folder ID" />
                      <Field label="URL" value={aliasForm.native_url} onChange={(v) => setAliasForm({ ...aliasForm, native_url: v })} placeholder="https://..." />
                      {aliasError && <p className="text-xs text-red-500">{aliasError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => updateAlias(alias.id)} disabled={aliasSaving} className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                          {aliasSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingAlias(null); setAliasError(null) }} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <code className="text-sm font-mono font-semibold text-zinc-900 dark:text-zinc-50">{alias.name}</code>
                        {intType && (
                          <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded capitalize">{intType}</span>
                        )}
                        {alias.display_name && (
                          <span className="text-xs text-zinc-500">{alias.display_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-zinc-400 max-w-48 truncate" title={alias.native_id}>{alias.native_id}</span>
                        <button onClick={() => startEditing(alias)} className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50">Edit</button>
                        <button onClick={() => deleteAlias(alias.id)} className="text-xs text-zinc-500 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {aliases.length === 0 && connectedIntegrations.length > 0 && !showAliasForm && (
          <p className="text-sm text-zinc-400 py-4">No aliases defined yet. Create one to reference it in your .mdspecmap file.</p>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
      />
    </div>
  )
}
