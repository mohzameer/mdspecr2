import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain } from '../../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))

import { GET } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'

const USER = { id: 'user-1' }
const TXN_ID = 'txn_test_123'

function makeServerClient(user: typeof USER | null) {
  return {
    from: vi.fn(() => makeChain({ data: null, error: null })),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
  }
}

function mockPaddle(transactionId: string | null) {
  global.fetch = vi.fn().mockResolvedValue({
    status: transactionId ? 200 : 400,
    json: () => Promise.resolve(
      transactionId
        ? { data: { id: transactionId } }
        : { data: null }
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PADDLE_API_KEY = 'test_api_key'
  process.env.PADDLE_PRICE_MONTHLY = 'pri_monthly'
  process.env.PADDLE_PRICE_YEARLY = 'pri_yearly'
  process.env.NEXT_PUBLIC_PADDLE_ENV = 'sandbox'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

describe('GET /api/billing/checkout', () => {
  it('redirects to /login when not authenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(null) as never)

    const res = await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('returns transactionId JSON on success', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    const res = await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.transactionId).toBe(TXN_ID)
  })

  it('uses sandbox API base URL when NEXT_PUBLIC_PADDLE_ENV=sandbox', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).toContain('sandbox-api.paddle.com')
  })

  it('uses production API base URL when NEXT_PUBLIC_PADDLE_ENV is not sandbox', async () => {
    process.env.NEXT_PUBLIC_PADDLE_ENV = 'production'
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(url).not.toContain('sandbox')
    expect(url).toContain('api.paddle.com')
  })

  it('sends monthly price ID when period=monthly', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.items[0].price_id).toBe('pri_monthly')
  })

  it('sends yearly price ID when period=yearly', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    await GET(new Request('http://localhost/api/billing/checkout?period=yearly'))

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.items[0].price_id).toBe('pri_yearly')
  })

  it('defaults to monthly price ID when period param is missing', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    await GET(new Request('http://localhost/api/billing/checkout'))

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.items[0].price_id).toBe('pri_monthly')
  })

  it('includes user_id in custom_data', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(TXN_ID)

    await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.custom_data.user_id).toBe(USER.id)
  })

  it('returns 500 when Paddle API does not return a transaction id', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(makeServerClient(USER) as never)
    mockPaddle(null)

    const res = await GET(new Request('http://localhost/api/billing/checkout?period=monthly'))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('checkout_failed')
  })
})
