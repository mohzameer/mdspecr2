/**
 * GET /api/integrations/notion/authorize
 *
 * Covers:
 *   - Unauthenticated → redirect to /auth/login
 *   - Authenticated → sets httpOnly state cookie
 *   - Authenticated → redirects to Notion OAuth URL with client_id, response_type, owner, redirect_uri, state
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  process.env.NOTION_CLIENT_ID = 'notion-client-id'
})

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

const mockCookieStore = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue(mockCookieStore),
}))

import { GET } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'

function makeSupabase(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCookieStore.set.mockReturnValue(undefined)
})

describe('GET /api/integrations/notion/authorize', () => {
  it('redirects unauthenticated user to /auth/login', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase(null) as never)

    const res = await GET()

    expect(res.headers.get('location')).toContain('/auth/login')
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it('sets notion_oauth_state cookie as httpOnly', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase({ id: 'u1' }) as never)

    await GET()

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'notion_oauth_state',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', maxAge: 600 })
    )
  })

  it('redirects to Notion OAuth URL with correct params', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase({ id: 'u1' }) as never)

    const res = await GET()

    const location = res.headers.get('location') ?? ''
    expect(location).toContain('https://api.notion.com/v1/oauth/authorize')
    expect(location).toContain('client_id=notion-client-id')
    expect(location).toContain('response_type=code')
    expect(location).toContain('owner=user')
    expect(location).toContain(encodeURIComponent('http://localhost:3000/api/integrations/notion/callback'))
  })

  it('includes state param in OAuth URL matching the cookie value', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase({ id: 'u1' }) as never)

    const res = await GET()

    const location = res.headers.get('location') ?? ''
    const stateInUrl = new URL(location).searchParams.get('state')
    const stateInCookie = mockCookieStore.set.mock.calls.find(c => c[0] === 'notion_oauth_state')?.[1]
    expect(stateInUrl).toBe(stateInCookie)
    expect(stateInUrl).toBeTruthy()
  })
})
