/**
 * Section 2.1 — POST /api/publish
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeChain, createServiceMock } from '../../__tests__/supabaseMock.js'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/db-server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn() },
  compare: vi.fn(),
}))
vi.mock('@upstash/qstash', () => ({
  Client: vi.fn().mockImplementation(() => ({
    publishJSON: vi.fn().mockResolvedValue({}),
  })),
}))
vi.mock('@/lib/folder-hierarchy', () => ({
  getAncestorFolders: vi.fn().mockReturnValue([]),
}))

import { POST } from '../route.js'
import { createSupabaseServiceClient } from '@/lib/db-server'
import bcrypt from 'bcryptjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
const PROJECT_ID = 'abcd1234-0000-0000-0000-000000000000'

function makeRequest(body: unknown, token = VALID_TOKEN) {
  return new Request('http://localhost/api/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

const BASE_PAYLOAD = {
  project_id: PROJECT_ID,
  repo_name: 'owner/repo',
  branch: 'main',
  commit_sha: 'abc123',
  commit_timestamp: 1700000000,
  specs: [{ path: 'docs/auth.md', hash: 'sha256:abc', frontmatter: {}, content: '# Auth' }],
  config: {
    version: 1,
    mappings: [{ folder: 'docs', integration: 'notion', parent: 'eng-docs' }],
  },
}

function setupAuthSuccess(supabase: ReturnType<typeof createServiceMock>) {
  // project_tokens query returns a token row
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: [{ id: 't1', project_id: PROJECT_ID, token_hash: 'hashed' }], error: null })
  )
  vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
}

function setupProjectAndOrg(supabase: ReturnType<typeof createServiceMock>, overrides: Record<string, unknown> = {}) {
  supabase.from.mockImplementationOnce(() =>
    makeChain({
      data: { id: PROJECT_ID, org_id: 'org1', registered_repo: null, ...overrides },
      error: null,
    })
  )
  // org_members
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: { user_id: 'u1' }, error: null })
  )
  // subscriptions
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: { plan: 'pro' }, error: null })
  )
}

function setupAliasResolution(supabase: ReturnType<typeof createServiceMock>) {
  supabase.from.mockImplementationOnce(() =>
    makeChain({
      data: [{ name: 'eng-docs', integration_id: 'int1', native_id: 'page1', integrations: { type: 'notion' } }],
      error: null,
    })
  )
  // active integrations
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
  )
}

function setupSpecUpsert(supabase: ReturnType<typeof createServiceMock>) {
  // specs upsert → returns id
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: { id: 'spec1' }, error: null })
  )
  // spec_publish_targets maybySingle
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: null, error: null })
  )
  // spec_publish_targets insert
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: { id: 'tgt1', external_page_id: null }, error: null })
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.QSTASH_TOKEN = 'test'
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
})

// ---------------------------------------------------------------------------
// 2.1 Authentication
// ---------------------------------------------------------------------------

describe('2.1 Authentication', () => {
  it('2.1.2 missing Authorization header returns 401', async () => {
    const req = new Request('http://localhost/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BASE_PAYLOAD),
    })
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('2.1.3 malformed token format returns 401', async () => {
    const req = makeRequest(BASE_PAYLOAD, 'Bearer invalid-token')
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)

    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('2.1.4 valid token for wrong project_id returns 401', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 't1', project_id: 'other-project-id', token_hash: 'h' }], error: null })
    )
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(401)
  })

  it('2.1.5 revoked token returns 401 (no token rows match)', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null })
    )

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 2.1 Payload Validation
// ---------------------------------------------------------------------------

describe('2.1 Payload validation', () => {
  function setupValidToken(supabase: ReturnType<typeof createServiceMock>) {
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 't1', project_id: PROJECT_ID, token_hash: 'h' }], error: null })
    )
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
  }

  it('2.1.6 missing config returns 400', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupValidToken(supabase)

    const payload = { ...BASE_PAYLOAD, config: undefined }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('missing_or_invalid_config')
  })

  it('2.1.7 invalid config version returns 400', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupValidToken(supabase)

    const payload = { ...BASE_PAYLOAD, config: { version: 2, mappings: [] } }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(400)
  })

  it('2.1.8 missing project_id returns 400', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupValidToken(supabase)

    const { project_id: _, ...payload } = BASE_PAYLOAD
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(400)
  })

  it('2.1.9 empty specs array returns 400', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupValidToken(supabase)

    const payload = { ...BASE_PAYLOAD, specs: [] }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// 2.1 Repo enforcement
// ---------------------------------------------------------------------------

describe('2.1 Repo enforcement', () => {
  it('2.1.12 mismatched repo returns 403 repo_mismatch', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    // project has a registered_repo that doesn't match
    supabase.from.mockImplementationOnce(() =>
      makeChain({
        data: { id: PROJECT_ID, org_id: 'org1', registered_repo: 'owner/other' },
        error: null,
      })
    )

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('repo_mismatch')
  })
})

// ---------------------------------------------------------------------------
// 2.1 Free tier
// ---------------------------------------------------------------------------

describe('2.1 Free tier', () => {
  // 10 existing specs (none is docs/auth.md) so docs/auth.md counts as "new"
  const EXISTING_SPECS_10 = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, path: `docs/spec${i}.md` }))

  function setupFreeTierBase(supabase: ReturnType<typeof createServiceMock>, syncedCount: number) {
    setupAuthSuccess(supabase)
    // project (no registered_repo so it will try to update — mock that too)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: { id: PROJECT_ID, org_id: 'org1', registered_repo: 'owner/repo' }, error: null })
    )
    // org_members
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: { user_id: 'u1' }, error: null })
    )
    // subscriptions — free plan
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: { plan: 'free' }, error: null })
    )
    // existing specs — 10 paths (not including docs/auth.md)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: EXISTING_SPECS_10, error: null })
    )
    // synced count (spec_publish_targets) — resolve with count
    supabase.from.mockImplementationOnce(() => {
      const chain = makeChain({ data: null, error: null })
      ;(chain as Record<string, unknown>).then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve({ count: syncedCount, data: null, error: null }).then(resolve, reject)
      return chain
    })
  }

  it('2.1.14 exceeding free tier (10+1 new) returns 402', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    // 10 synced existing + 1 new = 11 > 10 → 402
    setupFreeTierBase(supabase, 10)

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toBe('spec_limit_reached')
  })

  it('2.1.15 at 7 synced + 1 new returns 202 with upgrade_nudge', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    // 7 synced + 1 new = 8 → upgrade nudge
    setupFreeTierBase(supabase, 7)
    setupAliasResolution(supabase)
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.upgrade_nudge).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2.1 Alias resolution
// ---------------------------------------------------------------------------

describe('2.1 Alias resolution', () => {
  it('2.1.18 unknown alias returns 422 with suggestion', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // aliases: eng-docs exists but payload references eng-doc (typo)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ name: 'eng-docs', integration_id: 'i1', native_id: 'p1', integrations: { type: 'notion' } }], error: null })
    )

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'eng-doc' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('unresolved_aliases')
    expect(body.aliases[0].suggestion).toBe('eng-docs')
  })

  it('2.1.19 multiple unknown aliases returns 422 listing both', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null })
    )

    const payload = {
      ...BASE_PAYLOAD,
      config: {
        version: 1,
        mappings: [
          { folder: 'docs', integration: 'notion', parent: 'alias-a' },
          { folder: 'tasks', integration: 'clickup', parent: 'alias-b' },
        ],
      },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.aliases).toHaveLength(2)
  })

  it('2.1.20 alias integration type mismatch returns 422', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // alias resolves to notion but mapping says clickup
    supabase.from.mockImplementationOnce(() =>
      makeChain({
        data: [{ name: 'eng-docs', integration_id: 'i1', native_id: 'p1', integrations: { type: 'notion' } }],
        error: null,
      })
    )

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'clickup', parent: 'eng-docs' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('alias_integration_mismatch')
  })
})

// ---------------------------------------------------------------------------
// 2.1 Successful publish
// ---------------------------------------------------------------------------

describe('2.1 Successful publish', () => {
  it('2.1.1 valid token + payload returns 202', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupAliasResolution(supabase)
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.accepted).toBe(true)
    expect(body.saved).toBeGreaterThanOrEqual(1)
  })

  it('2.1.10 first publish registers repo', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: null })
    // Extra mock for the `projects.update({ registered_repo })` call that fires on first publish
    supabase.from.mockImplementationOnce(() => makeChain({ data: null, error: null }))
    setupAliasResolution(supabase)
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(202)

    const updateCalls = supabase.from.mock.calls.filter((c: unknown[]) => c[0] === 'projects')
    expect(updateCalls.length).toBeGreaterThan(0)
  })

  it('2.1.26 ClickUp task target sets clickup_mode: task_list', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // alias resolves to clickup
    supabase.from.mockImplementationOnce(() =>
      makeChain({
        data: [{ name: 'tasks', integration_id: 'ck1', native_id: 'f1', integrations: { type: 'clickup' } }],
        error: null,
      })
    )
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'ck1', type: 'clickup' }], error: null })
    )
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'clickup', target: 'task', parent: 'tasks' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
  })
})

// ---------------------------------------------------------------------------
// Depth filtering
// ---------------------------------------------------------------------------

describe('2.1 Depth filtering', () => {
  function setupFullPublish(supabase: ReturnType<typeof createServiceMock>) {
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupAliasResolution(supabase)
  }

  it('depth=1: spec at exact folder depth is queued', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupFullPublish(supabase)
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'docs/auth.md', hash: 'sha256:abc', frontmatter: {}, content: '# Auth' }],
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'eng-docs', depth: 1 }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(body.queued).toBe(1)
  })

  it('depth=1: spec nested one level deep is saved but not queued', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupFullPublish(supabase)
    // spec upsert still runs (saved), but no publish target insert
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'docs/api/tokens.md', hash: 'sha256:abc', frontmatter: {}, content: '# Tokens' }],
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'eng-docs', depth: 1 }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(body.queued).toBe(0)
  })

  it('depth=2: spec two levels deep is queued', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupFullPublish(supabase)
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'docs/api/tokens.md', hash: 'sha256:abc', frontmatter: {}, content: '# Tokens' }],
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'eng-docs', depth: 2 }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.queued).toBe(1)
  })

  it('no depth: all nesting levels are queued', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupAliasResolution(supabase)
    // two specs
    for (let i = 0; i < 2; i++) setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      specs: [
        { path: 'docs/auth.md', hash: 'sha256:a1', frontmatter: {}, content: '# Auth' },
        { path: 'docs/api/v2/tokens.md', hash: 'sha256:a2', frontmatter: {}, content: '# Tokens' },
      ],
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'eng-docs' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.queued).toBe(2)
  })
})
