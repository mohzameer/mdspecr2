/**
 * GET /api/integrations/clickup/callback
 *
 * Covers:
 *   - Unauthenticated → redirect to /auth/login
 *   - Missing code → error=clickup_denied redirect
 *   - Missing nonce cookie → error=clickup_denied redirect
 *   - Token exchange failure → error=clickup_token redirect
 *   - Workspace fetch failure → error=clickup_token redirect
 *   - No workspaces → error=clickup_no_workspace redirect
 *   - Single workspace, missing org cookie → error=clickup_token redirect
 *   - Single workspace → upserts integration, redirects clickup=connected
 *   - Single workspace, existing secret → old secret deleted
 *   - Multiple workspaces → sets clickup_pending cookie, redirects setup=clickup
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  process.env.CLICKUP_CLIENT_ID = 'test-client-id'
  process.env.CLICKUP_CLIENT_SECRET = 'test-secret'
})

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

vi.mock('@/lib/credentials', () => ({
  storeCredentials: vi.fn().mockResolvedValue('sec-new'),
  deleteCredentials: vi.fn().mockResolvedValue(undefined),
}))

const mockCookieStore = vi.hoisted(() => {
  let cookieValues: Record<string, string> = {}
  return {
    get: vi.fn((key: string) => cookieValues[key] ? { value: cookieValues[key] } : undefined),
    set: vi.fn((key: string, value: string) => { cookieValues[key] = value }),
    delete: vi.fn((key: string) => { delete cookieValues[key] }),
    _reset: (values: Record<string, string> = {}) => { cookieValues = { ...values } },
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}))

import { GET } from '../route.js'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { storeCredentials, deleteCredentials } from '@/lib/credentials'

function makeServerClient(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
}

function makeServiceClient(existingSecretId: string | null = null) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'upsert', 'maybeSingle']) chain[m] = vi.fn().mockReturnValue(chain)
  chain.maybeSingle = vi.fn().mockResolvedValue({
    data: existingSecretId ? { credentials_secret_id: existingSecretId } : null,
    error: null,
  })
  return { from: vi.fn().mockReturnValue(chain), rpc: vi.fn() }
}

function makeReq(code?: string) {
  const url = code
    ? `http://localhost:3000/api/integrations/clickup/callback?code=${code}`
    : 'http://localhost:3000/api/integrations/clickup/callback'
  return new Request(url)
}

function mockFetch(responses: Array<{ ok: boolean; body?: unknown }>) {
  let i = 0
  return vi.fn().mockImplementation(() => {
    const r = responses[i++] ?? { ok: false }
    return Promise.resolve({
      ok: r.ok,
      json: () => Promise.resolve(r.body ?? {}),
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCookieStore._reset({ clickup_oauth_nonce: 'test-nonce', current_org_id: 'org-111' })
  vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient({ id: 'u1' }) as never)
  vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
  vi.mocked(storeCredentials).mockResolvedValue('sec-new')
  vi.mocked(deleteCredentials).mockResolvedValue(undefined)
})

describe('GET /api/integrations/clickup/callback', () => {
  it('redirects unauthenticated user to /auth/login', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await GET(makeReq('some-code') as never)

    expect(res.headers.get('location')).toContain('/auth/login')
  })

  it('redirects with error=clickup_denied when code is missing', async () => {
    const res = await GET(makeReq() as never)

    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('error=clickup_denied')
  })

  it('redirects with error=clickup_denied when nonce cookie is missing', async () => {
    mockCookieStore._reset({ current_org_id: 'org-111' })

    const res = await GET(makeReq('some-code') as never)

    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('error=clickup_denied')
  })

  it('deletes the nonce cookie regardless of outcome', async () => {
    globalThis.fetch = mockFetch([{ ok: false }])

    await GET(makeReq('some-code') as never)

    expect(mockCookieStore.delete).toHaveBeenCalledWith('clickup_oauth_nonce')
  })

  it('redirects with error=clickup_token when token exchange fails', async () => {
    globalThis.fetch = mockFetch([{ ok: false }])

    const res = await GET(makeReq('some-code') as never)

    expect(res.headers.get('location')).toContain('error=clickup_token')
  })

  it('redirects with error=clickup_token when workspace fetch fails', async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: { access_token: 'tok' } },
      { ok: false },
    ])

    const res = await GET(makeReq('some-code') as never)

    expect(res.headers.get('location')).toContain('error=clickup_token')
  })

  it('redirects with error=clickup_no_workspace when teams array is empty', async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: { access_token: 'tok' } },
      { ok: true, body: { teams: [] } },
    ])

    const res = await GET(makeReq('some-code') as never)

    expect(res.headers.get('location')).toContain('error=clickup_no_workspace')
  })

  it('redirects with error=clickup_token when org cookie is missing (single workspace)', async () => {
    mockCookieStore._reset({ clickup_oauth_nonce: 'test-nonce' })
    globalThis.fetch = mockFetch([
      { ok: true, body: { access_token: 'tok' } },
      { ok: true, body: { teams: [{ id: 'ws-1', name: 'Workspace' }] } },
    ])

    const res = await GET(makeReq('some-code') as never)

    expect(res.headers.get('location')).toContain('error=clickup_token')
  })

  it('upserts integration and redirects clickup=connected for single workspace', async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: { access_token: 'pk_token' } },
      { ok: true, body: { teams: [{ id: 'ws-1', name: 'My Workspace' }] } },
    ])
    const svc = makeServiceClient()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await GET(makeReq('code-abc') as never)

    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('clickup=connected')
    expect(storeCredentials).toHaveBeenCalledWith(
      svc,
      JSON.stringify({ api_token: 'pk_token', workspace_id: 'ws-1' }),
      expect.stringContaining('integration:org-111:clickup:')
    )
    expect(svc.from).toHaveBeenCalledWith('integrations')
  })

  it('deletes old secret when one already exists', async () => {
    globalThis.fetch = mockFetch([
      { ok: true, body: { access_token: 'pk_token' } },
      { ok: true, body: { teams: [{ id: 'ws-1', name: 'My Workspace' }] } },
    ])
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient('sec-old') as never)

    await GET(makeReq('code-abc') as never)

    expect(deleteCredentials).toHaveBeenCalledWith(expect.anything(), 'sec-old')
  })

  it('sets clickup_pending cookie and redirects setup=clickup for multiple workspaces', async () => {
    const workspaces = [
      { id: 'ws-1', name: 'Workspace One' },
      { id: 'ws-2', name: 'Workspace Two' },
    ]
    globalThis.fetch = mockFetch([
      { ok: true, body: { access_token: 'pk_multi' } },
      { ok: true, body: { teams: workspaces } },
    ])

    const res = await GET(makeReq('code-multi') as never)

    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('setup=clickup')

    const pendingCall = mockCookieStore.set.mock.calls.find(c => c[0] === 'clickup_pending')
    expect(pendingCall).toBeDefined()
    const pending = JSON.parse(pendingCall![1])
    expect(pending.token).toBe('pk_multi')
    expect(pending.workspaces).toEqual(workspaces)
    expect(storeCredentials).not.toHaveBeenCalled()
  })
})
