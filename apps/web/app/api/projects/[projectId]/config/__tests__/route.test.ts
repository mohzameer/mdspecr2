/**
 * Section 2.3 — GET /api/projects/:projectId/config
 * Section 2.4 — GET /api/projects/:projectId/generate-mdspecmap
 * Section 2.8 — Folder mappings
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain } from '../../../../__tests__/supabaseMock.js'

vi.mock('@/lib/db-server', () => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn().mockResolvedValue(false) },
  compare: vi.fn().mockResolvedValue(false),
}))
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({ publishJSON: vi.fn().mockResolvedValue({}) })),
}))

import { GET as getConfig } from '../route.js'
import { GET as generateMap } from '../../generate-mdspecmap/route.js'
import { POST as createMapping } from '../../folder-mappings/route.js'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

const PROJECT_ID = 'proj-111'
const ORG_ID = 'org-111'
const USER = { id: 'user-1' }

function makeServerClient(user: typeof USER | null, extraTableMap: Record<string, { data: unknown; error: unknown }> = {}) {
  const fromMock = vi.fn((table: string) => {
    if (table === 'org_members') return makeChain({ data: { org_id: ORG_ID, role: 'owner' }, error: null })
    if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID, spec_dirs: ['docs/specs'], name: 'Test Project' }, error: null })
    if (extraTableMap[table]) return makeChain(extraTableMap[table])
    return makeChain({ data: null, error: null })
  })
  return {
    from: fromMock,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

function makeServiceClient(tableMap: Record<string, { data: unknown; error: unknown }> = {}) {
  return {
    from: vi.fn((table: string) => makeChain(tableMap[table] ?? { data: null, error: null })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.QSTASH_TOKEN = 'test'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

const configParams = Promise.resolve({ projectId: PROJECT_ID })
const mapParams = Promise.resolve({ projectId: PROJECT_ID })

// ---------------------------------------------------------------------------
// 2.3 Project Config
// ---------------------------------------------------------------------------

describe('2.3 GET /api/projects/:projectId/config', () => {
  it('2.3.3 session auth returns spec_dirs and name', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const req = new Request(`http://localhost/api/projects/${PROJECT_ID}/config`)
    const res = await getConfig(req, { params: configParams })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('spec_dirs')
    expect(body).toHaveProperty('name')
  })

  it('2.3.4 project not found returns 404', async () => {
    const sb = makeServerClient(USER, { projects: { data: null, error: null } })
    // Override project to return null
    sb.from.mockImplementation((table: string) => {
      if (table === 'projects') return makeChain({ data: null, error: null })
      if (table === 'org_members') return makeChain({ data: { org_id: ORG_ID, role: 'owner' }, error: null })
      return makeChain({ data: null, error: null })
    })
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const req = new Request(`http://localhost/api/projects/bad-id/config`)
    const res = await getConfig(req, { params: Promise.resolve({ projectId: 'bad-id' }) })
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 2.4 Generate .mdspecmap
// ---------------------------------------------------------------------------

describe('2.4 GET /api/projects/:projectId/generate-mdspecmap', () => {
  it('2.4.4 returns text/yaml content-type', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient({
      folder_mappings: { data: [], error: null },
    }) as never)

    const req = new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`)
    const res = await generateMap(req, { params: mapParams })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/text\/yaml/)
  })

  it('2.4.5 returns attachment content-disposition with .mdspecmap filename', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient({
      folder_mappings: { data: [], error: null },
    }) as never)

    const req = new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`)
    const res = await generateMap(req, { params: mapParams })
    expect(res.headers.get('content-disposition')).toContain('.mdspecmap')
  })

  it('2.4.1 with folder mappings and aliases generates YAML with parent fields', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient({
      folder_mappings: {
        data: [{
          folder_path: 'docs/specs',
          integration_id: 'int1',
          clickup_mode: 'doc',
          skip_patterns: [],
          integrations: { type: 'notion' },
        }],
        error: null,
      },
      aliases: { data: [{ name: 'eng-docs', integration_id: 'int1' }], error: null },
    }) as never)

    const req = new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`)
    const res = await generateMap(req, { params: mapParams })
    const text = await res.text()
    expect(text).toContain('version: 1')
    expect(text).toContain('docs/specs')
  })

  it('2.4.2 no folder mappings generates YAML with commented example from spec_dirs', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeServiceClient({
      folder_mappings: { data: [], error: null },
    }) as never)

    const req = new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`)
    const res = await generateMap(req, { params: mapParams })
    const text = await res.text()
    expect(text).toContain('version: 1')
  })
})

// ---------------------------------------------------------------------------
// 2.8 Folder mappings
// ---------------------------------------------------------------------------

describe('2.8 POST /api/projects/:projectId/folder-mappings', () => {
  const fmParams = Promise.resolve({ projectId: PROJECT_ID })

  function makeReq(body: unknown) {
    return new Request(`http://localhost/api/projects/${PROJECT_ID}/folder-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('2.8.2 folder_path "/" is normalized to ""', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    const svc = makeServiceClient({
      integrations: { data: { id: 'int1', type: 'notion' }, error: null },
      folder_mappings: { data: { id: 'fm1', folder_path: '' }, error: null },
      specs: { data: [], error: null },
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(svc as never)

    // For the inline integration check in folder-mappings POST
    sb.from.mockImplementation((table: string) => {
      if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID }, error: null })
      if (table === 'org_members') return makeChain({ data: { role: 'owner' }, error: null })
      if (table === 'project_members') return makeChain({ data: null, error: null })
      if (table === 'integrations') return makeChain({ data: { id: 'int1', status: 'connected' }, error: null })
      if (table === 'folder_mappings') return makeChain({ data: { id: 'fm1', folder_path: '' }, error: null })
      return makeChain({ data: null, error: null })
    })

    const res = await createMapping(makeReq({ folder_path: '/', integration_id: 'int1' }), { params: fmParams })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.folder_path).toBe('')
  })

  it('2.8.3 path traversal is blocked', async () => {
    const sb = makeServerClient(USER)
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)
    sb.from.mockImplementation((table: string) => {
      if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID }, error: null })
      if (table === 'org_members') return makeChain({ data: { role: 'owner' }, error: null })
      if (table === 'project_members') return makeChain({ data: null, error: null })
      return makeChain({ data: null, error: null })
    })

    const res = await createMapping(makeReq({ folder_path: '../etc', integration_id: 'int1' }), { params: fmParams })
    expect(res.status).toBe(400)
  })
})
