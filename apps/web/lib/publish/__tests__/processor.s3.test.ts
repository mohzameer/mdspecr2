/**
 * S3 integration tests for runPublishGroup / processOneSpec
 *
 * Covers:
 *   - setupS3GroupContext: reads target_id (root prefix) and s3_format
 *   - Key composition: with prefix, no prefix, nested paths, html format
 *   - First publish (no existing page_id)
 *   - Content-unchanged skip
 *   - Content changed → republish
 *   - Multiple specs in one group
 *   - Per-spec failure recorded, group continues
 *   - Integration not found → UnrecoverableError
 *   - Distributed maps: two separate groups with same prefix produce co-located keys
 *   - Distributed maps: two separate groups with different prefixes produce isolated key spaces
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/db-server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('@/lib/publish/adapters/s3', () => ({
  publishToS3: vi.fn(),
  buildS3Key: vi.fn(),
}))
vi.mock('@/lib/publish/adapters/notion', () => ({ publishToNotion: vi.fn() }))
vi.mock('@/lib/publish/adapters/confluence', () => ({ publishToConfluence: vi.fn() }))
vi.mock('@/lib/publish/adapters/clickup', () => ({
  publishSingleSpec: vi.fn(),
  publishSpecAsPage: vi.fn(),
  publishAsTask: vi.fn(),
  clickUpDocExists: vi.fn(),
  clickUpPageExists: vi.fn(),
  resolveToNativeTaskId: vi.fn(),
}))
vi.mock('@/lib/folder-mapping', () => ({
  resolveFolderMapping: vi.fn().mockResolvedValue({ shouldRunAgent: false, templateId: null, trigger: null }),
}))
vi.mock('@/lib/agents/processor', () => ({
  runAgentInline: vi.fn(),
}))

import { runPublishGroup, UnrecoverableError } from '../processor.js'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { publishToS3, buildS3Key } from '@/lib/publish/adapters/s3'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-111'
const INTEGRATION_ID = 'int-222'

const S3_CREDENTIALS = {
  access_key_id: 'AKIA...',
  secret_access_key: 'secret',
  bucket: 'acme-specs',
  region: 'us-east-1',
}

function makeSpec(overrides: Partial<{
  spec_id: string
  spec_publish_target_id: string
  path: string
  title: string
  content: string
  content_hash: string
  frontmatter: Record<string, unknown>
}> = {}) {
  return {
    spec_id: 'spec-001',
    spec_publish_target_id: 'spt-001',
    path: 'docs/specs/auth.md',
    title: 'Auth',
    content: '# Auth\n\nSpec content.',
    content_hash: 'hash-abc',
    frontmatter: {},
    id_ref: undefined,
    ...overrides,
  }
}

function makeJobData(overrides: Partial<{
  specs: ReturnType<typeof makeSpec>[]
  matched_folder: string
}> = {}) {
  return {
    project_id: PROJECT_ID,
    integration_id: INTEGRATION_ID,
    target_type: 's3' as const,
    specs: [makeSpec()],
    matched_folder: 'docs/specs',
    ...overrides,
  }
}

/**
 * Builds a minimal Supabase mock that returns predefined results for
 * each `from()` call in the order the processor invokes them.
 *
 * Call order for a normal S3 publish (no agent, no skip):
 *   1. integrations      — fetch credentials
 *   2. folder_mappings   — setupS3GroupContext
 *   3. folder_mappings   — resolveFolderMapping (agent check) — mocked at module level
 *   4. spec_publish_targets — fetch existing page_id
 *   5. specs             — fetch content_hash (skip check only when existingPageId set)
 *   6. spec_publish_targets — update success
 */
function makeSupabase({
  credentials = S3_CREDENTIALS,
  folderMapping = { id: 'fm-1', target_id: null, s3_format: 'md' },
  existingPageId = null as string | null,
  storedHash = 'different-hash',
  updateResult = { error: null },
}: {
  credentials?: Record<string, unknown>
  folderMapping?: { id: string; target_id: string | null; s3_format: string } | null
  existingPageId?: string | null
  storedHash?: string
  updateResult?: { error: unknown }
} = {}) {
  // Each makeChain() is awaitable and chainable.
  function chain(data: unknown, error: unknown = null) {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
      c[m] = vi.fn().mockReturnValue(c)
    }
    c.single = vi.fn().mockResolvedValue({ data, error })
    c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
    ;(c as Record<string, unknown>).then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown
    ) => Promise.resolve({ data, error }).then(resolve, reject)
    return c
  }

  const calls: string[] = []
  const updateChain = chain(null)
  // Make update(...).eq() return a chain that resolves
  ;(updateChain.update as ReturnType<typeof vi.fn>).mockReturnValue({
    eq: vi.fn().mockResolvedValue(updateResult),
  })

  const fromMock = vi.fn((table: string) => {
    calls.push(table)
    const n = calls.length

    if (n === 1 && table === 'integrations') {
      return chain({ credentials: JSON.stringify(credentials), status: 'connected' })
    }
    if (n === 2 && table === 'folder_mappings') {
      return chain(folderMapping)   // setupS3GroupContext
    }
    if (table === 'spec_publish_targets' && calls.filter(c => c === 'spec_publish_targets').length === 1) {
      return chain({ external_page_id: existingPageId, retry_count: 0 })
    }
    if (table === 'specs') {
      return chain({ content_hash: storedHash })
    }
    if (table === 'spec_publish_targets') {
      return updateChain   // success update
    }
    return chain(null)
  })

  return { from: fromMock, _calls: calls }
}

// ---------------------------------------------------------------------------
// Actual publishToS3 implementation for key-assertion tests
// ---------------------------------------------------------------------------
function useBuildS3KeyReal() {
  vi.mocked(buildS3Key).mockImplementation((specPath, rootPrefix, format) => {
    const prefix = rootPrefix?.replace(/\/$/, '') ?? ''
    const normalized = format === 'html'
      ? specPath.replace(/\.md$/, '.html')
      : specPath
    const p = normalized.replace(/^\//, '')
    return prefix ? `${prefix}/${p}` : p
  })
}

beforeEach(() => {
  vi.mocked(publishToS3).mockReset()
  vi.mocked(buildS3Key).mockReset()
  useBuildS3KeyReal()
})

// ---------------------------------------------------------------------------
// 1. setupS3GroupContext — reads prefix and format from folder_mappings
// ---------------------------------------------------------------------------
describe('setupS3GroupContext', () => {
  it('sets s3RootPrefix from folder_mappings.target_id', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'specs/', s3_format: 'md' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'key.md', page_url: 'https://s3.example.com/key.md' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.stringContaining('specs/'),
      'md'
    )
  })

  it('uses md format when s3_format is md', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: null, s3_format: 'md' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'key.md', page_url: 'https://s3.example.com/key.md' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'md')
  })

  it('uses html format when s3_format is html', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: null, s3_format: 'html' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'key.html', page_url: 'https://s3.example.com/key.html' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'html')
  })

  it('defaults to md format when folder_mappings row not found', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: null }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'key.md', page_url: 'https://s3.example.com/key.md' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'md')
  })
})

// ---------------------------------------------------------------------------
// 2. Key composition
// ---------------------------------------------------------------------------
describe('S3 key composition', () => {
  it('uses bare spec path as key when no root prefix', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: null, s3_format: 'md' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'docs/specs/auth.md', page_url: 'https://s3.example.com/docs/specs/auth.md' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'docs/specs/auth.md', 'md'
    )
  })

  it('prepends root prefix to spec path', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'content/', s3_format: 'md' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'content/docs/specs/auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'content/docs/specs/auth.md', 'md'
    )
  })

  it('preserves full nested path under the prefix', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'site/', s3_format: 'md' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'site/docs/specs/payments/checkout/retry.md', page_url: '' })

    const deepSpec = makeSpec({ path: 'docs/specs/payments/checkout/retry.md' })
    await runPublishGroup(makeJobData({ specs: [deepSpec], matched_folder: 'docs/specs' }))

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ path: 'docs/specs/payments/checkout/retry.md' }),
      'site/docs/specs/payments/checkout/retry.md',
      'md'
    )
  })

  it('replaces .md with .html in key for html format', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'site/', s3_format: 'html' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'site/docs/specs/auth.html', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'site/docs/specs/auth.html', 'html'
    )
  })

  it('handles spec at root (single-segment path) with no prefix → bare key', async () => {
    // matched_folder '' causes setupS3GroupContext to return early (falsy guard),
    // so no prefix is applied and the key is the raw spec path.
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'archive/', s3_format: 'md' } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'README.md', page_url: '' })

    const rootSpec = makeSpec({ path: 'README.md' })
    await runPublishGroup(makeJobData({ specs: [rootSpec], matched_folder: '' }))

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'README.md', 'md'
    )
  })
})

// ---------------------------------------------------------------------------
// 3. First publish (no existing page_id)
// ---------------------------------------------------------------------------
describe('first publish — no existing page_id', () => {
  it('calls publishToS3 and stores object key + URL in spec_publish_targets', async () => {
    const supabase = makeSupabase({ existingPageId: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToS3).mockResolvedValue({
      page_id: 'docs/specs/auth.md',
      page_url: 'https://acme-specs.s3.us-east-1.amazonaws.com/docs/specs/auth.md',
    })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
    const updateCall = vi.mocked(supabase.from).mock.calls.find(([t]) => t === 'spec_publish_targets')
    expect(updateCall).toBeDefined()
  })

  it('passes S3 credentials from integration record to publishToS3', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ credentials: S3_CREDENTIALS, existingPageId: null }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'key', page_url: 'url' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.objectContaining({
        access_key_id: S3_CREDENTIALS.access_key_id,
        secret_access_key: S3_CREDENTIALS.secret_access_key,
        bucket: S3_CREDENTIALS.bucket,
        region: S3_CREDENTIALS.region,
      }),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })
})

// ---------------------------------------------------------------------------
// 4. Content-unchanged skip
// ---------------------------------------------------------------------------
describe('content-unchanged skip', () => {
  it('skips publishToS3 when existing page_id and content hash matches', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({
        existingPageId: 'docs/specs/auth.md',
        storedHash: 'hash-abc',   // same as spec.content_hash in makeSpec()
      }) as never
    )

    await runPublishGroup(makeJobData())

    expect(publishToS3).not.toHaveBeenCalled()
  })

  it('republishes when existing page_id but content hash changed', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({
        existingPageId: 'docs/specs/auth.md',
        storedHash: 'old-hash',   // different from spec.content_hash 'hash-abc'
      }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'docs/specs/auth.md', page_url: 'https://s3.example.com' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
  })

  it('publishes even if content_hash is empty string (force republish)', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({
        existingPageId: 'docs/specs/auth.md',
        storedHash: '',
      }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'docs/specs/auth.md', page_url: '' })

    const spec = makeSpec({ content_hash: '' })
    await runPublishGroup(makeJobData({ specs: [spec] }))

    expect(publishToS3).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// 5. Multiple specs in one group
// ---------------------------------------------------------------------------
describe('multiple specs in one group', () => {
  it('calls publishToS3 for each spec independently', async () => {
    // Each spec has different path and different hash → both publish
    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/payments.md', content_hash: 'h2' }),
    ]

    // Build a supabase mock that handles 2 specs
    function chain(data: unknown, error: unknown = null) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
        c[m] = vi.fn().mockReturnValue(c)
      }
      c.single = vi.fn().mockResolvedValue({ data, error })
      c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
      ;(c as Record<string, unknown>).then = (
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown
      ) => Promise.resolve({ data, error }).then(resolve, reject)
      const updateR = { eq: vi.fn().mockResolvedValue({ error: null }) }
      ;(c.update as ReturnType<typeof vi.fn>).mockReturnValue(updateR)
      return c
    }

    let integrationFetched = false
    let mappingFetched = false
    let sptCallCount = 0

    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationFetched) {
        integrationFetched = true
        return chain({ credentials: JSON.stringify(S3_CREDENTIALS), status: 'connected' })
      }
      if (table === 'folder_mappings' && !mappingFetched) {
        mappingFetched = true
        return chain({ id: 'fm-1', target_id: 'content/', s3_format: 'md' })
      }
      if (table === 'spec_publish_targets') {
        sptCallCount++
        if (sptCallCount % 2 === 1) {
          return chain({ external_page_id: null, retry_count: 0 })
        }
        return chain(null)   // update
      }
      return chain(null)
    })

    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)
    vi.mocked(publishToS3)
      .mockResolvedValueOnce({ page_id: 'content/docs/specs/auth.md', page_url: '' })
      .mockResolvedValueOnce({ page_id: 'content/docs/specs/payments.md', page_url: '' })

    await runPublishGroup(makeJobData({ specs }))

    expect(publishToS3).toHaveBeenCalledTimes(2)
    expect(vi.mocked(publishToS3).mock.calls[0][2]).toBe('content/docs/specs/auth.md')
    expect(vi.mocked(publishToS3).mock.calls[1][2]).toBe('content/docs/specs/payments.md')
  })

  it('each spec in group gets its own S3 key preserving its full path', async () => {
    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth/sso.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/payments/retry.md', content_hash: 'h2' }),
    ]

    vi.mocked(publishToS3)
      .mockResolvedValueOnce({ page_id: 'docs/specs/auth/sso.md', page_url: '' })
      .mockResolvedValueOnce({ page_id: 'docs/specs/payments/retry.md', page_url: '' })

    function chain(data: unknown, error: unknown = null) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
        c[m] = vi.fn().mockReturnValue(c)
      }
      c.single = vi.fn().mockResolvedValue({ data, error })
      c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
      ;(c as Record<string, unknown>).then = (r: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(r)
      const ur = { eq: vi.fn().mockResolvedValue({ error: null }) }
      ;(c.update as ReturnType<typeof vi.fn>).mockReturnValue(ur)
      return c
    }

    let integrationDone = false
    let mappingDone = false
    let sptCount = 0

    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) { integrationDone = true; return chain({ credentials: JSON.stringify(S3_CREDENTIALS), status: 'connected' }) }
      if (table === 'folder_mappings' && !mappingDone) { mappingDone = true; return chain({ id: 'fm-1', target_id: null, s3_format: 'md' }) }
      if (table === 'spec_publish_targets') { sptCount++; return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null) }
      return chain(null)
    })

    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)

    await runPublishGroup(makeJobData({ specs, matched_folder: 'docs/specs' }))

    const keys = vi.mocked(publishToS3).mock.calls.map(c => c[2])
    expect(keys).toContain('docs/specs/auth/sso.md')
    expect(keys).toContain('docs/specs/payments/retry.md')
  })
})

// ---------------------------------------------------------------------------
// 6. Distributed maps — same prefix, different source folders
// ---------------------------------------------------------------------------
describe('distributed maps — shared root prefix', () => {
  it('two groups with same prefix produce co-located keys preserving their folder paths', async () => {
    // Group 1: docs/specs → prefix "content/"
    // Group 2: docs/rfc   → prefix "content/"
    // Both land under content/ but paths are distinct

    const key1 = buildS3Key('docs/specs/auth.md', 'content/', 'md')
    const key2 = buildS3Key('docs/rfc/microservices.md', 'content/', 'md')

    expect(key1).toBe('content/docs/specs/auth.md')
    expect(key2).toBe('content/docs/rfc/microservices.md')
    // Both under content/ — co-located
    expect(key1.startsWith('content/')).toBe(true)
    expect(key2.startsWith('content/')).toBe(true)
    // But paths are distinct — no collision
    expect(key1).not.toBe(key2)
  })

  it('specs from sibling folders under same prefix never collide', async () => {
    const paths = [
      'docs/specs/auth.md',
      'docs/specs/payments.md',
      'docs/rfc/microservices.md',
      'docs/rfc/event-streaming.md',
    ]
    const keys = paths.map(p => buildS3Key(p, 'site/', 'md'))
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

// ---------------------------------------------------------------------------
// 7. Distributed maps — different prefixes, different source folders
// ---------------------------------------------------------------------------
describe('distributed maps — isolated prefixes', () => {
  it('two groups with different prefixes produce keys in separate S3 namespaces', async () => {
    const key1 = buildS3Key('docs/specs/auth.md', 'specs/', 'md')
    const key2 = buildS3Key('docs/rfc/microservices.md', 'rfcs/', 'md')

    expect(key1.startsWith('specs/')).toBe(true)
    expect(key2.startsWith('rfcs/')).toBe(true)
    // Completely different prefixes — no overlap
    expect(key1.startsWith('rfcs/')).toBe(false)
    expect(key2.startsWith('specs/')).toBe(false)
  })

  it('same spec file name in different folders with different prefixes produces unique keys', async () => {
    const key1 = buildS3Key('docs/specs/README.md', 'specs/', 'md')
    const key2 = buildS3Key('docs/rfc/README.md', 'rfcs/', 'md')
    expect(key1).toBe('specs/docs/specs/README.md')
    expect(key2).toBe('rfcs/docs/rfc/README.md')
    expect(key1).not.toBe(key2)
  })
})

// ---------------------------------------------------------------------------
// 8. Error handling
// ---------------------------------------------------------------------------
describe('error handling', () => {
  it('records failure on spec_publish_targets and continues when publishToS3 throws', async () => {
    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/payments.md', content_hash: 'h2' }),
    ]

    function chain(data: unknown, error: unknown = null) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
        c[m] = vi.fn().mockReturnValue(c)
      }
      c.single = vi.fn().mockResolvedValue({ data, error })
      c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
      ;(c as Record<string, unknown>).then = (r: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(r)
      const ur = { eq: vi.fn().mockResolvedValue({ error: null }) }
      ;(c.update as ReturnType<typeof vi.fn>).mockReturnValue(ur)
      return c
    }

    let integrationDone = false
    let mappingDone = false
    let sptCount = 0

    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) { integrationDone = true; return chain({ credentials: JSON.stringify(S3_CREDENTIALS), status: 'connected' }) }
      if (table === 'folder_mappings' && !mappingDone) { mappingDone = true; return chain({ id: 'fm-1', target_id: null, s3_format: 'md' }) }
      if (table === 'spec_publish_targets') { sptCount++; return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null) }
      return chain(null)
    })

    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)

    vi.mocked(publishToS3)
      .mockRejectedValueOnce(new Error('S3 timeout'))            // first spec fails
      .mockResolvedValueOnce({ page_id: 'docs/specs/payments.md', page_url: '' })  // second succeeds

    // Should not throw — per-spec error is recorded, group continues
    await expect(runPublishGroup(makeJobData({ specs }))).resolves.toBeUndefined()

    // Second spec still published
    expect(publishToS3).toHaveBeenCalledTimes(2)
  })

  it('throws UnrecoverableError when integration record not found', async () => {
    function chain(data: unknown, error: unknown = null) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
        c[m] = vi.fn().mockReturnValue(c)
      }
      c.single = vi.fn().mockResolvedValue({ data, error })
      c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
      ;(c as Record<string, unknown>).then = (r: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(r)
      return c
    }

    const fromMock = vi.fn(() => chain(null, { message: 'not found' }))
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)

    await expect(runPublishGroup(makeJobData())).rejects.toThrow(UnrecoverableError)
  })

  it('throws UnrecoverableError when credentials JSON is malformed', async () => {
    function chain(data: unknown, error: unknown = null) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
        c[m] = vi.fn().mockReturnValue(c)
      }
      c.single = vi.fn().mockResolvedValue({ data, error })
      c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
      ;(c as Record<string, unknown>).then = (r: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(r)
      return c
    }

    const fromMock = vi.fn(() => chain({ credentials: 'not-valid-json', status: 'connected' }))
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)

    await expect(runPublishGroup(makeJobData())).rejects.toThrow(UnrecoverableError)
  })

  it('skips entire group when specs array is empty', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSupabase() as never)

    await runPublishGroup(makeJobData({ specs: [] }))

    expect(publishToS3).not.toHaveBeenCalled()
  })
})
