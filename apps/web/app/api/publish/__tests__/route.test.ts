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
    mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:eng-docs' }],
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
  // active integrations (fetched before alias resolution now)
  supabase.from.mockImplementationOnce(() =>
    makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
  )
  // aliases
  supabase.from.mockImplementationOnce(() =>
    makeChain({
      data: [{ name: 'eng-docs', integration_id: 'int1', native_id: 'page1', integrations: { type: 'notion' } }],
      error: null,
    })
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

  it('2.1.14 exceeding free tier (15+1 new) returns 402', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    // 15 synced existing + 1 new = 16 > 15 → 402
    setupFreeTierBase(supabase, 15)

    const res = await POST(makeRequest(BASE_PAYLOAD))
    expect(res.status).toBe(402)
    const body = await res.json()
    expect(body.error).toBe('spec_limit_reached')
  })

  it('2.1.15 at 12 synced + 1 new returns 202 with upgrade_nudge', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    // 12 synced + 1 new = 13 >= 12 → upgrade nudge
    setupFreeTierBase(supabase, 12)
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
    // integrations
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'i1', type: 'notion' }], error: null })
    )
    // aliases: eng-docs exists but payload references eng-doc (typo)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ name: 'eng-docs', integration_id: 'i1', native_id: 'p1', integrations: { type: 'notion' } }], error: null })
    )

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:eng-doc' }] },
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
    // integrations
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'i1', type: 'notion' }, { id: 'i2', type: 'clickup' }], error: null })
    )
    // aliases — empty
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null })
    )

    const payload = {
      ...BASE_PAYLOAD,
      config: {
        version: 1,
        mappings: [
          { folder: 'docs', integration: 'notion', parent: 'alias:alias-a' },
          { folder: 'tasks', integration: 'clickup', parent: 'alias:alias-b' },
        ],
      },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.aliases).toHaveLength(2)
  })

  it('2.1.20 alias: prefix with unresolved name returns 422', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // integrations
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
    )
    // aliases — returns empty (alias not found)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null })
    )

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:missing-alias' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe('unresolved_aliases')
  })

  it('id: prefix uses native ID directly without alias lookup — returns 202', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // integrations — notion connected
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
    )
    // no alias lookup should happen — but mock returns empty just in case
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null })
    )
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'id:page_abc123' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.accepted).toBe(true)
  })

  it('bare value falls back to raw ID when no alias matches — returns 202', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // integrations
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
    )
    // alias lookup returns nothing — bare value falls back to raw ID
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [], error: null })
    )
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'raw-native-id' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.accepted).toBe(true)
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
    // integrations (now fetched first)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'ck1', type: 'clickup' }], error: null })
    )
    // alias resolves to clickup
    supabase.from.mockImplementationOnce(() =>
      makeChain({
        data: [{ name: 'tasks', integration_id: 'ck1', native_id: 'f1', integrations: { type: 'clickup' } }],
        error: null,
      })
    )
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'clickup', target: 'task', parent: 'alias:tasks' }] },
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
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:eng-docs', depth: 1 }] },
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
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:eng-docs', depth: 1 }] },
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
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:eng-docs', depth: 2 }] },
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
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion', parent: 'alias:eng-docs' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.queued).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// 2.1 reconcileFolderMappings — folder_mappings DB sync
// ---------------------------------------------------------------------------

describe('2.1 reconcileFolderMappings', () => {
  function setupIntegrationsOnly(supabase: ReturnType<typeof createServiceMock>, type = 'notion', id = 'int1') {
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id, type }], error: null })
    )
  }

  function setupSpecUpsertNoTarget(supabase: ReturnType<typeof createServiceMock>) {
    // spec upsert succeeds
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: { id: 'spec1' }, error: null })
    )
    // spec_publish_targets maybySingle → null (new)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: null, error: null })
    )
    // spec_publish_targets insert
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: { id: 'tgt1', external_page_id: null }, error: null })
    )
  }

  it('upserts folder_mappings table after a successful publish', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase)
    setupSpecUpsertNoTarget(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    const folderMappingCalls = supabase.from.mock.calls.filter((c: unknown[]) => c[0] === 'folder_mappings')
    expect(folderMappingCalls.length).toBeGreaterThan(0)
  })

  it('skips folder_mappings upsert when commit_timestamp is absent', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase)
    setupSpecUpsertNoTarget(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const { commit_timestamp: _, ...payloadWithoutTimestamp } = BASE_PAYLOAD
    const payload = {
      ...payloadWithoutTimestamp,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    const folderMappingCalls = supabase.from.mock.calls.filter((c: unknown[]) => c[0] === 'folder_mappings')
    expect(folderMappingCalls.length).toBe(0)
  })

  it('second publish with different integration overwrites folder_mappings DB row', async () => {
    // First publish with notion
    const supabase1 = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase1 as never)
    setupAuthSuccess(supabase1)
    setupProjectAndOrg(supabase1, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase1, 'notion', 'int-notion')
    setupSpecUpsertNoTarget(supabase1)
    supabase1.from.mockImplementation(() => makeChain({ data: null, error: null }))

    await POST(makeRequest({ ...BASE_PAYLOAD, config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion' }] } }))
    const fm1 = supabase1.from.mock.calls.filter((c: unknown[]) => c[0] === 'folder_mappings')
    expect(fm1.length).toBeGreaterThan(0)

    // Second publish with clickup — new client simulates fresh request
    const supabase2 = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase2 as never)
    setupAuthSuccess(supabase2)
    setupProjectAndOrg(supabase2, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase2, 'clickup', 'int-clickup')
    setupSpecUpsertNoTarget(supabase2)
    supabase2.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const res2 = await POST(makeRequest({ ...BASE_PAYLOAD, config: { version: 1, mappings: [{ folder: 'docs', integration: 'clickup' }] } }))
    expect(res2.status).toBe(202)

    const fm2 = supabase2.from.mock.calls.filter((c: unknown[]) => c[0] === 'folder_mappings')
    expect(fm2.length).toBeGreaterThan(0)
  })

  it('deletes stale rows for covered folders before upserting — integration change (clickup → s3)', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase, 's3', 'int-s3')
    setupSpecUpsertNoTarget(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    // Config maps 'src' to s3 — previously it was clickup (stale DB rows exist)
    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'src/App.jsx', hash: 'sha256:abc', frontmatter: {}, content: '# App' }],
      config: { version: 1, mappings: [{ folder: 'src', integration: 's3', parent_dir: 'eng-specs' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    // A delete call must have been made against folder_mappings for 'src'
    const deleteCalls = supabase.from.mock.calls
      .map((c: unknown[], i: number) => ({ table: c[0], chain: supabase.from.mock.results[i]?.value }))
      .filter(({ table }) => table === 'folder_mappings')
    expect(deleteCalls.length).toBeGreaterThan(0)

    // Verify delete was called (the chain includes a .delete() invocation)
    const folderMappingChains = supabase.from.mock.results
      .filter((_: unknown, i: number) => supabase.from.mock.calls[i]?.[0] === 'folder_mappings')
      .map((r: { value: Record<string, unknown> }) => r.value)
    const deleteChain = folderMappingChains.find((chain: Record<string, unknown>) =>
      (chain.delete as ReturnType<typeof vi.fn>)?.mock?.calls?.length > 0
    )
    expect(deleteChain).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // S3 destination-change cascade — the publish route reconciles
  // folder_mappings when the CLI re-pushes .mdspecmap. If the new config
  // changes a destination-defining field (S3 prefix, hierarchy toggle), the
  // dependent spec_publish_targets MUST be invalidated. Without that, the
  // publish processor's "skip when content unchanged" branch keeps writing
  // to the old S3 keys forever — the operator sees no effect from changing
  // parent_dir or maintain_hierarchy in their .mdspecmap.
  // -------------------------------------------------------------------------
  function makeReconcileCascadeMock(
    existingMappings: Array<Record<string, unknown>>,
    sptUpdates: Array<{ patch: Record<string, unknown> }>,
    integrationType: string = 's3',
    integrationId: string = 'int-s3'
  ) {
    const supabase = createServiceMock()
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase, integrationType, integrationId)
    setupSpecUpsertNoTarget(supabase)

    supabase.from.mockImplementation((table: string) => {
      if (table === 'folder_mappings') {
        // SELECT (fetch existing before delete), DELETE, and UPSERT all
        // resolve to this same chain. Only the SELECT result is used.
        return makeChain({ data: existingMappings, error: null })
      }
      if (table === 'specs') {
        // Cascade query: list spec ids in the folder.
        return makeChain({ data: [{ id: 'spec1' }], error: null })
      }
      if (table === 'spec_publish_targets') {
        const chain = makeChain({ data: null, error: null })
        ;(chain.update as ReturnType<typeof vi.fn>).mockImplementation((patch: Record<string, unknown>) => {
          sptUpdates.push({ patch })
          return chain
        })
        return chain
      }
      return makeChain({ data: null, error: null })
    })

    return supabase
  }

  it('cascades to spec_publish_targets when S3 parent_dir (target_id) changes via .mdspecmap', async () => {
    const sptUpdates: Array<{ patch: Record<string, unknown> }> = []
    const supabase = makeReconcileCascadeMock(
      [{
        folder_path: 'src',
        integration_id: 'int-s3',
        target_id: 'old-prefix',
        s3_maintain_hierarchy: false,
        clickup_doc_id: null,
        clickup_list_id: null,
        clickup_mode: 'doc',
      }],
      sptUpdates
    )
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'src/App.jsx', hash: 'sha256:abc', frontmatter: {}, content: '# App' }],
      config: { version: 1, mappings: [{ folder: 'src', integration: 's3', parent_dir: 'new-prefix' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    const cascade = sptUpdates.find((u) => u.patch.external_page_id === null && u.patch.content_hash === null)
    expect(cascade, 'expected dependent spec_publish_targets to be invalidated').toBeDefined()
  })

  it('cascades when s3_maintain_hierarchy toggles via .mdspecmap', async () => {
    const sptUpdates: Array<{ patch: Record<string, unknown> }> = []
    const supabase = makeReconcileCascadeMock(
      [{
        folder_path: 'src',
        integration_id: 'int-s3',
        target_id: 'same-prefix',
        s3_maintain_hierarchy: false,
        clickup_doc_id: null,
        clickup_list_id: null,
        clickup_mode: 'doc',
      }],
      sptUpdates
    )
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'src/App.jsx', hash: 'sha256:abc', frontmatter: {}, content: '# App' }],
      config: {
        version: 1,
        mappings: [{
          folder: 'src',
          integration: 's3',
          parent_dir: 'same-prefix',
          maintain_hierarchy: true,
        }],
      },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    const cascade = sptUpdates.find((u) => u.patch.external_page_id === null && u.patch.content_hash === null)
    expect(
      cascade,
      'flipping hierarchy reshapes every S3 key — dependents must be invalidated'
    ).toBeDefined()
  })

  it('does NOT cascade when S3 destination fields are unchanged', async () => {
    const sptUpdates: Array<{ patch: Record<string, unknown> }> = []
    const supabase = makeReconcileCascadeMock(
      [{
        folder_path: 'src',
        integration_id: 'int-s3',
        target_id: 'same-prefix',
        s3_maintain_hierarchy: false,
        clickup_doc_id: null,
        clickup_list_id: null,
        clickup_mode: 'doc',
      }],
      sptUpdates
    )
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'src/App.jsx', hash: 'sha256:abc', frontmatter: {}, content: '# App' }],
      config: {
        version: 1,
        mappings: [{
          folder: 'src',
          integration: 's3',
          parent_dir: 'same-prefix',
          maintain_hierarchy: false,
        }],
      },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    const cascade = sptUpdates.find((u) => u.patch.external_page_id === null && u.patch.content_hash === null)
    expect(cascade, 'identical config must not trigger invalidation').toBeUndefined()
  })

  it('does NOT cascade when no prior folder_mapping existed (fresh mapping)', async () => {
    const sptUpdates: Array<{ patch: Record<string, unknown> }> = []
    const supabase = makeReconcileCascadeMock([], sptUpdates) // no existing rows
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'src/App.jsx', hash: 'sha256:abc', frontmatter: {}, content: '# App' }],
      config: { version: 1, mappings: [{ folder: 'src', integration: 's3', parent_dir: 'fresh-prefix' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)

    const cascade = sptUpdates.find((u) => u.patch.external_page_id === null && u.patch.content_hash === null)
    expect(cascade, 'new mappings have no published history to invalidate').toBeUndefined()
  })

  it('does not delete rows for uncovered folders (root is never touched)', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    setupIntegrationsOnly(supabase, 'notion', 'int1')
    setupSpecUpsertNoTarget(supabase)

    const deletedFolders: string[][] = []
    supabase.from.mockImplementation((table: string) => {
      const chain = makeChain({ data: null, error: null })
      if (table === 'folder_mappings') {
        // Intercept .in() calls to capture which folder_paths are being deleted
        ;(chain.in as ReturnType<typeof vi.fn>).mockImplementation((_col: string, vals: string[]) => {
          deletedFolders.push(vals)
          return chain
        })
      }
      return chain
    })

    // Config only maps 'docs' (non-root) — root '' must not appear in deletes
    const payload = {
      ...BASE_PAYLOAD,
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion' }] },
    }
    await POST(makeRequest(payload))

    // Every delete batch must contain only non-root folders
    for (const batch of deletedFolders) {
      expect(batch).not.toContain('')
    }
  })
})

// ---------------------------------------------------------------------------
// 2.1 UI-only mapping routing — DB mappings not in .mdspecmap are ignored
// ---------------------------------------------------------------------------

describe('2.1 UI-only mapping routing', () => {
  it('spec in folder with DB-only mapping is saved but not queued', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    // integrations present
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
    )
    // spec upsert (spec is saved to DB regardless of routing)
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: { id: 'spec1' }, error: null })
    )
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      // Spec lives in 'ui-only/' which exists in DB but is absent from payload config
      specs: [{ path: 'ui-only/spec.md', hash: 'sha256:abc', frontmatter: {}, content: '# Spec' }],
      // Config only maps 'docs' — ui-only folder has no entry here
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(body.queued).toBe(0)
  })

  it('spec in correctly mapped folder is both saved and queued', async () => {
    const supabase = createServiceMock()
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    setupAuthSuccess(supabase)
    setupProjectAndOrg(supabase, { registered_repo: 'owner/repo' })
    supabase.from.mockImplementationOnce(() =>
      makeChain({ data: [{ id: 'int1', type: 'notion' }], error: null })
    )
    setupSpecUpsert(supabase)
    supabase.from.mockImplementation(() => makeChain({ data: null, error: null }))

    const payload = {
      ...BASE_PAYLOAD,
      specs: [{ path: 'docs/auth.md', hash: 'sha256:abc', frontmatter: {}, content: '# Auth' }],
      config: { version: 1, mappings: [{ folder: 'docs', integration: 'notion' }] },
    }
    const res = await POST(makeRequest(payload))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(body.queued).toBe(1)
  })
})
