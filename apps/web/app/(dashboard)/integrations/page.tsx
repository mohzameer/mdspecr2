'use client'

import { useState, useEffect } from 'react'

type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3'

interface Integration {
  id: string
  type: IntegrationType
  status: 'connected' | 'unhealthy' | 'disconnected'
  config: Record<string, unknown> | null
}

type ConnectForm = {
  notion: { token: string; root_page_id: string }
  confluence: { base_url: string; email: string; token: string; space_key: string }
  clickup: { api_token: string; workspace_url: string }
  s3: { access_key_id: string; secret_access_key: string; bucket: string; region: string }
}

function parseClickUpWorkspaceId(url: string): string | null {
  const match = url.match(/app\.clickup\.com\/(\d+)/)
  return match ? match[1] : null
}

const integrationMeta: Record<IntegrationType, { label: string; description: string; icon: string }> = {
  notion: { label: 'Notion', description: 'Publish specs as nested sub-pages in a Notion workspace.', icon: 'N' },
  confluence: { label: 'Confluence', description: 'Publish specs as a page tree in a Confluence space.', icon: 'C' },
  clickup: { label: 'ClickUp', description: 'Publish specs as ClickUp Docs in your workspace.', icon: '✓' },
  s3: { label: 'Amazon S3', description: 'Publish specs as static markdown or HTML files in an S3 bucket.', icon: 'S3' },
}

const statusColors: Record<string, string> = {
  connected: 'text-green-600 dark:text-green-400',
  unhealthy: 'text-yellow-600 dark:text-yellow-400',
  disconnected: 'text-zinc-400',
}

const INTEGRATION_ORDER: IntegrationType[] = ['clickup', 's3', 'notion', 'confluence']

const DISABLED_INTEGRATIONS = new Set<IntegrationType>(['notion', 'confluence'])

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<IntegrationType, Integration | null>>({
    notion: null, confluence: null, clickup: null, s3: null,
  })
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<IntegrationType | null>(null)
  const [form, setForm] = useState<ConnectForm>({
    notion: { token: '', root_page_id: '' },
    confluence: { base_url: '', email: '', token: '', space_key: '' },
    clickup: { api_token: '', workspace_url: '' },
    s3: { access_key_id: '', secret_access_key: '', bucket: '', region: '' },
  })
  const [saving, setSaving] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [s3ValidateError, setS3ValidateError] = useState<string | null>(null)

  async function fetchIntegrations() {
    setLoading(true)
    const res = await fetch('/api/integrations/list')
    if (res.ok) {
      const data: Integration[] = await res.json()
      const map = { notion: null, confluence: null, clickup: null, s3: null } as Record<IntegrationType, Integration | null>
      data.forEach((i) => { map[i.type] = i })
      setIntegrations(map)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchIntegrations()
  }, [])

  async function connect(type: IntegrationType, e: React.FormEvent) {
    e.preventDefault()
    setS3ValidateError(null)

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

    if (type === 's3') {
      setSaving(true)
      const creds = form.s3
      const validateRes = await fetch('/api/integrations/s3/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const validateBody = await validateRes.json()
      if (!validateBody.ok) {
        setS3ValidateError(validateBody.error ?? 'Could not reach the bucket. Check your credentials.')
        setSaving(false)
        return
      }
      await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, credentials: JSON.stringify(creds) }),
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

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">Integrations</h1>

      <div className="space-y-4">
        {INTEGRATION_ORDER.map((type) => {
          const meta = integrationMeta[type]
          const integration = integrations[type]
          const status = integration?.status ?? 'disconnected'
          const disabled = DISABLED_INTEGRATIONS.has(type)

          return (
            <div key={type} className={`rounded-lg border p-5 ${disabled ? 'border-zinc-100 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/50 opacity-60' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'}`}>
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
                  {disabled ? (
                    <span className="text-xs text-zinc-400 dark:text-zinc-600">Coming soon</span>
                  ) : loading ? (
                    <span className="inline-block h-3 w-16 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
                  ) : (
                    <>
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
                          onClick={() => {
                            setConnecting(connecting === type ? null : type)
                            setUrlError(null)
                            setS3ValidateError(null)
                          }}
                          className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                        >
                          Connect
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!disabled && connecting === type && (
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
                  {type === 's3' && (
                    <>
                      <Field label="Access key ID" value={form.s3.access_key_id} onChange={(v) => { setForm({ ...form, s3: { ...form.s3, access_key_id: v } }); setS3ValidateError(null) }} placeholder="AKIAIOSFODNN7EXAMPLE" />
                      <Field label="Secret access key" value={form.s3.secret_access_key} onChange={(v) => { setForm({ ...form, s3: { ...form.s3, secret_access_key: v } }); setS3ValidateError(null) }} placeholder="wJalrXUtnFEMI/K7MDENG/..." type="password" />
                      <Field label="Bucket" value={form.s3.bucket} onChange={(v) => { setForm({ ...form, s3: { ...form.s3, bucket: v } }); setS3ValidateError(null) }} placeholder="my-specs-bucket" />
                      <Field label="Region" value={form.s3.region} onChange={(v) => { setForm({ ...form, s3: { ...form.s3, region: v } }); setS3ValidateError(null) }} placeholder="us-east-1" />
                      {s3ValidateError && <p className="text-xs text-red-500">{s3ValidateError}</p>}
                      <p className="text-xs text-zinc-400">Credentials are verified against the bucket before saving.</p>
                    </>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 disabled:opacity-50">
                      {saving ? (type === 's3' ? 'Verifying…' : 'Connecting…') : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setConnecting(null); setS3ValidateError(null) }} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
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
