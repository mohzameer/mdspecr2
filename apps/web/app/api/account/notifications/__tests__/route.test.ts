/**
 * PATCH /api/account/notifications — unit tests
 *
 * Covers:
 *   - 401 when no authenticated user
 *   - 400 when body is not valid JSON
 *   - 400 when email_notification_mode is missing or an invalid value
 *   - 200 with updated mode for each valid value (always, failures_only, never)
 *   - 500 when Supabase update fails
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

import { PATCH } from '../route.js'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const USER = { id: 'user-abc' }

function makeServerClient(user: typeof USER | null) {
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  }
}

function makeServiceClient(updateError: unknown = null) {
  const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: updateError }) })
  return { from: vi.fn().mockReturnValue({ update: updateFn }) }
}

function makeRequest(body: unknown, malformed = false) {
  if (malformed) {
    return new Request('http://localhost/api/account/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
  }
  return new Request('http://localhost/api/account/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PATCH /api/account/notifications', () => {
  it('returns 401 when there is no authenticated user', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await PATCH(makeRequest({ email_notification_mode: 'always' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('returns 400 when the request body is not valid JSON', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)

    const res = await PATCH(makeRequest(null, true))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'invalid_body' })
  })

  it('returns 400 when email_notification_mode is missing', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)

    const res = await PATCH(makeRequest({}))

    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid email_notification_mode value', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)

    const res = await PATCH(makeRequest({ email_notification_mode: 'weekly_digest' }))

    expect(res.status).toBe(400)
  })

  it.each(['always', 'failures_only', 'never'] as const)(
    'returns 200 and persists mode "%s"',
    async (mode) => {
      vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
      vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)

      const res = await PATCH(makeRequest({ email_notification_mode: mode }))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ email_notification_mode: mode })
    }
  )

  it('returns 500 when Supabase update fails', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeServiceClient({ message: 'db error' }) as never
    )

    const res = await PATCH(makeRequest({ email_notification_mode: 'always' }))

    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: 'update_failed' })
  })
})
