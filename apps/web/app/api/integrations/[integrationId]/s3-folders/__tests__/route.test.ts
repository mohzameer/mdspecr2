import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))

const mockSend = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  ListObjectsV2Command: vi.fn().mockImplementation((input) => input),
}))

import { GET } from '../route.js'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

const CREDENTIALS = {
  access_key_id: 'AKIAIOSFODNN7EXAMPLE',
  secret_access_key: 'wJalrXUtnFEMI',
  bucket: 'acme-specs',
  region: 'us-east-1',
}

function makeSupabase({
  user = { id: 'u1' },
  integration = null as Record<string, unknown> | null,
  membership = { role: 'member' } as Record<string, unknown> | null,
} = {}) {
  const chain = (result: unknown) => ({
    from: () => chain(result),
    select: () => chain(result),
    eq: () => chain(result),
    single: () => Promise.resolve({ data: result, error: null }),
  })
  return {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    from: (table: string) => {
      if (table === 'integrations') return chain(integration)
      if (table === 'org_members') return chain(membership)
      return chain(null)
    },
  }
}

const S3_INTEGRATION = {
  id: 'int1',
  type: 's3',
  status: 'connected',
  credentials_secret_id: 'sec-xyz',
  org_id: 'org1',
}

function makeReq(path = '/api/integrations/int1/s3-folders', searchParams = '') {
  return new Request(`http://localhost${path}${searchParams}`)
}

const PARAMS = Promise.resolve({ integrationId: 'int1' })

function makeServiceClient(plaintext: string = JSON.stringify(CREDENTIALS)) {
  return { rpc: vi.fn().mockResolvedValue({ data: plaintext, error: null }) }
}

beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockResolvedValue(makeSupabase({ integration: S3_INTEGRATION }) as never)
  vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient() as never)
  mockSend.mockReset()
})

describe('GET /api/integrations/[integrationId]/s3-folders', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ user: null as never, integration: S3_INTEGRATION }) as never
    )
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(401)
  })

  it('returns 404 when integration not found', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ integration: null }) as never
    )
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not a member of the org', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ integration: S3_INTEGRATION, membership: null }) as never
    )
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(403)
  })

  it('returns 400 when integration type is not s3', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ integration: { ...S3_INTEGRATION, type: 'clickup' } }) as never
    )
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('not_s3')
  })

  it('returns 400 when integration is not connected', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(
      makeSupabase({ integration: { ...S3_INTEGRATION, status: 'disconnected' } }) as never
    )
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('not_connected')
  })

  it('returns 500 when credentials are invalid JSON', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient('not-json') as never)
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(500)
  })

  it('returns folder prefixes from CommonPrefixes', async () => {
    mockSend.mockResolvedValueOnce({
      CommonPrefixes: [{ Prefix: 'docs/' }, { Prefix: 'eng/' }],
      NextContinuationToken: undefined,
    })
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['docs', 'eng'])
  })

  it('returns empty array when bucket has no top-level folders', async () => {
    mockSend.mockResolvedValueOnce({ CommonPrefixes: [], NextContinuationToken: undefined })
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('paginates using NextContinuationToken', async () => {
    mockSend
      .mockResolvedValueOnce({ CommonPrefixes: [{ Prefix: 'a/' }], NextContinuationToken: 'tok' })
      .mockResolvedValueOnce({ CommonPrefixes: [{ Prefix: 'b/' }], NextContinuationToken: undefined })
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(['a', 'b'])
    expect(mockSend).toHaveBeenCalledTimes(2)
  })

  it('uses prefix query param when provided', async () => {
    mockSend.mockResolvedValueOnce({ CommonPrefixes: [{ Prefix: 'docs/api/' }], NextContinuationToken: undefined })
    const res = await GET(makeReq('/api/integrations/int1/s3-folders', '?prefix=docs') as never, { params: PARAMS })
    expect(res.status).toBe(200)
    const input = mockSend.mock.calls[0][0]
    expect(input.Prefix).toBe('docs/')
  })

  it('returns 502 when S3 throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('NoSuchBucket'))
    const res = await GET(makeReq() as never, { params: PARAMS })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('NoSuchBucket')
  })
})
