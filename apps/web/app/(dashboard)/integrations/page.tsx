'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

type IntegrationType = 'notion' | 'confluence' | 'clickup' | 's3'

interface Integration {
  id: string
  type: IntegrationType
  status: 'connected' | 'unhealthy' | 'disconnected'
  config: Record<string, unknown> | null
}

type ConnectForm = {
  notion: {
    token: string
    root_page_id: string
  }
  confluence: { space_url: string; base_url: string; email: string; token: string; space_key: string }
  clickup: { api_token: string; workspace_url: string }
  s3: { access_key_id: string; secret_access_key: string; bucket: string; region: string }
}

type NotionSharedItem = { id: string; title: string; url?: string }

function parseClickUpWorkspaceId(url: string): string | null {
  const match = url.match(/app\.clickup\.com\/(\d+)/)
  return match ? match[1] : null
}

function parseConfluenceSpaceUrl(url: string): { base_url: string; space_key: string } | null {
  try {
    const u = new URL(url.trim())
    if (!u.protocol.startsWith('http')) return null
    const base_url = `${u.protocol}//${u.host}`
    const match = u.pathname.match(/\/wiki\/spaces\/([^/]+)/)
    return { base_url, space_key: match ? match[1] : '' }
  } catch {
    return null
  }
}

function formatNotionUuid(hex: string): string {
  const h = hex.toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function parseNotionInput(input: string): { id: string; isDatabase: boolean } | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return { id: trimmed.toLowerCase(), isDatabase: false }
  }
  if (/^[0-9a-f]{32}$/i.test(trimmed)) {
    return { id: formatNotionUuid(trimmed), isDatabase: false }
  }
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes('notion.so')) {
    const urlMatch = trimmed.match(/([0-9a-f]{32})(?:[^0-9a-f]|$)/i)
    if (urlMatch) {
      return { id: formatNotionUuid(urlMatch[1]), isDatabase: /[?&]v=/.test(trimmed) }
    }
    return null
  }
  return { id: trimmed, isDatabase: false }
}

const integrationMeta: Record<IntegrationType, { label: string; description: string }> = {
  notion: { label: 'Notion', description: 'Publish specs as nested sub-pages in a Notion workspace.' },
  confluence: { label: 'Confluence', description: 'Publish specs as a page tree in a Confluence space.' },
  clickup: { label: 'ClickUp', description: 'Publish specs as ClickUp Docs in your workspace.' },
  s3: { label: 'Amazon S3', description: 'Publish specs as static markdown files in an S3 bucket.' },
}

const statusColors: Record<string, string> = {
  connected: 'text-green-600 dark:text-green-400',
  unhealthy: 'text-yellow-600 dark:text-yellow-400',
  disconnected: 'text-zinc-400',
}

const INTEGRATION_ORDER: IntegrationType[] = ['clickup', 's3', 'notion', 'confluence']

const DISABLED_INTEGRATIONS = new Set<IntegrationType>([])

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Record<IntegrationType, Integration | null>>({
    notion: null, confluence: null, clickup: null, s3: null,
  })
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<IntegrationType | null>(null)
  const [form, setForm] = useState<ConnectForm>({
    notion: { token: '', root_page_id: '' },
    confluence: { space_url: '', base_url: '', email: '', token: '', space_key: '' },
    clickup: { api_token: '', workspace_url: '' },
    s3: { access_key_id: '', secret_access_key: '', bucket: '', region: '' },
  })
  const [saving, setSaving] = useState(false)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [s3ValidateError, setS3ValidateError] = useState<string | null>(null)
  const [notionValidateError, setNotionValidateError] = useState<string | null>(null)
  const [confluenceValidateError, setConfluenceValidateError] = useState<string | null>(null)
  const [notionChildren, setNotionChildren] = useState<NotionSharedItem[] | null>(null)
  const [loadingChildren, setLoadingChildren] = useState(false)
  const [childrenError, setChildrenError] = useState<string | null>(null)
  const [notionSubPageId, setNotionSubPageId] = useState<string>('')
  const loadedParentRef = useRef<string | null>(null)
  const [notionOAuthSetup, setNotionOAuthSetup] = useState(false)
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [notionSharedItems, setNotionSharedItems] = useState<{ pages: NotionSharedItem[] } | null>(null)
  const [loadingShared, setLoadingShared] = useState(false)
  const [clickupOAuthSetup, setClickupOAuthSetup] = useState(false)
  const [clickupWorkspaces, setClickupWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [clickupPendingToken, setClickupPendingToken] = useState<string>('')
  const [clickupWorkspaceId, setClickupWorkspaceId] = useState<string>('')
  const [confluenceOAuthSetup, setConfluenceOAuthSetup] = useState(false)
  const [confluencePending, setConfluencePending] = useState<{ access_token: string; refresh_token: string; expires_at: string } | null>(null)
  const [confluenceSites, setConfluenceSites] = useState<{ id: string; url: string; name: string }[]>([])
  const [confluenceSelectedSite, setConfluenceSelectedSite] = useState<{ id: string; url: string; name: string } | null>(null)
  const [confluenceSpaces, setConfluenceSpaces] = useState<{ key: string; name: string }[]>([])
  const [confluenceLoadingSpaces, setConfluenceLoadingSpaces] = useState(false)
  const [confluenceSpaceKey, setConfluenceSpaceKey] = useState<string>('')
  const searchParams = useSearchParams()

  useEffect(() => {
    const setup = searchParams.get('setup')
    const error = searchParams.get('error')
    const clickup = searchParams.get('clickup')

    if (error === 'notion_denied') setOauthError('Notion authorization was cancelled.')
    if (error === 'notion_state') setOauthError('Authorization failed (state mismatch). Please try again.')
    if (error === 'notion_token') setOauthError('Could not exchange the Notion authorization code. Please try again.')
    if (error === 'clickup_denied') setOauthError('ClickUp authorization was cancelled.')
    if (error === 'clickup_token') setOauthError('Could not connect to ClickUp. Please try again.')
    if (error === 'clickup_no_workspace') setOauthError('No ClickUp workspaces found on this account.')
    if (error === 'confluence_denied') setOauthError('Confluence authorization was cancelled.')
    if (error === 'confluence_state') setOauthError('Authorization failed (state mismatch). Please try again.')
    if (error === 'confluence_token') setOauthError('Could not connect to Confluence. Please try again.')
    if (error === 'confluence_no_site') setOauthError('No Confluence sites found on this Atlassian account.')

    if (clickup === 'connected') {
      fetchIntegrations()
      window.history.replaceState({}, '', '/integrations')
      return
    }

    if (setup === 'clickup') {
      setClickupOAuthSetup(true)
      setConnecting('clickup')
      fetch('/api/integrations/clickup/pending')
        .then(async (r) => {
          if (!r.ok) throw new Error()
          return r.json()
        })
        .then((data) => {
          setClickupPendingToken(data.token)
          setClickupWorkspaces(data.workspaces ?? [])
          if (data.workspaces?.length === 1) setClickupWorkspaceId(data.workspaces[0].id)
        })
        .catch(() => setOauthError('Session expired or cookies were cleared. Please click Connect again.'))
      return
    }

    if (setup === 'confluence') {
      setConfluenceOAuthSetup(true)
      setConnecting('confluence')
      fetch('/api/integrations/confluence/pending')
        .then(async (r) => {
          if (!r.ok) throw new Error()
          return r.json()
        })
        .then((data) => {
          const { access_token, refresh_token, expires_at, sites } = data
          setConfluencePending({ access_token, refresh_token, expires_at })
          setConfluenceSites(sites ?? [])
        })
        .catch(() => setOauthError('Session expired or cookies were cleared. Please click Connect again.'))
      return
    }

    if (setup !== 'notion') return
    setNotionOAuthSetup(true)
    setConnecting('notion')

    fetch('/api/integrations/notion/pending-token')
      .then(async (r) => {
        if (!r.ok) throw new Error('no pending token')
        return r.json()
      })
      .then((data) => {
        if (data.token) {
          setForm((f) => ({ ...f, notion: { ...f.notion, token: data.token } }))
        }
      })
      .catch(() => setOauthError('Session expired or cookies were cleared. Please click Connect again.'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadConfluenceSpaces(accessToken: string, cloudId: string) {
    setConfluenceLoadingSpaces(true)
    setConfluenceSpaces([])
    setConfluenceSpaceKey('')
    fetch('/api/integrations/confluence/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, cloud_id: cloudId }),
    })
      .then(async (r) => {
        const data = await r.json()
        if (data.ok) setConfluenceSpaces(data.spaces ?? [])
        else setConfluenceValidateError(data.error ?? 'Could not load spaces.')
      })
      .catch(() => setConfluenceValidateError('Could not load spaces — network error.'))
      .finally(() => setConfluenceLoadingSpaces(false))
  }

  function resetNotionChildren() {
    setNotionChildren(null)
    setChildrenError(null)
    setNotionSubPageId('')
    loadedParentRef.current = null
  }

  useEffect(() => {
    if (!notionOAuthSetup || !form.notion.token) return
    setLoadingShared(true)
    fetch('/api/integrations/notion/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: form.notion.token }),
    })
      .then((r) => r.json())
      .then((data) => { if (data.ok) setNotionSharedItems({ pages: data.pages ?? [] }) })
      .catch(() => {})
      .finally(() => setLoadingShared(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notionOAuthSetup, form.notion.token])

  useEffect(() => {
    if (!form.notion.token) return
    const parsed = parseNotionInput(form.notion.root_page_id)
    if (!parsed) return
    if (loadedParentRef.current === parsed.id) return

    let cancelled = false
    const token = form.notion.token
    loadedParentRef.current = parsed.id
    setLoadingChildren(true)
    setChildrenError(null)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/integrations/notion/children', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, parent_id: parsed.id, parent_kind: 'page' }),
        })
        const body = await res.json()
        if (cancelled) return
        if (!body.ok) {
          setChildrenError(body.error ?? 'Could not load sub-pages.')
          setNotionChildren(null)
        } else {
          setNotionChildren(body.pages)
        }
      } catch {
        if (!cancelled) setChildrenError('Could not load sub-pages.')
      } finally {
        if (!cancelled) setLoadingChildren(false)
      }
    }, 400)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [form.notion.token, form.notion.root_page_id])


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
    setNotionValidateError(null)

    if (type === 'notion') {
      setSaving(true)
      const { token, root_page_id } = form.notion
      const parsedRoot = root_page_id ? parseNotionInput(root_page_id) : null
      if (!parsedRoot) {
        setNotionValidateError('Could not extract a Notion page ID. Paste the page URL or its ID.')
        setSaving(false)
        return
      }
      const resolvedRootId = notionSubPageId || parsedRoot.id
      const validateRes = await fetch('/api/integrations/notion/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, root_page_id: resolvedRootId, oauth_flow: notionOAuthSetup || undefined }),
      })
      const validateBody = await validateRes.json()
      if (!validateBody.ok) {
        setNotionValidateError(validateBody.error ?? 'Could not validate Notion credentials.')
        setSaving(false)
        return
      }
      const credentials = { token, root_page_id: resolvedRootId }
      await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, credentials: JSON.stringify(credentials), config: credentials }),
      })
      await fetchIntegrations()
      setConnecting(null)
      setSaving(false)
      setNotionOAuthSetup(false)
      window.history.replaceState({}, '', '/integrations')
      return
    }

    if (type === 'clickup') {
      if (clickupOAuthSetup) {
        if (!clickupWorkspaceId) {
          setUrlError('Select a workspace to continue.')
          return
        }
        setSaving(true)
        const credentials = { api_token: clickupPendingToken, workspace_id: clickupWorkspaceId }
        await fetch('/api/integrations/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, credentials: JSON.stringify(credentials), config: credentials }),
        })
        await fetchIntegrations()
        setConnecting(null)
        setSaving(false)
        setClickupOAuthSetup(false)
        setClickupWorkspaces([])
        setClickupPendingToken('')
        setClickupWorkspaceId('')
        window.history.replaceState({}, '', '/integrations')
        return
      }

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

    if (type === 'confluence' && confluenceOAuthSetup) {
      if (!confluenceSelectedSite || !confluenceSpaceKey) {
        setConfluenceValidateError('Select a site and space to continue.')
        return
      }
      setSaving(true)
      const credentials = {
        ...confluencePending,
        base_url: confluenceSelectedSite.url,
        cloud_id: confluenceSelectedSite.id,
        space_key: confluenceSpaceKey,
      }
      await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, credentials: JSON.stringify(credentials), config: { base_url: confluenceSelectedSite.url, space_key: confluenceSpaceKey } }),
      })
      await fetchIntegrations()
      setConnecting(null)
      setSaving(false)
      setConfluenceOAuthSetup(false)
      setConfluencePending(null)
      setConfluenceSites([])
      setConfluenceSelectedSite(null)
      setConfluenceSpaces([])
      setConfluenceSpaceKey('')
      window.history.replaceState({}, '', '/integrations')
      return
    }

    if (type === 'confluence') {
      setSaving(true)
      const { base_url, email, token, space_key } = form.confluence
      const creds = { base_url, email, token, space_key }
      const validateRes = await fetch('/api/integrations/confluence/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const validateBody = await validateRes.json()
      if (!validateBody.ok) {
        setConfluenceValidateError(validateBody.error ?? 'Could not reach Confluence. Check your credentials.')
        setSaving(false)
        return
      }
      await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, credentials: JSON.stringify(creds), config: creds }),
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
                      {status === 'disconnected' ? (
                        type === 'notion' ? (
                          <a
                            href="/api/integrations/notion/authorize"
                            className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                          >
                            Connect
                          </a>
                        ) : type === 'clickup' ? (
                          <a
                            href="/api/integrations/clickup/authorize"
                            className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                          >
                            Connect
                          </a>
                        ) : type === 'confluence' ? (
                          <a
                            href="/api/integrations/confluence/authorize"
                            className="rounded-md bg-zinc-900 dark:bg-zinc-50 px-3 py-1.5 text-xs font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
                          >
                            Connect
                          </a>
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
                        )
                      ) : (
                        <>
                          {status === 'unhealthy' && (
                            type === 'notion' ? (
                              <a
                                href="/api/integrations/notion/authorize"
                                className="rounded-md bg-yellow-600 hover:bg-yellow-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                              >
                                Reconnect
                              </a>
                            ) : type === 'clickup' ? (
                              <a
                                href="/api/integrations/clickup/authorize"
                                className="rounded-md bg-yellow-600 hover:bg-yellow-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                              >
                                Reconnect
                              </a>
                            ) : (
                              <button
                                onClick={() => {
                                  setConnecting(connecting === type ? null : type)
                                  setUrlError(null)
                                  setS3ValidateError(null)
                                }}
                                className="rounded-md bg-yellow-600 hover:bg-yellow-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                              >
                                Reconnect
                              </button>
                            )
                          )}
                          <button
                            onClick={() => disconnect(type)}
                            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
                          >
                            Disconnect
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!disabled && connecting === type && (
                <form onSubmit={(e) => connect(type, e)} className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                  {type === 'notion' && (
                    <>
                      {oauthError && <p className="text-xs text-red-500">{oauthError}</p>}
                      {notionOAuthSetup ? (
                        <>
                          <p className="text-xs text-zinc-500">
                            {form.notion.token
                              ? <span className="text-green-600 dark:text-green-400">Notion authorized via OAuth.</span>
                              : 'Loading authorization…'}
                          </p>
                          {form.notion.token && (
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Default root page</label>
                              <select
                                required
                                disabled={loadingShared}
                                value={form.notion.root_page_id ? `page:${form.notion.root_page_id}` : ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setNotionValidateError(null); resetNotionChildren()
                                  setForm({ ...form, notion: { ...form.notion, root_page_id: val.startsWith('page:') ? val.slice('page:'.length) : '' } })
                                }}
                                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                              >
                                <option value="">{loadingShared ? 'Loading pages…' : 'Select a page…'}</option>
                                {notionSharedItems?.pages.map((p) => (
                                  <option key={p.id} value={`page:${p.id}`}>{p.title}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </>
                      ) : (
                        <Field label="Integration token" value={form.notion.token} onChange={(v) => { setForm({ ...form, notion: { ...form.notion, token: v, root_page_id: '' } }); setNotionValidateError(null); resetNotionChildren() }} placeholder="ntn_... or secret_..." />
                      )}
                      {!notionOAuthSetup && (
                        <>
                          <Field
                            label="Root page link or ID"
                            value={form.notion.root_page_id}
                            onChange={(v) => {
                              setForm({ ...form, notion: { ...form.notion, root_page_id: v } })
                              setNotionValidateError(null); resetNotionChildren()
                            }}
                            placeholder="Paste a Notion page link or ID"
                          />
                          {(() => {
                            const v = form.notion.root_page_id
                            if (!v) return null
                            const parsed = parseNotionInput(v)
                            if (!parsed) return <p className="text-xs text-yellow-600">Could not extract an ID. Paste the page URL or its 32-char ID.</p>
                            return (
                              <p className="text-xs text-zinc-400">
                                Page ID: <span className="font-mono text-zinc-600 dark:text-zinc-300">{parsed.id}</span>
                              </p>
                            )
                          })()}
                        </>
                      )}
                      {(() => {
                        const parsed = parseNotionInput(form.notion.root_page_id)
                        if (!parsed) return null
                        return (
                          <div>
                            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Publish under sub-page <span className="font-normal text-zinc-400">(optional)</span></label>
                            <select
                              value={notionSubPageId}
                              onChange={(e) => {
                                setNotionSubPageId(e.target.value)
                                setNotionValidateError(null)
                              }}
                              disabled={loadingChildren || !notionChildren || notionChildren.length === 0}
                              className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                            >
                              <option value="">
                                {loadingChildren
                                  ? 'Loading pages…'
                                  : childrenError
                                  ? 'Could not load pages'
                                  : !notionChildren || notionChildren.length === 0
                                  ? 'Publish directly under root page'
                                  : 'Publish directly under root page'}
                              </option>
                              {notionChildren?.map((p) => (
                                <option key={p.id} value={p.id}>{p.title}</option>
                              ))}
                            </select>
                            {childrenError && <p className="text-xs text-red-500 mt-1">{childrenError}</p>}
                            <p className="text-xs text-zinc-400 mt-1.5">
                              To publish to a specific section of your workspace, create a dedicated page in Notion and share it with this integration. It will appear here after re-authorizing.
                            </p>
                          </div>
                        )
                      })()}
                      {notionValidateError && <p className="text-xs text-red-500">{notionValidateError}</p>}
                      <p className="text-xs text-zinc-400">Credentials are verified against the Notion API before saving.</p>
                    </>
                  )}
                  {type === 'confluence' && (
                    <>
                      {confluenceOAuthSetup ? (
                        <>
                          <p className="text-xs text-green-600 dark:text-green-400">Confluence authorized via OAuth.</p>
                          {confluenceSites.length > 0 && (
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Atlassian site</label>
                              <select
                                required
                                value={confluenceSelectedSite?.id ?? ''}
                                onChange={(e) => {
                                  const site = confluenceSites.find((s) => s.id === e.target.value) ?? null
                                  setConfluenceSelectedSite(site)
                                  setConfluenceValidateError(null)
                                  if (site && confluencePending) loadConfluenceSpaces(confluencePending.access_token, site.id)
                                }}
                                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                              >
                                <option value="">Select a site…</option>
                                {confluenceSites.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name} — {s.url}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {confluenceSelectedSite && (
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Space</label>
                              <select
                                required
                                value={confluenceSpaceKey}
                                onChange={(e) => { setConfluenceSpaceKey(e.target.value); setConfluenceValidateError(null) }}
                                disabled={confluenceLoadingSpaces || confluenceSpaces.length === 0}
                                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                              >
                                <option value="">{confluenceLoadingSpaces ? 'Loading spaces…' : confluenceSpaces.length === 0 ? 'No spaces found' : 'Select a space…'}</option>
                                {confluenceSpaces.map((s) => (
                                  <option key={s.key} value={s.key}>{s.name} ({s.key})</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {confluenceValidateError && <p className="text-xs text-red-500">{confluenceValidateError}</p>}
                        </>
                      ) : (
                        <>
                          <Field
                            label="Space URL"
                            value={form.confluence.space_url}
                            onChange={(v) => {
                              const parsed = parseConfluenceSpaceUrl(v)
                              setForm({ ...form, confluence: { ...form.confluence, space_url: v, base_url: parsed?.base_url ?? form.confluence.base_url, space_key: parsed?.space_key || form.confluence.space_key } })
                              setConfluenceValidateError(null)
                            }}
                            placeholder="https://mycompany.atlassian.net/wiki/spaces/ENG/..."
                          />
                          <Field label="Email" value={form.confluence.email} onChange={(v) => { setForm({ ...form, confluence: { ...form.confluence, email: v } }); setConfluenceValidateError(null) }} placeholder="you@company.com" type="email" />
                          <Field label="API token" value={form.confluence.token} onChange={(v) => { setForm({ ...form, confluence: { ...form.confluence, token: v } }); setConfluenceValidateError(null) }} placeholder="Atlassian API token" />
                          <Field label="Space key" value={form.confluence.space_key} onChange={(v) => { setForm({ ...form, confluence: { ...form.confluence, space_key: v } }); setConfluenceValidateError(null) }} placeholder="ENG" />
                          {confluenceValidateError && <p className="text-xs text-red-500">{confluenceValidateError}</p>}
                          <p className="text-xs text-zinc-400">Credentials are verified against the Confluence API before saving.</p>
                        </>
                      )}
                    </>
                  )}
                  {type === 'clickup' && (
                    <>
                      {clickupOAuthSetup ? (
                        <>
                          <p className="text-xs text-green-600 dark:text-green-400">ClickUp authorized via OAuth.</p>
                          {clickupWorkspaces.length > 1 && (
                            <div>
                              <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">Workspace</label>
                              <select
                                required
                                value={clickupWorkspaceId}
                                onChange={(e) => { setClickupWorkspaceId(e.target.value); setUrlError(null) }}
                                className="block w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-500"
                              >
                                <option value="">Select a workspace…</option>
                                {clickupWorkspaces.map((w) => (
                                  <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                          {urlError && <p className="text-xs text-red-500">{urlError}</p>}
                        </>
                      ) : (
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
                      {saving ? (type === 's3' || type === 'confluence' ? 'Verifying…' : 'Connecting…') : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setConnecting(null); setS3ValidateError(null); setConfluenceValidateError(null); resetNotionChildren(); setNotionOAuthSetup(false); setNotionSharedItems(null); setOauthError(null); setClickupOAuthSetup(false); setClickupWorkspaces([]); setClickupPendingToken(''); setClickupWorkspaceId(''); setConfluenceOAuthSetup(false); setConfluencePending(null); setConfluenceSites([]); setConfluenceSelectedSite(null); setConfluenceSpaces([]); setConfluenceSpaceKey(''); window.history.replaceState({}, '', '/integrations') }} className="rounded-md border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-400">
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
