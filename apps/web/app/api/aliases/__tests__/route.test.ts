/**
 * Section 2.2 — Aliases CRUD
 * GET/POST /api/aliases  +  PATCH/DELETE /api/aliases/[aliasId]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain } from '../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { GET, POST } from '../route.js'
import { PATCH, DELETE } from '../[aliasId]/route.js'
import { createSupabaseServerClient } from '@/lib/db-server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_USER = { id: 'user-admin' }
const MEMBER_USER = { id: 'user-member' }
const ORG_ID = 'org-111'
const INT_ID = 'int-222'
const ALIAS_ID = 'alias-333'

function makeSupabase(
  user: { id: string } | null,
  orgMember: { org_id: string; role: string } | null,
  tableOverrides: Record<string, { data: unknown; error: unknown }> = {}
) {
  const chains: Record<string, ReturnType<typeof makeChain>> = {}
  const calls: string[] = []

  const fromMock = vi.fn((table: string) => {
    calls.push(table)
    if (tableOverrides[table]) return makeChain(tableOverrides[table])
    if (table === 'org_members') return makeChain({ data: orgMember, error: null })
    return makeChain({ data: null, error: null })
  })

  return {
    from: fromMock,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    _calls: calls,
  }
}

function makeGetReq() {
  return new Request('http://localhost/api/aliases')
}

function makePostReq(body: unknown) {
  return new Request('http://localhost/api/aliases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePatchReq(body: unknown) {
  return new Request('http://localhost/api/aliases/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDeleteReq() {
  return new Request('http://localhost/api/aliases/x', { method: 'DELETE' })
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// GET /api/aliases
// ---------------------------------------------------------------------------

describe('GET /api/aliases', () => {
  it('2.2.1 unauthenticated returns 401', async () => {
    const sb = makeSupabase(null, null)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('2.2.2 authenticated with aliases returns array', async () => {
    const aliases = [{ id: ALIAS_ID, name: 'eng-docs', integration_id: INT_ID }]
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: aliases, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(1)
  })

  it('2.2.3 authenticated with no aliases returns empty array', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: [], error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// POST /api/aliases
// ---------------------------------------------------------------------------

describe('POST /api/aliases', () => {
  const VALID_BODY = { name: 'eng-docs', integration_id: INT_ID, native_id: 'page1' }

  it('2.2.4 valid body returns 201', async () => {
    const newAlias = { id: ALIAS_ID, name: 'eng-docs', org_id: ORG_ID }
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      integrations: { data: { id: INT_ID, status: 'connected' }, error: null },
      aliases: { data: newAlias, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(201)
  })

  it('2.2.5 duplicate name returns 409', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      integrations: { data: { id: INT_ID, status: 'connected' }, error: null },
      aliases: { data: null, error: { code: '23505', message: 'duplicate' } },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(409)
  })

  it('2.2.6 invalid name format returns 400', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq({ name: 'ENG DOCS!', integration_id: INT_ID, native_id: 'p1' }))
    expect(res.status).toBe(400)
  })

  it('2.2.7 missing native_id returns 400', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq({ name: 'eng-docs', integration_id: INT_ID }))
    expect(res.status).toBe(400)
  })

  it('2.2.8 member (non-admin) returns 403', async () => {
    const sb = makeSupabase(MEMBER_USER, { org_id: ORG_ID, role: 'member' })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(403)
  })

  it('2.2.9 disconnected integration returns 400', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      integrations: { data: { id: INT_ID, status: 'disconnected' }, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(400)
  })

  it('2.2.10 integration not in org returns 404', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      integrations: { data: null, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await POST(makePostReq(VALID_BODY))
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/aliases/[aliasId]
// ---------------------------------------------------------------------------

describe('PATCH /api/aliases/[aliasId]', () => {
  const params = Promise.resolve({ aliasId: ALIAS_ID })

  it('2.2.11 update name returns 200 with updated alias', async () => {
    const updated = { id: ALIAS_ID, name: 'new-name' }
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: updated, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatchReq({ name: 'new-name' }), { params })
    expect(res.status).toBe(200)
  })

  it('2.2.12 update native_id returns 200', async () => {
    const updated = { id: ALIAS_ID, native_id: 'new-id' }
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: updated, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatchReq({ native_id: 'new-id' }), { params })
    expect(res.status).toBe(200)
  })

  it('2.2.13 name conflict returns 409', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: null, error: { code: '23505', message: 'conflict' } },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatchReq({ name: 'existing' }), { params })
    expect(res.status).toBe(409)
  })

  it('2.2.14 invalid name format returns 400', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatchReq({ name: 'BAD NAME!' }), { params })
    expect(res.status).toBe(400)
  })

  it('2.2.15 not found returns 404', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: null, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await PATCH(makePatchReq({ name: 'ok-name' }), { params })
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/aliases/[aliasId]
// ---------------------------------------------------------------------------

describe('DELETE /api/aliases/[aliasId]', () => {
  const params = Promise.resolve({ aliasId: ALIAS_ID })

  it('2.2.16 delete existing alias returns 200 deleted:true', async () => {
    const sb = makeSupabase(ADMIN_USER, { org_id: ORG_ID, role: 'owner' }, {
      aliases: { data: null, error: null },
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await DELETE(makeDeleteReq(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.deleted).toBe(true)
  })

  it('2.2.17 member (non-admin) returns 403', async () => {
    const sb = makeSupabase(MEMBER_USER, { org_id: ORG_ID, role: 'member' })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await DELETE(makeDeleteReq(), { params })
    expect(res.status).toBe(403)
  })
})
