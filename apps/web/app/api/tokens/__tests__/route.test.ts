/**
 * Section 2.5 — Tokens
 * Section 2.6 — Organizations
 * Section 2.7 — Integrations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain } from '../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed') },
  hash: vi.fn().mockResolvedValue('hashed'),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: 'org-111' }),
  }),
}))

import { POST as generateToken } from '../generate/route.js'
import { POST as createOrg } from '../../org/create/route.js'
import { POST as connectIntegration } from '../../integrations/connect/route.js'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

const USER = { id: 'user-1' }
const PROJECT_ID = 'abcd1234-0000-0000-0000-000000000000'
const ORG_ID = 'org-111'

function makeServerMock(user: typeof USER | null, tableMap: Record<string, { data: unknown; error: unknown }> = {}) {
  return {
    from: vi.fn((table: string) => makeChain(tableMap[table] ?? { data: null, error: null })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function makeServiceMock(tableMap: Record<string, { data: unknown; error: unknown }> = {}) {
  return {
    from: vi.fn((table: string) => makeChain(tableMap[table] ?? { data: null, error: null })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// 2.5 Tokens
// ---------------------------------------------------------------------------

describe('2.5 Tokens', () => {
  function tokenReq(body: unknown) {
    return new Request('http://localhost/api/tokens/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('2.5.1 generate token returns 201 with raw token when < 3 active', async () => {
    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const svc = makeServiceMock()
    // Call order: projects → org_members → project_members → project_tokens(count) → project_tokens(insert)
    svc.from
      .mockImplementationOnce(() => makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID }, error: null }))
      .mockImplementationOnce(() => makeChain({ data: { role: 'owner' }, error: null }))
      .mockImplementationOnce(() => makeChain({ data: null, error: null }))
      .mockImplementationOnce(() => {
        // count query — resolve with { count: 0 }
        const chain = makeChain({ data: null, error: null })
        ;(chain as Record<string, unknown>).then = (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown
        ) => Promise.resolve({ count: 0, data: null, error: null }).then(resolve, reject)
        return chain
      })
      .mockImplementationOnce(() => makeChain({ data: null, error: null })) // insert
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await generateToken(tokenReq({ project_id: PROJECT_ID }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.token).toMatch(/^mds_[a-z0-9]{8}_[a-f0-9]{32}$/)
  })

  it('2.5.2 returns 422 when 3 active tokens already exist', async () => {
    const svc = makeServiceMock()
    svc.from.mockImplementation((table: string) => {
      if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID }, error: null })
      if (table === 'org_members') return makeChain({ data: { role: 'owner' }, error: null })
      if (table === 'project_members') return makeChain({ data: null, error: null })
      // token count = 3
      if (table === 'project_tokens') return Object.assign(makeChain({ data: null, error: null }), { then: (r: (v: unknown) => unknown) => Promise.resolve({ count: 3, data: null, error: null }).then(r) })
      return makeChain({ data: null, error: null })
    })

    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await generateToken(tokenReq({ project_id: PROJECT_ID }))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toContain('Maximum 3')
  })

  it('2.5.4 non-admin user returns 403', async () => {
    const svc = makeServiceMock()
    svc.from.mockImplementation((table: string) => {
      if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID }, error: null })
      if (table === 'org_members') return makeChain({ data: { role: 'member' }, error: null })
      if (table === 'project_members') return makeChain({ data: null, error: null })
      return makeChain({ data: null, error: null })
    })

    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await generateToken(tokenReq({ project_id: PROJECT_ID }))
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// 2.6 Organizations
// ---------------------------------------------------------------------------

describe('2.6 Organizations', () => {
  function orgReq(body: unknown) {
    return new Request('http://localhost/api/org/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('2.6.1 creates org and returns 201 with org + membership', async () => {
    const svc = makeServiceMock()
    svc.from.mockImplementation((table: string) => {
      if (table === 'org_members') {
        return Object.assign(makeChain({ data: null, error: null }), {
          then: (r: (v: unknown) => unknown) => Promise.resolve({ count: 0, data: null, error: null }).then(r),
        })
      }
      if (table === 'organizations') return makeChain({ data: { id: ORG_ID, name: 'Acme' }, error: null })
      return makeChain({ data: null, error: null })
    })

    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await createOrg(orgReq({ name: 'Acme Corp' }))
    expect(res.status).toBe(201)
  })

  it('2.6.2 user already owns org returns 409 already_owns_org', async () => {
    const svc = makeServiceMock()
    svc.from.mockImplementation((table: string) => {
      if (table === 'org_members') {
        return Object.assign(makeChain({ data: null, error: null }), {
          then: (r: (v: unknown) => unknown) => Promise.resolve({ count: 1, data: null, error: null }).then(r),
        })
      }
      return makeChain({ data: null, error: null })
    })

    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await createOrg(orgReq({ name: 'Second Org' }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('already_owns_org')
  })
})

// ---------------------------------------------------------------------------
// 2.7 Integrations
// ---------------------------------------------------------------------------

describe('2.7 Integrations', () => {
  function connectReq(body: unknown) {
    return new Request('http://localhost/api/integrations/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  function makeConnectServiceMock(existingSecretId: string | null = null) {
    const svc = makeServiceMock({
      integrations: { data: existingSecretId ? { credentials_secret_id: existingSecretId } : null, error: null },
    })
    svc.rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'create_integration_secret') return Promise.resolve({ data: 'sec-new', error: null })
      if (fn === 'delete_integration_secret') return Promise.resolve({ data: null, error: null })
      return Promise.resolve({ data: null, error: null })
    })
    return svc
  }

  it('2.7.1 connect integration upserts with status connected', async () => {
    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    const svc = makeConnectServiceMock(null)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await connectIntegration(connectReq({ type: 'notion', credentials: '{}', config: {} }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(svc.rpc).toHaveBeenCalledWith('create_integration_secret', expect.objectContaining({ secret_text: '{}' }))
  })

  it('2.7.2 reconnect same type upserts and deletes prior secret', async () => {
    const sb = makeServerMock(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    const svc = makeConnectServiceMock('sec-old')
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await connectIntegration(connectReq({ type: 'notion', credentials: '{}', config: {} }))
    expect(res.status).toBe(200)
    expect(svc.rpc).toHaveBeenCalledWith('delete_integration_secret', { secret_id: 'sec-old' })
  })
})
