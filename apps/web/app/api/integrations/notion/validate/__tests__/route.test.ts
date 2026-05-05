import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
}))
vi.mock('@/lib/publish/adapters/notion', () => ({
  validateNotionCredentials: vi.fn(),
}))

import { POST } from '../route.js'
import { createSupabaseServerClient } from '@/lib/db-server'
import { validateNotionCredentials } from '@/lib/publish/adapters/notion'

const AUTHED_SUPABASE = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
}
const UNAUTHED_SUPABASE = {
  auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
}

function makeReq(body: unknown) {
  return new Request('http://localhost/api/integrations/notion/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PAGE_BODY = { token: 'secret_abc', root_page_id: 'page-root-1', mode: 'page' }
const DB_BODY = {
  token: 'secret_abc',
  root_page_id: 'page-root-1',
  mode: 'database',
  database_id: 'db-1',
  data_source_id: 'ds-1',
}

beforeEach(() => {
  vi.mocked(createSupabaseServerClient).mockResolvedValue(AUTHED_SUPABASE as never)
  vi.mocked(validateNotionCredentials).mockReset()
})

describe('POST /api/integrations/notion/validate', () => {
  it('returns 401 when not authenticated', async () => {
    vi.mocked(createSupabaseServerClient).mockResolvedValue(UNAUTHED_SUPABASE as never)
    const res = await POST(makeReq(PAGE_BODY) as never)
    expect(res.status).toBe(401)
    expect(validateNotionCredentials).not.toHaveBeenCalled()
  })

  it('returns 200 with ok:true for a valid page-mode connection', async () => {
    vi.mocked(validateNotionCredentials).mockResolvedValue({ ok: true, mode: 'page' })
    const res = await POST(makeReq(PAGE_BODY) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'page' })
  })

  it('returns 200 with resolved data_source_id for valid database mode', async () => {
    vi.mocked(validateNotionCredentials).mockResolvedValue({
      ok: true, mode: 'database', data_source_id: 'ds-1',
    })
    const res = await POST(makeReq(DB_BODY) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, mode: 'database', data_source_id: 'ds-1' })
  })

  it('returns 200 with needs_pick when database has multiple data sources', async () => {
    const data_sources = [{ id: 'ds-1', name: 'Specs' }, { id: 'ds-2', name: 'Drafts' }]
    vi.mocked(validateNotionCredentials).mockResolvedValue({
      ok: true, mode: 'database', needs_pick: true, data_sources,
    })
    const res = await POST(makeReq({ ...DB_BODY, data_source_id: undefined }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.needs_pick).toBe(true)
    expect(body.data_sources).toEqual(data_sources)
  })

  it('returns 400 with error message when validation fails', async () => {
    vi.mocked(validateNotionCredentials).mockResolvedValue({
      ok: false, error: 'Token rejected. Check the integration token.',
    })
    const res = await POST(makeReq(PAGE_BODY) as never)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false, error: 'Token rejected. Check the integration token.' })
  })

  it('forwards token, root_page_id, mode, database_id, data_source_id to adapter', async () => {
    vi.mocked(validateNotionCredentials).mockResolvedValue({
      ok: true, mode: 'database', data_source_id: 'ds-1',
    })
    await POST(makeReq(DB_BODY) as never)
    expect(validateNotionCredentials).toHaveBeenCalledWith({
      token: 'secret_abc',
      root_page_id: 'page-root-1',
      mode: 'database',
      database_id: 'db-1',
      data_source_id: 'ds-1',
    })
  })

  it('forwards undefined database fields when mode is page', async () => {
    vi.mocked(validateNotionCredentials).mockResolvedValue({ ok: true, mode: 'page' })
    await POST(makeReq(PAGE_BODY) as never)
    expect(validateNotionCredentials).toHaveBeenCalledWith({
      token: 'secret_abc',
      root_page_id: 'page-root-1',
      mode: 'page',
      database_id: undefined,
      data_source_id: undefined,
    })
  })
})
