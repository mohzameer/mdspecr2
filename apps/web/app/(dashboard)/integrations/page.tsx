'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

type IntegrationType = 'notion' | 'confluence' | 'clickup'

interface Integration {
  id: string
  type: IntegrationType
  status: 'connected' | 'unhealthy' | 'disconnected'
  config: Record<string, unknown> | null
}

type ConnectForm = {
  notion: { token: string; root_page_id: string }
  confluence: { base_url: string; email: string; token: string; space_key: string }
  clickup: { api_token: string; workspace_id: string }
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
    clickup: { api_token: '', workspace_id: '' },
  })
  const [saving, setSaving] = useState(false)

  async function fetchIntegrations() {
    const res = await fetch('/api/integrations/list')
    if (res.ok) {
      const data: Integration[] = await res.json()
      const map = { notion: null, confluence: null, clickup: null } as Record<IntegrationType, Integration | null>
      data.forEach((i) => { map[i.type] = i })
      setIntegrations(map)
    }
  }

  useEffect(() => { fetchIntegrations() }, [])

  async function connect(type: IntegrationType, e: React.FormEvent) {
    e.preventDefault()
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

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Integrations</h1>
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
                      onClick={() => setConnecting(connecting === type ? null : type)}
                      className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>

              {/* Connect forms */}
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
                      <Field label="Personal API token" value={form.clickup.api_token} onChange={(v) => setForm({ ...form, clickup: { ...form.clickup, api_token: v } })} placeholder="pk_..." />
                      <Field label="Workspace ID" value={form.clickup.workspace_id} onChange={(v) => setForm({ ...form, clickup: { ...form.clickup, workspace_id: v } })} placeholder="ClickUp workspace ID" />
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
