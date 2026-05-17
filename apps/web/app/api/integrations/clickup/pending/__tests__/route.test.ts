/**
 * GET /api/integrations/clickup/pending
 *
 * Covers:
 *   - Unauthenticated → 401
 *   - No clickup_pending cookie → 404
 *   - Valid cookie → returns token + workspaces and deletes cookie
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const mockCookieStore = vi.hoisted(() => {
  let cookieValues: Record<string, string> = {}
  return {
    get: vi.fn((key: string) => cookieValues[key] ? { value: cookieValues[key] } : undefined),
    delete: vi.fn((key: string) => { delete cookieValues[key] }),
    _reset: (values: Record<string, string> = {}) => { cookieValues = { ...values } },
  }
})

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}))

import { GET } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'

function makeServerClient(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
}

const PENDING = {
  token: 'pk_abc123',
  workspaces: [
    { id: 'ws-1', name: 'Workspace One' },
    { id: 'ws-2', name: 'Workspace Two' },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCookieStore._reset()
  vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient({ id: 'u1' }) as never)
})

describe('GET /api/integrations/clickup/pending', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('returns 404 when no pending cookie exists', async () => {
    const res = await GET()

    expect(res.status).toBe(404)
  })

  it('returns token and workspaces from pending cookie', async () => {
    mockCookieStore._reset({ clickup_pending: JSON.stringify(PENDING) })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe(PENDING.token)
    expect(body.workspaces).toEqual(PENDING.workspaces)
  })

  it('deletes the pending cookie after reading', async () => {
    mockCookieStore._reset({ clickup_pending: JSON.stringify(PENDING) })

    await GET()

    expect(mockCookieStore.delete).toHaveBeenCalledWith('clickup_pending')
  })
})
