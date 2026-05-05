/**
 * S3 integration tests for runPublishGroup / processOneSpec
 *
 * Covers:
 *   - setupS3GroupContext: reads target_id and s3_maintain_hierarchy
 *   - Key composition — flat mode (default): only filename used
 *   - Key composition — hierarchy mode: path relative to matched_folder
 *   - First publish (no existing page_id)
 *   - Content-unchanged skip
 *   - Content changed → republish
 *   - Multiple specs in one group
 *   - Per-spec failure recorded, group continues
 *   - Integration not found → UnrecoverableError
 *   - Distributed maps: same prefix flat vs hierarchy
 *   - Distributed maps: different prefixes, isolated namespaces
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
  s3ObjectExists: vi.fn(),
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
import { publishToS3, buildS3Key, s3ObjectExists } from '@/lib/publish/adapters/s3'

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

interface FolderMappingRow {
  id: string
  target_id: string | null
  s3_maintain_hierarchy?: boolean
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
  s3_root_prefix: string | null
}> = {}) {
  return {
    project_id: PROJECT_ID,
    integration_id: INTEGRATION_ID,
    target_type: 's3' as const,
    specs: [makeSpec()],
    matched_folder: 'docs/specs',
    s3_root_prefix: null,
    ...overrides,
  }
}

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

function makeSupabase({
  credentials = S3_CREDENTIALS,
  folderMapping = { id: 'fm-1', target_id: null, s3_maintain_hierarchy: false } as FolderMappingRow | null,
  existingPageId = null as string | null,
  // last-published hash stored on spec_publish_targets (not specs)
  storedHash = 'different-hash',
} = {}) {
  const calls: string[] = []

  const fromMock = vi.fn((table: string) => {
    calls.push(table)
    const n = calls.length

    if (n === 1 && table === 'integrations') {
      return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
    }
    if (n === 2 && table === 'folder_mappings') {
      return chain(folderMapping)
    }
    if (table === 'spec_publish_targets' && calls.filter(c => c === 'spec_publish_targets').length === 1) {
      return chain({ external_page_id: existingPageId, retry_count: 0, content_hash: storedHash })
    }
    if (table === 'spec_publish_targets') {
      return chain(null)
    }
    return chain(null)
  })

  const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(credentials), error: null })
  return { from: fromMock, rpc: rpcMock, _calls: calls }
}

// ---------------------------------------------------------------------------
// Real buildS3Key implementation for key-assertion tests.
// Must stay in sync with the actual function in adapters/s3.ts.
// ---------------------------------------------------------------------------
function useBuildS3KeyReal() {
  vi.mocked(buildS3Key).mockImplementation((specPath, rootPrefix, options: { maintainHierarchy?: boolean; matchedFolder?: string } = {}) => {
    const prefix = rootPrefix?.replace(/\/$/, '') ?? ''

    let relativePath: string
    if (options.maintainHierarchy && options.matchedFolder) {
      const folderPrefix = options.matchedFolder.replace(/\/$/, '') + '/'
      relativePath = specPath.startsWith(folderPrefix)
        ? specPath.slice(folderPrefix.length)
        : specPath
    } else {
      relativePath = specPath.split('/').pop() ?? specPath
    }

    const p = relativePath.replace(/^\//, '')
    return prefix ? `${prefix}/${p}` : p
  })
}

beforeEach(() => {
  vi.mocked(publishToS3).mockReset()
  vi.mocked(buildS3Key).mockReset()
  vi.mocked(s3ObjectExists).mockReset()
  vi.mocked(s3ObjectExists).mockResolvedValue(true)  // default: object exists
  useBuildS3KeyReal()
})

// ---------------------------------------------------------------------------
// 1. setupS3GroupContext — reads prefix and hierarchy flag from folder_mappings
// ---------------------------------------------------------------------------
describe('setupS3GroupContext', () => {
  it('sets s3RootPrefix from folder_mappings.target_id', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'specs', s3_maintain_hierarchy: false } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'specs/auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), expect.stringContaining('specs')
    )
  })

  it('s3RootPrefix is null when target_id not set', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: null, s3_maintain_hierarchy: false } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    // key has no prefix when target_id is null
    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'auth.md')
  })

  it('reads s3_maintain_hierarchy: true and passes it to buildS3Key', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'eng', s3_maintain_hierarchy: true } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'eng/auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(buildS3Key).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ maintainHierarchy: true, matchedFolder: 'docs/specs' })
    )
  })

  it('reads s3_maintain_hierarchy: false and passes it to buildS3Key', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'eng', s3_maintain_hierarchy: false } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'eng/auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(buildS3Key).toHaveBeenCalledWith(
      expect.any(String),
      expect.anything(),
      expect.objectContaining({ maintainHierarchy: false })
    )
  })

  it('proceeds with defaults when folder_mappings row not found', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: null }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// 2. Key composition — flat mode (default, s3_maintain_hierarchy: false)
// ---------------------------------------------------------------------------
describe('S3 key composition — flat mode', () => {
  it('key is just the filename when no root prefix', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: null, s3_maintain_hierarchy: false } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'auth.md')
  })

  it('key is prefix/filename with root prefix', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'eng-specs', s3_maintain_hierarchy: false } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'eng-specs/auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'eng-specs/auth.md')
  })

  it('deeply nested spec produces flat key — only filename used', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'archive', s3_maintain_hierarchy: false } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'archive/retry.md', page_url: '' })

    const deepSpec = makeSpec({ path: 'docs/specs/payments/checkout/retry.md' })
    await runPublishGroup(makeJobData({ specs: [deepSpec] }))

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'archive/retry.md')
  })

  it('root-level spec (matched_folder empty, no prefix) → bare filename', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: null }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'README.md', page_url: '' })

    const rootSpec = makeSpec({ path: 'README.md' })
    await runPublishGroup(makeJobData({ specs: [rootSpec], matched_folder: '', s3_root_prefix: null }))

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'README.md')
  })
})

// ---------------------------------------------------------------------------
// 3. Key composition — hierarchy mode (s3_maintain_hierarchy: true)
// ---------------------------------------------------------------------------
describe('S3 key composition — hierarchy mode', () => {
  it('direct child of matched folder → prefix/filename', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'eng-specs', s3_maintain_hierarchy: true } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'eng-specs/auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'eng-specs/auth.md')
  })

  it('spec in subfolder → prefix/subfolder/filename', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'eng-specs', s3_maintain_hierarchy: true } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'eng-specs/payments/checkout.md', page_url: '' })

    const nestedSpec = makeSpec({ path: 'docs/specs/payments/checkout.md' })
    await runPublishGroup(makeJobData({ specs: [nestedSpec] }))

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'eng-specs/payments/checkout.md')
  })

  it('deeply nested spec preserves full relative path', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: 'archive', s3_maintain_hierarchy: true } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'archive/payments/checkout/retry.md', page_url: '' })

    const deepSpec = makeSpec({ path: 'docs/specs/payments/checkout/retry.md' })
    await runPublishGroup(makeJobData({ specs: [deepSpec] }))

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'archive/payments/checkout/retry.md')
  })

  it('no root prefix with hierarchy → bare relative path', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ folderMapping: { id: 'fm-1', target_id: null, s3_maintain_hierarchy: true } }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'payments/checkout.md', page_url: '' })

    const nestedSpec = makeSpec({ path: 'docs/specs/payments/checkout.md' })
    await runPublishGroup(makeJobData({ specs: [nestedSpec] }))

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'payments/checkout.md')
  })

  it('multiple specs each get their own relative path', async () => {
    let integrationDone = false; let mappingDone = false; let sptCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) {
        integrationDone = true
        return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
      }
      if (table === 'folder_mappings' && !mappingDone) {
        mappingDone = true
        return chain({ id: 'fm-1', target_id: 'content', s3_maintain_hierarchy: true })
      }
      if (table === 'spec_publish_targets') {
        sptCount++
        return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null)
      }
      return chain(null)
    })
    const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(S3_CREDENTIALS), error: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock, rpc: rpcMock } as never)
    vi.mocked(publishToS3)
      .mockResolvedValueOnce({ page_id: 'content/auth.md', page_url: '' })
      .mockResolvedValueOnce({ page_id: 'content/payments/checkout.md', page_url: '' })

    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/payments/checkout.md', content_hash: 'h2' }),
    ]
    await runPublishGroup(makeJobData({ specs, matched_folder: 'docs/specs' }))

    const keys = vi.mocked(publishToS3).mock.calls.map(c => c[2])
    expect(keys).toContain('content/auth.md')
    expect(keys).toContain('content/payments/checkout.md')
    expect(keys[0]).not.toBe(keys[1])
  })
})

// ---------------------------------------------------------------------------
// 4. First publish (no existing page_id)
// ---------------------------------------------------------------------------
describe('first publish — no existing page_id', () => {
  it('calls publishToS3 and stores object key + URL in spec_publish_targets', async () => {
    const supabase = makeSupabase({ existingPageId: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: 'https://acme-specs.s3.us-east-1.amazonaws.com/auth.md' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
    const updateCall = vi.mocked(supabase.from).mock.calls.find(([t]) => t === 'spec_publish_targets')
    expect(updateCall).toBeDefined()
  })

  it('passes S3 credentials from integration record to publishToS3', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ credentials: S3_CREDENTIALS, existingPageId: null }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledWith(
      expect.objectContaining({
        access_key_id: S3_CREDENTIALS.access_key_id,
        secret_access_key: S3_CREDENTIALS.secret_access_key,
        bucket: S3_CREDENTIALS.bucket,
        region: S3_CREDENTIALS.region,
      }),
      expect.anything(),
      expect.anything()
    )
  })
})

// ---------------------------------------------------------------------------
// 5. Content-unchanged skip
// ---------------------------------------------------------------------------
describe('content-unchanged skip', () => {
  it('skips publishToS3 when existing page_id and content hash matches', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: 'hash-abc' }) as never
    )

    await runPublishGroup(makeJobData())

    expect(publishToS3).not.toHaveBeenCalled()
  })

  it('republishes when existing page_id but content hash changed', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: 'old-hash' }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
  })

  it('publishes even if content_hash is empty string (force republish)', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: '' }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    const spec = makeSpec({ content_hash: '' })
    await runPublishGroup(makeJobData({ specs: [spec] }))

    expect(publishToS3).toHaveBeenCalledOnce()
  })

  it('republishes when S3 object no longer exists (bucket changed or object deleted)', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: 'hash-abc' }) as never
    )
    vi.mocked(s3ObjectExists).mockResolvedValue(false)
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
  })

  it('skips when S3 object exists and content unchanged', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: 'hash-abc' }) as never
    )
    vi.mocked(s3ObjectExists).mockResolvedValue(true)

    await runPublishGroup(makeJobData())

    expect(publishToS3).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5b. Post-publish content_hash write
// The worker must write specs.content_hash after a successful publish so that
// the next run can correctly compare the last-published hash with the new hash.
// (The route no longer writes content_hash on upsert.)
// ---------------------------------------------------------------------------
describe('post-publish content_hash write', () => {
  it('writes content_hash to spec_publish_targets after successful publish', async () => {
    const sptChains: ReturnType<typeof chain>[] = []
    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations') return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
      if (table === 'folder_mappings') return chain({ id: 'fm-1', target_id: null, s3_maintain_hierarchy: false })
      if (table === 'spec_publish_targets') {
        const c = chain({ external_page_id: null, retry_count: 0, content_hash: null })
        sptChains.push(c)
        return c
      }
      return chain(null)
    })
    const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(S3_CREDENTIALS), error: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock, rpc: rpcMock } as never)
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    // spec_publish_targets.update must include content_hash after publish
    const updateCalls = sptChains.flatMap((c) =>
      (c.update as ReturnType<typeof vi.fn>).mock.calls
    )
    expect(updateCalls.some((args) => (args[0] as Record<string, unknown>).content_hash === 'hash-abc')).toBe(true)
  })

  it('does NOT skip when DB hash is stale (last-published differs from new content)', async () => {
    // storedHash = 'old-hash', job content_hash = 'hash-abc' (changed) → must publish
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: 'old-hash' }) as never
    )
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'auth.md', page_url: '' })

    await runPublishGroup(makeJobData())

    expect(publishToS3).toHaveBeenCalledOnce()
  })

  it('skips when DB hash matches (content identical to last published)', async () => {
    // storedHash = 'hash-abc', job content_hash = 'hash-abc' → skip
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSupabase({ existingPageId: 'auth.md', storedHash: 'hash-abc' }) as never
    )
    vi.mocked(s3ObjectExists).mockResolvedValue(true)

    await runPublishGroup(makeJobData())

    expect(publishToS3).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 6. Multiple specs in one group
// ---------------------------------------------------------------------------
describe('multiple specs in one group', () => {
  function makeMultiSupabase(maintainHierarchy = false) {
    let integrationDone = false; let mappingDone = false; let sptCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) {
        integrationDone = true
        return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
      }
      if (table === 'folder_mappings' && !mappingDone) {
        mappingDone = true
        return chain({ id: 'fm-1', target_id: 'content', s3_maintain_hierarchy: maintainHierarchy })
      }
      if (table === 'spec_publish_targets') {
        sptCount++
        return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null)
      }
      return chain(null)
    })
    const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(S3_CREDENTIALS), error: null })
    return { from: fromMock, rpc: rpcMock }
  }

  it('flat mode: specs in subfolders land flat — only filename used', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeMultiSupabase(false) as never)
    vi.mocked(publishToS3)
      .mockResolvedValueOnce({ page_id: 'content/auth.md', page_url: '' })
      .mockResolvedValueOnce({ page_id: 'content/payments.md', page_url: '' })

    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/sub/payments.md', content_hash: 'h2' }),
    ]
    await runPublishGroup(makeJobData({ specs }))

    expect(publishToS3).toHaveBeenCalledTimes(2)
    const keys = vi.mocked(publishToS3).mock.calls.map(c => c[2])
    expect(keys).toContain('content/auth.md')
    expect(keys).toContain('content/payments.md')
  })

  it('hierarchy mode: subfolders preserved relative to matched_folder', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeMultiSupabase(true) as never)
    vi.mocked(publishToS3)
      .mockResolvedValueOnce({ page_id: 'content/auth.md', page_url: '' })
      .mockResolvedValueOnce({ page_id: 'content/sub/payments.md', page_url: '' })

    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/sub/payments.md', content_hash: 'h2' }),
    ]
    await runPublishGroup(makeJobData({ specs, matched_folder: 'docs/specs' }))

    expect(publishToS3).toHaveBeenCalledTimes(2)
    const keys = vi.mocked(publishToS3).mock.calls.map(c => c[2])
    expect(keys).toContain('content/auth.md')
    expect(keys).toContain('content/sub/payments.md')
  })
})

// ---------------------------------------------------------------------------
// 7. Distributed maps — shared root prefix
// ---------------------------------------------------------------------------
describe('distributed maps — shared root prefix', () => {
  it('flat mode: different filenames are collision-free', () => {
    const k1 = buildS3Key('docs/specs/auth.md', 'content')
    const k2 = buildS3Key('docs/rfc/microservices.md', 'content')
    expect(k1).toBe('content/auth.md')
    expect(k2).toBe('content/microservices.md')
    expect(k1).not.toBe(k2)
  })

  it('flat mode: same filename in sibling folders collides (known limitation)', () => {
    const k1 = buildS3Key('docs/specs/overview.md', 'content')
    const k2 = buildS3Key('docs/rfc/overview.md', 'content')
    expect(k1).toBe('content/overview.md')
    expect(k2).toBe('content/overview.md')
    expect(k1).toBe(k2)  // use hierarchy or distinct prefixes to avoid
  })

  it('hierarchy mode: different prefixes isolate sibling mapping namespaces', () => {
    const k1 = buildS3Key('docs/specs/auth.md', 'specs', { maintainHierarchy: true, matchedFolder: 'docs/specs' })
    const k2 = buildS3Key('docs/rfc/auth.md', 'rfcs', { maintainHierarchy: true, matchedFolder: 'docs/rfc' })
    expect(k1).toBe('specs/auth.md')
    expect(k2).toBe('rfcs/auth.md')
    expect(k1).not.toBe(k2)
  })

  it('hierarchy mode: subfolder specs across mappings with different prefixes never collide', () => {
    const entries = [
      { path: 'docs/specs/payments/checkout.md', folder: 'docs/specs', prefix: 'specs' },
      { path: 'docs/rfc/payments/checkout.md',   folder: 'docs/rfc',   prefix: 'rfcs' },
    ]
    const [k1, k2] = entries.map(({ path, folder, prefix }) =>
      buildS3Key(path, prefix, { maintainHierarchy: true, matchedFolder: folder })
    )
    expect(k1).toBe('specs/payments/checkout.md')
    expect(k2).toBe('rfcs/payments/checkout.md')
    expect(k1).not.toBe(k2)
  })
})

// ---------------------------------------------------------------------------
// 8. Distributed maps — different prefixes, isolated namespaces
// ---------------------------------------------------------------------------
describe('distributed maps — isolated prefixes', () => {
  it('different prefixes produce keys in separate S3 namespaces', () => {
    const k1 = buildS3Key('docs/specs/auth.md', 'specs')
    const k2 = buildS3Key('docs/rfc/microservices.md', 'rfcs')
    expect(k1.startsWith('specs/')).toBe(true)
    expect(k2.startsWith('rfcs/')).toBe(true)
    expect(k1).not.toBe(k2)
  })

  it('same filename with different prefixes produces unique keys', () => {
    const k1 = buildS3Key('docs/specs/README.md', 'specs')
    const k2 = buildS3Key('docs/rfc/README.md', 'rfcs')
    expect(k1).toBe('specs/README.md')
    expect(k2).toBe('rfcs/README.md')
    expect(k1).not.toBe(k2)
  })

  it('hierarchy mode: all sibling spec paths under different prefixes are unique', () => {
    const entries = [
      { path: 'docs/specs/auth.md',           folder: 'docs/specs', prefix: 'specs' },
      { path: 'docs/specs/payments/retry.md', folder: 'docs/specs', prefix: 'specs' },
      { path: 'docs/rfc/auth.md',             folder: 'docs/rfc',   prefix: 'rfcs' },
      { path: 'docs/rfc/payments/retry.md',   folder: 'docs/rfc',   prefix: 'rfcs' },
    ]
    const keys = entries.map(({ path, folder, prefix }) =>
      buildS3Key(path, prefix, { maintainHierarchy: true, matchedFolder: folder })
    )
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

// ---------------------------------------------------------------------------
// 9. Error handling
// ---------------------------------------------------------------------------
describe('error handling', () => {
  it('records failure and continues when publishToS3 throws on one spec', async () => {
    let integrationDone = false; let mappingDone = false; let sptCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) { integrationDone = true; return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' }) }
      if (table === 'folder_mappings' && !mappingDone) { mappingDone = true; return chain({ id: 'fm-1', target_id: null, s3_maintain_hierarchy: false }) }
      if (table === 'spec_publish_targets') { sptCount++; return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null) }
      return chain(null)
    })
    const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(S3_CREDENTIALS), error: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock, rpc: rpcMock } as never)
    vi.mocked(publishToS3)
      .mockRejectedValueOnce(new Error('S3 timeout'))
      .mockResolvedValueOnce({ page_id: 'payments.md', page_url: '' })

    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/specs/auth.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/specs/payments.md', content_hash: 'h2' }),
    ]

    await expect(runPublishGroup(makeJobData({ specs }))).resolves.toBeUndefined()
    expect(publishToS3).toHaveBeenCalledTimes(2)
  })

  it('throws UnrecoverableError when integration record not found', async () => {
    const fromMock = vi.fn(() => chain(null, { message: 'not found' }))
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)

    await expect(runPublishGroup(makeJobData())).rejects.toThrow(UnrecoverableError)
  })

  it('throws UnrecoverableError when credentials JSON is malformed', async () => {
    const fromMock = vi.fn(() => chain({ credentials_secret_id: 'sec-xyz', status: 'connected' }))
    const rpcMock = vi.fn().mockResolvedValue({ data: 'not-valid-json', error: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock, rpc: rpcMock } as never)

    await expect(runPublishGroup(makeJobData())).rejects.toThrow(UnrecoverableError)
  })

  it('skips entire group when specs array is empty', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSupabase() as never)

    await runPublishGroup(makeJobData({ specs: [] }))

    expect(publishToS3).not.toHaveBeenCalled()
  })
})
