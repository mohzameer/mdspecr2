import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain } from '../../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { POST } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'
import { cookies } from 'next/headers'

const USER = { id: 'user-1' }
const OWNER_ID = 'owner-1'
const ORG_ID = 'org-1'
const NEW_PROJECT = { id: 'proj-new', org_id: ORG_ID, name: 'My Project', description: null, spec_dirs: [] }

/**
 * Builds a from() mock where consecutive calls to the same table use the
 * next result in the array, clamping at the last entry.
 */
function buildFromMock(tableMap: Record<string, { data: unknown; error: unknown; count?: number }[]>) {
  const counts: Record<string, number> = {}
  return vi.fn((table: string) => {
    counts[table] = (counts[table] ?? 0) + 1
    const results = tableMap[table]
    if (!results?.length) return makeChain({ data: null, error: null })
    const idx = Math.min(counts[table] - 1, results.length - 1)
    return makeChain(results[idx])
  })
}

function makeServerClient(
  user: typeof USER | null,
  fromMock: ReturnType<typeof vi.fn>
) {
  return {
    from: fromMock,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  }
}

function req(body: unknown) {
  return new Request('http://localhost/api/projects/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: ORG_ID }),
  } as never)
})

// ---------------------------------------------------------------------------
// Auth / org guards
// ---------------------------------------------------------------------------

describe('POST /api/projects/create — auth and org guards', () => {
  it('returns 401 when not authenticated', async () => {
    const from = buildFromMock({})
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no org cookie is set', async () => {
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue(undefined),
    } as never)
    const from = buildFromMock({})
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(400)
  })

  it('returns 403 when user is a member (not owner or admin)', async () => {
    const from = buildFromMock({
      org_members: [{ data: { role: 'member' }, error: null }],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(403)
  })

  it('returns 403 when user has no org membership', async () => {
    const from = buildFromMock({
      org_members: [{ data: null, error: null }],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// Free plan limit
// ---------------------------------------------------------------------------

describe('POST /api/projects/create — free plan limit', () => {
  it('returns 402 with project_limit_reached when free plan org already has 1 project', async () => {
    const from = buildFromMock({
      org_members: [
        { data: { role: 'owner' }, error: null },
        { data: { user_id: OWNER_ID }, error: null },
      ],
      subscriptions: [{ data: { plan: 'free' }, error: null }],
      projects: [{ data: null, error: null, count: 1 }],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'Second Project' }))
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toBe('project_limit_reached')
    expect(body.limit).toBe(1)
  })

  it('returns 402 when subscription row is missing (treated as free)', async () => {
    const from = buildFromMock({
      org_members: [
        { data: { role: 'owner' }, error: null },
        { data: { user_id: OWNER_ID }, error: null },
      ],
      subscriptions: [{ data: null, error: null }],
      projects: [{ data: null, error: null, count: 1 }],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'Second Project' }))
    expect(res.status).toBe(402)
  })

  it('allows first project creation on free plan (count is 0)', async () => {
    const from = buildFromMock({
      org_members: [
        { data: { role: 'owner' }, error: null },
        { data: { user_id: OWNER_ID }, error: null },
      ],
      subscriptions: [{ data: { plan: 'free' }, error: null }],
      projects: [
        { data: null, error: null, count: 0 },
        { data: NEW_PROJECT, error: null },
      ],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(201)
  })

  it('skips limit check entirely for pro plan', async () => {
    const from = buildFromMock({
      org_members: [
        { data: { role: 'owner' }, error: null },
        { data: { user_id: OWNER_ID }, error: null },
      ],
      subscriptions: [{ data: { plan: 'pro' }, error: null }],
      projects: [{ data: NEW_PROJECT, error: null }],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(201)
    // Verify projects was only called once (the insert), not twice
    expect(from.mock.calls.filter(([t]: [string]) => t === 'projects').length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Successful creation
// ---------------------------------------------------------------------------

describe('POST /api/projects/create — successful creation', () => {
  function proFrom(insertResult = NEW_PROJECT) {
    return buildFromMock({
      org_members: [
        { data: { role: 'owner' }, error: null },
        { data: { user_id: OWNER_ID }, error: null },
      ],
      subscriptions: [{ data: { plan: 'pro' }, error: null }],
      projects: [{ data: insertResult, error: null }],
    })
  }

  it('returns 201 with created project on success', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, proFrom()) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('proj-new')
    expect(body.name).toBe('My Project')
  })

  it('returns 400 when name is empty', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, proFrom()) as never)

    const res = await POST(req({ name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when name is missing', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, proFrom()) as never)

    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('admin role can also create projects', async () => {
    const from = buildFromMock({
      org_members: [
        { data: { role: 'admin' }, error: null },
        { data: { user_id: OWNER_ID }, error: null },
      ],
      subscriptions: [{ data: { plan: 'pro' }, error: null }],
      projects: [{ data: NEW_PROJECT, error: null }],
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER, from) as never)

    const res = await POST(req({ name: 'My Project' }))
    expect(res.status).toBe(201)
  })
})
