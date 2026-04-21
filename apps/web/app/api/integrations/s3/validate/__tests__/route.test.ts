import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))
vi.mock('@/lib/publish/adapters/s3', () => ({
  validateS3Credentials: vi.fn(),
}))

import { POST } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'
import { validateS3Credentials } from '@/lib/publish/adapters/s3'

const AUTHED_SUPABASE = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
}
const UNAUTHED_SUPABASE = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/integrations/s3/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  access_key_id: 'AKIAIOSFODNN7EXAMPLE',
  secret_access_key: 'wJalrXUtnFEMI',
  bucket: 'acme-specs',
  region: 'us-east-1',
}

beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockResolvedValue(AUTHED_SUPABASE as never)
  vi.mocked(validateS3Credentials).mockReset()
})

describe('POST /api/integrations/s3/validate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(UNAUTHED_SUPABASE as never)
    const res = await POST(makeReq(VALID_BODY) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when access_key_id is missing', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, access_key_id: undefined }) as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('returns 400 when secret_access_key is missing', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, secret_access_key: undefined }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when bucket is missing', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, bucket: undefined }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when region is missing', async () => {
    const res = await POST(makeReq({ ...VALID_BODY, region: undefined }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 200 with ok:true when credentials are valid', async () => {
    vi.mocked(validateS3Credentials).mockResolvedValue({ ok: true })
    const res = await POST(makeReq(VALID_BODY) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true })
  })

  it('passes correct credentials to validateS3Credentials', async () => {
    vi.mocked(validateS3Credentials).mockResolvedValue({ ok: true })
    await POST(makeReq(VALID_BODY) as never)
    expect(validateS3Credentials).toHaveBeenCalledWith(VALID_BODY)
  })

  it('returns 400 with error message when credentials are invalid', async () => {
    vi.mocked(validateS3Credentials).mockResolvedValue({ ok: false, error: 'Access denied.' })
    const res = await POST(makeReq(VALID_BODY) as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ ok: false, error: 'Access denied.' })
  })
})
