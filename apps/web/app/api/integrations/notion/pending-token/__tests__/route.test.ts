/**
 * GET /api/integrations/notion/pending-token
 *
 * Covers:
 *   - Unauthenticated → 401
 *   - No notion_pending_token cookie → 404
 *   - Valid cookie → returns token and deletes cookie
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

beforeEach(() => {
  vi.clearAllMocks()
  mockCookieStore._reset()
  vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient({ id: 'u1' }) as never)
})

describe('GET /api/integrations/notion/pending-token', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('returns 404 when no pending token cookie exists', async () => {
    const res = await GET()

    expect(res.status).toBe(404)
  })

  it('returns the token from the pending cookie', async () => {
    mockCookieStore._reset({ notion_pending_token: 'ntn_tok_secret' })

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBe('ntn_tok_secret')
  })

  it('deletes the pending token cookie after reading', async () => {
    mockCookieStore._reset({ notion_pending_token: 'ntn_tok_secret' })

    await GET()

    expect(mockCookieStore.delete).toHaveBeenCalledWith('notion_pending_token')
  })
})
