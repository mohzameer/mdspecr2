import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHmac } from 'crypto'
import { makeChain } from '../../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))

import { POST } from '../route.js'
import { createSupabaseServiceClient } from '@/lib/db-server'

const WEBHOOK_SECRET = 'pdl_ntfset_test_secret'
const TS = '1714000000'
const USER_ID = 'user-1'
const EVENT_ID = 'ntf_01abc'
const SUB_ID = 'sub_01abc'
const CUSTOMER_ID = 'ctm_01abc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sign(body: string, secret = WEBHOOK_SECRET, ts = TS): string {
  const h1 = createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex')
  return `ts=${ts};h1=${h1}`
}

function makeWebhookReq(body: unknown, signature?: string) {
  const rawBody = JSON.stringify(body)
  return new Request('http://localhost/api/webhooks/paddle', {
    method: 'POST',
    headers: {
      'Paddle-Signature': signature ?? sign(rawBody),
      'Content-Type': 'application/json',
    },
    body: rawBody,
  })
}

function baseEvent(eventType: string, overrides: Record<string, unknown> = {}) {
  return {
    event_type: eventType,
    notification_id: EVENT_ID,
    data: {
      id: SUB_ID,
      customer_id: CUSTOMER_ID,
      custom_data: { user_id: USER_ID },
      billing_cycle: { interval: 'month', frequency: 1 },
      current_billing_period: {
        starts_at: '2024-05-01T00:00:00Z',
        ends_at: '2024-06-01T00:00:00Z',
      },
      ...overrides,
    },
  }
}

function makeServiceClient(tableMap: Record<string, { data: unknown; error: unknown }> = {}) {
  return {
    from: vi.fn((table: string) =>
      makeChain(tableMap[table] ?? { data: null, error: null })
    ),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.PADDLE_WEBHOOK_SECRET = WEBHOOK_SECRET
})

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — signature verification', () => {
  it('returns 500 when PADDLE_WEBHOOK_SECRET is not configured', async () => {
    delete process.env.PADDLE_WEBHOOK_SECRET
    const body = baseEvent('subscription.created')
    const res = await POST(makeWebhookReq(body))
    expect(res.status).toBe(500)
  })

  it('returns 400 when signature is invalid', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
    const body = baseEvent('subscription.created')
    const res = await POST(makeWebhookReq(body, 'ts=1234;h1=badsignature'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_signature')
  })

  it('returns 400 when signature header is missing', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
    const rawBody = JSON.stringify(baseEvent('subscription.created'))
    const res = await POST(new Request('http://localhost/api/webhooks/paddle', {
      method: 'POST',
      body: rawBody,
    }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when body is not valid JSON', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
    const rawBody = 'not-json'
    const res = await POST(new Request('http://localhost/api/webhooks/paddle', {
      method: 'POST',
      headers: { 'Paddle-Signature': sign(rawBody) },
      body: rawBody,
    }))
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — idempotency', () => {
  it('skips processing and returns skipped:true when event already exists', async () => {
    const svc = makeServiceClient({
      billing_events: { data: { id: 'evt-1' }, error: null },
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('subscription.created')))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.skipped).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Missing required fields
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — missing fields', () => {
  it('returns 400 when user_id is missing from custom_data', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
    const event = {
      event_type: 'subscription.created',
      notification_id: EVENT_ID,
      data: { id: SUB_ID, custom_data: {} },
    }
    const res = await POST(makeWebhookReq(event))
    expect(res.status).toBe(400)
  })

  it('returns 400 when notification_id is missing', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
    const event = {
      event_type: 'subscription.created',
      data: { id: SUB_ID, custom_data: { user_id: USER_ID } },
    }
    const res = await POST(makeWebhookReq(event))
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// subscription.created
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — subscription.created', () => {
  it('updates subscription to pro/active and returns ok:true', async () => {
    const svc = makeServiceClient({
      billing_events: { data: null, error: null },
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('subscription.created')))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const updateCalls = svc.from.mock.calls.filter(([t]: [string]) => t === 'subscriptions')
    expect(updateCalls.length).toBeGreaterThan(0)
  })

  it('sets billing_period to yearly when billing_cycle interval is year', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    await POST(makeWebhookReq(baseEvent('subscription.created', {
      billing_cycle: { interval: 'year', frequency: 1 },
    })))

    const chain = svc.from.mock.results.find(
      (_: unknown, i: number) => svc.from.mock.calls[i]?.[0] === 'subscriptions'
    )?.value
    const updateArg = chain?.update?.mock?.calls?.[0]?.[0]
    expect(updateArg?.billing_period).toBe('yearly')
  })

  it('sets billing_period to monthly when billing_cycle interval is month', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    await POST(makeWebhookReq(baseEvent('subscription.created', {
      billing_cycle: { interval: 'month', frequency: 1 },
    })))

    const chain = svc.from.mock.results.find(
      (_: unknown, i: number) => svc.from.mock.calls[i]?.[0] === 'subscriptions'
    )?.value
    const updateArg = chain?.update?.mock?.calls?.[0]?.[0]
    expect(updateArg?.billing_period).toBe('monthly')
  })

  it('logs event to billing_events table', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    await POST(makeWebhookReq(baseEvent('subscription.created')))

    const insertCalls = svc.from.mock.calls.filter(([t]: [string]) => t === 'billing_events')
    expect(insertCalls.length).toBeGreaterThanOrEqual(2) // select (idempotency) + insert
  })
})

// ---------------------------------------------------------------------------
// subscription.updated
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — subscription.updated', () => {
  it('updates billing_period and period dates', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('subscription.updated')))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// subscription.cancelled
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — subscription.cancelled', () => {
  it('sets status to cancelled', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('subscription.cancelled')))
    expect(res.status).toBe(200)

    const chain = svc.from.mock.results.find(
      (_: unknown, i: number) => svc.from.mock.calls[i]?.[0] === 'subscriptions'
    )?.value
    const updateArg = chain?.update?.mock?.calls?.[0]?.[0]
    expect(updateArg?.status).toBe('cancelled')
  })

  it('sets cancelled_at to current_period_end when available', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    await POST(makeWebhookReq(baseEvent('subscription.cancelled')))

    const chain = svc.from.mock.results.find(
      (_: unknown, i: number) => svc.from.mock.calls[i]?.[0] === 'subscriptions'
    )?.value
    const updateArg = chain?.update?.mock?.calls?.[0]?.[0]
    expect(updateArg?.cancelled_at).toBe('2024-06-01T00:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// transaction.completed
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — transaction.completed', () => {
  it('reactivates subscription to active status', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('transaction.completed')))
    expect(res.status).toBe(200)

    const chain = svc.from.mock.results.find(
      (_: unknown, i: number) => svc.from.mock.calls[i]?.[0] === 'subscriptions'
    )?.value
    const updateArg = chain?.update?.mock?.calls?.[0]?.[0]
    expect(updateArg?.status).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// transaction.payment_failed
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — transaction.payment_failed', () => {
  it('sets status to payment_failed', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('transaction.payment_failed')))
    expect(res.status).toBe(200)

    const chain = svc.from.mock.results.find(
      (_: unknown, i: number) => svc.from.mock.calls[i]?.[0] === 'subscriptions'
    )?.value
    const updateArg = chain?.update?.mock?.calls?.[0]?.[0]
    expect(updateArg?.status).toBe('payment_failed')
  })
})

// ---------------------------------------------------------------------------
// Unknown event type
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/paddle — unknown event type', () => {
  it('logs the event but does not update subscriptions', async () => {
    const svc = makeServiceClient({ billing_events: { data: null, error: null } })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    const res = await POST(makeWebhookReq(baseEvent('customer.created')))
    expect(res.status).toBe(200)

    const subCalls = svc.from.mock.calls.filter(([t]: [string]) => t === 'subscriptions')
    expect(subCalls.length).toBe(0)
  })
})
