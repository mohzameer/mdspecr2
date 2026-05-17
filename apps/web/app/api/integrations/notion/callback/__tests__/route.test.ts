/**
 * GET /api/integrations/notion/callback
 *
 * Covers:
 *   - Unauthenticated → redirect to /auth/login
 *   - error param present → error=notion_denied redirect
 *   - Missing code → error=notion_denied redirect
 *   - State mismatch → error=notion_state redirect
 *   - Missing state cookie → error=notion_state redirect
 *   - Token exchange failure → error=notion_token redirect
 *   - Success → stores pending token cookie, redirects setup=notion
 *   - State cookie deleted after reading
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  process.env.NOTION_CLIENT_ID = 'notion-client-id'
  process.env.NOTION_CLIENT_SECRET = 'notion-secret'
})

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
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
import { createSupabaseServerClient } from '@/lib/db-server'

function makeServerClient(user: { id: string } | null) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) } }
}

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost:3000/api/integrations/notion/callback')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new Request(url.toString())
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCookieStore._reset({ notion_oauth_state: 'saved-state-abc' })
  vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient({ id: 'u1' }) as never)
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ access_token: 'ntn_tok_abc' }),
  })
})

describe('GET /api/integrations/notion/callback', () => {
  it('redirects unauthenticated user to /auth/login', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await GET(makeReq({ code: 'c', state: 'saved-state-abc' }) as never)

    expect(res.headers.get('location')).toContain('/auth/login')
  })

  it('redirects with error=notion_denied when error param is present', async () => {
    const res = await GET(makeReq({ error: 'access_denied' }) as never)

    expect(res.headers.get('location')).toContain('error=notion_denied')
  })

  it('redirects with error=notion_denied when code is missing', async () => {
    const res = await GET(makeReq({ state: 'saved-state-abc' }) as never)

    expect(res.headers.get('location')).toContain('error=notion_denied')
  })

  it('redirects with error=notion_state when state cookie is missing', async () => {
    mockCookieStore._reset()

    const res = await GET(makeReq({ code: 'c', state: 'saved-state-abc' }) as never)

    expect(res.headers.get('location')).toContain('error=notion_state')
  })

  it('redirects with error=notion_state when state param does not match cookie', async () => {
    const res = await GET(makeReq({ code: 'c', state: 'wrong-state' }) as never)

    expect(res.headers.get('location')).toContain('error=notion_state')
  })

  it('deletes the state cookie regardless of state check outcome', async () => {
    await GET(makeReq({ code: 'c', state: 'wrong-state' }) as never)

    expect(mockCookieStore.delete).toHaveBeenCalledWith('notion_oauth_state')
  })

  it('redirects with error=notion_token when token exchange fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })

    const res = await GET(makeReq({ code: 'c', state: 'saved-state-abc' }) as never)

    expect(res.headers.get('location')).toContain('error=notion_token')
  })

  it('calls Notion token endpoint with Basic auth and correct body', async () => {
    await GET(makeReq({ code: 'code-xyz', state: 'saved-state-abc' }) as never)

    const expectedAuth = Buffer.from('notion-client-id:notion-secret').toString('base64')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.notion.com/v1/oauth/token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: `Basic ${expectedAuth}` }),
      })
    )
    const body = JSON.parse((vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit).body as string)
    expect(body.code).toBe('code-xyz')
    expect(body.grant_type).toBe('authorization_code')
  })

  it('sets notion_pending_token cookie and redirects setup=notion on success', async () => {
    const res = await GET(makeReq({ code: 'c', state: 'saved-state-abc' }) as never)

    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('setup=notion')

    const tokenCookieCall = mockCookieStore.set.mock.calls.find(c => c[0] === 'notion_pending_token')
    expect(tokenCookieCall).toBeDefined()
    expect(tokenCookieCall![1]).toBe('ntn_tok_abc')
    expect(tokenCookieCall![2]).toMatchObject({ httpOnly: true, maxAge: 300 })
  })
})
