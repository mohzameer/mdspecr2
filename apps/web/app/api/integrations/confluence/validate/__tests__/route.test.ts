/**
 * POST /api/integrations/confluence/validate — unit tests
 *
 * Covers:
 *   - 401 when no authenticated user
 *   - 400 when required fields missing
 *   - { ok: true } when Confluence space request succeeds
 *   - { ok: false } with message on 401 from Confluence (bad token)
 *   - { ok: false } with message on 404 from Confluence (bad space key)
 *   - { ok: false } on network/other error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const { mockAxiosGet } = vi.hoisted(() => ({
  mockAxiosGet: vi.fn(),
}))

vi.mock('axios', () => ({
  default: { get: mockAxiosGet },
}))

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { POST } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER = { id: 'user-1' }

function makeServerClient(user: typeof USER | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  }
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/integrations/confluence/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  base_url: 'https://acme.atlassian.net',
  email: 'dev@acme.com',
  token: 'conf-tok',
  space_key: 'ENG',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAxiosGet.mockReset()
})

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
describe('auth guard', () => {
  it('returns 401 when no user session', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await POST(makeRequest(VALID_BODY) as never)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
  })
})

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------
describe('input validation', () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
  })

  it('returns 400 when base_url is missing', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, base_url: undefined }) as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, email: undefined }) as never)
    expect(res.status).toBe(400)
    expect((await res.json()).ok).toBe(false)
  })

  it('returns 400 when token is missing', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, token: undefined }) as never)
    expect(res.status).toBe(400)
    expect((await res.json()).ok).toBe(false)
  })

  it('returns 400 when space_key is missing', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, space_key: undefined }) as never)
    expect(res.status).toBe(400)
    expect((await res.json()).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Confluence API responses
// ---------------------------------------------------------------------------
describe('Confluence API validation', () => {
  beforeEach(() => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
  })

  it('returns { ok: true } when Confluence space request succeeds', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: { key: 'ENG', name: 'Engineering' } })

    const res = await POST(makeRequest(VALID_BODY) as never)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://acme.atlassian.net/wiki/rest/api/space/ENG',
      expect.objectContaining({
        auth: { username: 'dev@acme.com', password: 'conf-tok' },
      })
    )
  })

  it('strips trailing slash from base_url before calling Confluence', async () => {
    mockAxiosGet.mockResolvedValueOnce({ data: {} })

    await POST(makeRequest({ ...VALID_BODY, base_url: 'https://acme.atlassian.net/' }) as never)

    expect(mockAxiosGet).toHaveBeenCalledWith(
      'https://acme.atlassian.net/wiki/rest/api/space/ENG',
      expect.anything()
    )
  })

  it('returns { ok: false } with credential error message on 401', async () => {
    const axiosErr = Object.assign(new Error('Unauthorized'), { response: { status: 401 } })
    mockAxiosGet.mockRejectedValueOnce(axiosErr)

    const res = await POST(makeRequest(VALID_BODY) as never)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/invalid credentials/i)
  })

  it('returns { ok: false } with credential error message on 403', async () => {
    const axiosErr = Object.assign(new Error('Forbidden'), { response: { status: 403 } })
    mockAxiosGet.mockRejectedValueOnce(axiosErr)

    const res = await POST(makeRequest(VALID_BODY) as never)

    expect(res.status).toBe(400)
    expect((await res.json()).ok).toBe(false)
  })

  it('returns { ok: false } with space-not-found message on 404', async () => {
    const axiosErr = Object.assign(new Error('Not Found'), { response: { status: 404 } })
    mockAxiosGet.mockRejectedValueOnce(axiosErr)

    const res = await POST(makeRequest(VALID_BODY) as never)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/not found/i)
  })

  it('returns { ok: false } on network / unexpected error', async () => {
    mockAxiosGet.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const res = await POST(makeRequest(VALID_BODY) as never)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBeTruthy()
  })
})
