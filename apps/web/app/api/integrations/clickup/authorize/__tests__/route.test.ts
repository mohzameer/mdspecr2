/**
 * GET /api/integrations/clickup/authorize
 *
 * Covers:
 *   - Unauthenticated → redirect to /auth/login
 *   - Authenticated → sets httpOnly nonce cookie
 *   - Authenticated → redirects to ClickUp OAuth URL with client_id + redirect_uri
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  process.env.CLICKUP_CLIENT_ID = 'test-client-id'
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
  mockCookieStore.get.mockReturnValue(undefined)
  mockCookieStore.set.mockReturnValue(undefined)
  mockCookieStore.delete.mockReturnValue(undefined)
})

describe('GET /api/integrations/clickup/authorize', () => {
  it('redirects unauthenticated user to /auth/login', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase(null) as never)

    const res = await GET()

    const location = res.headers.get('location') ?? ''
    expect(location).toContain('/auth/login')
    expect(mockCookieStore.set).not.toHaveBeenCalled()
  })

  it('sets clickup_oauth_nonce cookie as httpOnly', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase({ id: 'u1' }) as never)

    await GET()

    expect(mockCookieStore.set).toHaveBeenCalledWith(
      'clickup_oauth_nonce',
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', maxAge: 600 })
    )
  })

  it('redirects to ClickUp OAuth URL with correct client_id and redirect_uri', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase({ id: 'u1' }) as never)

    const res = await GET()

    const location = res.headers.get('location') ?? ''
    expect(location).toContain('https://app.clickup.com/api')
    expect(location).toContain('client_id=test-client-id')
    expect(location).toContain(encodeURIComponent('http://localhost:3000/api/integrations/clickup/callback'))
  })
})
