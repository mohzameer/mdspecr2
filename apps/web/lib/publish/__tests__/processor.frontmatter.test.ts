/**
 * Unified `id` is authoritative (UNIFIED_ATTRIBUTES_SPEC §4)
 *
 * Resolved `spec.id` (frontmatter wins over `.mdspecmap` specs[path].id) is
 * the source of truth on every publish:
 *   - No DB binding + spec.id set → adapter receives spec.id, DB is bound.
 *   - DB binding present + spec.id matches → no-op (no re-point).
 *   - DB binding present + spec.id differs → re-point ledger to spec.id and
 *     pass the new value to the adapter.
 *   - ClickUp task_list resolves spec.id through resolveToNativeTaskId on
 *     every publish (handles custom-task-IDs).
 *   - S3 uses spec.id as the object key when present.
 *   - No spec.id → fall back to existing DB binding (or null → adapter
 *     creates a new record).
 *
 * `spec.id` is unified and opaque to mdspec. Per-integration frontmatter
 * keys (clickup_id, notion_page_id, …) are rejected at CLI build time and
 * never reach the processor.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-server', () => ({ createSupabaseServiceClient: vi.fn() }))
vi.mock('@/lib/publish/adapters/notion', () => ({
  publishToNotion: vi.fn(),
  // Default: stored page sits under the integration's root_page_id ('root-page'
  // in NOTION_CREDS for this file). Keeps existingPageId-reuse tests passing
  // through the parent-verification gate the processor runs before publishing.
  getNotionPageParentId: vi.fn().mockResolvedValue({ ok: true, parentId: 'root-page' }),
}))
vi.mock('@/lib/publish/adapters/confluence', () => ({ publishToConfluence: vi.fn() }))
vi.mock('@/lib/publish/adapters/clickup', () => ({
  publishSingleSpec: vi.fn(),
  publishSpecAsPage: vi.fn(),
  publishAsTask: vi.fn(),
  clickUpDocExists: vi.fn(),
  clickUpPageExists: vi.fn(),
  resolveToNativeTaskId: vi.fn(),
  // task_list tests use clickup_list_id 'list-9' — default the mock so the
  // processor's task list_id self-heal gate doesn't redirect to recreate.
  getClickUpDocParent: vi.fn().mockResolvedValue({ ok: true, parent: null }),
  getClickUpTaskListId: vi.fn().mockResolvedValue({ ok: true, listId: 'list-9' }),
}))
vi.mock('@/lib/publish/adapters/s3', () => ({
  publishToS3: vi.fn(),
  buildS3Key: vi.fn(),
  s3ObjectExists: vi.fn(),
}))
vi.mock('@/lib/folder-mapping', () => ({
  resolveFolderMapping: vi.fn().mockResolvedValue({ shouldRunAgent: false, templateId: null, trigger: null }),
}))
vi.mock('@/lib/agents/processor', () => ({ runAgentInline: vi.fn() }))

import { runPublishGroup } from '../processor.js'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { publishToNotion } from '@/lib/publish/adapters/notion'
import { publishToConfluence } from '@/lib/publish/adapters/confluence'
import {
  publishSingleSpec,
  publishAsTask,
  clickUpDocExists,
  resolveToNativeTaskId,
} from '@/lib/publish/adapters/clickup'
import { publishToS3, buildS3Key, s3ObjectExists } from '@/lib/publish/adapters/s3'

const PROJECT_ID = 'proj-111'
const INTEGRATION_ID = 'int-222'
const SPT_ID = 'spt-001'

const NOTION_CREDS = { token: 'secret', root_page_id: 'root-page' }
const CONFLUENCE_CREDS = { base_url: 'https://x.atlassian.net', email: 'a@b.c', token: 't', space_key: 'K' }
const CLICKUP_CREDS = { api_token: 'pk_abc', workspace_id: 'ws-1' }
const S3_CREDS = { access_key_id: 'AK', secret_access_key: 'SK', bucket: 'b', region: 'us-east-1' }

function makeSpec(overrides: Partial<{
  spec_id: string
  spec_publish_target_id: string
  path: string
  title: string
  content: string
  content_hash: string
  id: string | undefined
  id_source: 'frontmatter' | 'mapping' | undefined
}> = {}) {
  return {
    spec_id: 'spec-001',
    spec_publish_target_id: SPT_ID,
    path: 'docs/auth.md',
    title: 'Auth',
    content: '# Auth\n',
    content_hash: 'h1',
    id: undefined,
    id_source: undefined,
    ...overrides,
  }
}

interface UpdateLog { table: string; payload: Record<string, unknown>; rowId?: string }

function makeChain(data: unknown, updateLog: UpdateLog[], table: string) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'upsert', 'delete', 'maybeSingle']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  c.single = vi.fn().mockResolvedValue({ data, error: null })
  c.maybeSingle = vi.fn().mockResolvedValue({ data, error: null })
  ;(c as Record<string, unknown>).then = (
    r: (v: unknown) => unknown,
    rej?: (e: unknown) => unknown
  ) => Promise.resolve({ data, error: null }).then(r, rej)
  c.update = vi.fn((payload: Record<string, unknown>) => {
    let captured = false
    const eq = vi.fn((_col: string, val: string) => {
      if (!captured) {
        updateLog.push({ table, payload, rowId: val })
        captured = true
      }
      return Promise.resolve({ error: null })
    })
    return { eq }
  })
  return c
}

function makeSupabase(opts: {
  credentials: Record<string, unknown>
  folderMapping?: Record<string, unknown> | null
  existingPageId?: string | null
  storedHash?: string
}) {
  const { credentials, folderMapping, existingPageId = null, storedHash = 'different' } = opts
  const updateLog: UpdateLog[] = []
  let integrationDone = false
  let mappingDone = false
  let sptReadCount = 0

  const fromMock = vi.fn((table: string) => {
    if (table === 'integrations' && !integrationDone) {
      integrationDone = true
      return makeChain({ credentials_secret_id: 'sec-xyz', status: 'connected' }, updateLog, table)
    }
    if (table === 'folder_mappings' && !mappingDone && folderMapping !== undefined) {
      mappingDone = true
      return makeChain(folderMapping, updateLog, table)
    }
    if (table === 'spec_publish_targets') {
      sptReadCount++
      if (sptReadCount === 1) {
        return makeChain({ external_page_id: existingPageId, retry_count: 0, content_hash: storedHash }, updateLog, table)
      }
      return makeChain(null, updateLog, table)
    }
    return makeChain(null, updateLog, table)
  })

  const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(credentials), error: null })
  return { from: fromMock, rpc: rpcMock, updateLog }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(clickUpDocExists).mockResolvedValue(true)
  vi.mocked(s3ObjectExists).mockResolvedValue(true)
  vi.mocked(buildS3Key).mockImplementation((path) => path.split('/').pop()!)
})

// ---------------------------------------------------------------------------
// First-publish adoption — adapter receives spec.id as existingPageId
// ---------------------------------------------------------------------------
describe('Unified id adoption — first publish', () => {
  it('Notion: spec.id is adopted when no existing binding', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'fm-page', page_url: 'https://notion.so/fm-page' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ id: 'fm-page' })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ path: 'docs/auth.md' }),
      'fm-page'
    )
    const adoption = supabase.updateLog.find(
      (u) => u.table === 'spec_publish_targets' && u.payload.external_page_id === 'fm-page'
    )
    expect(adoption).toBeDefined()
  })

  it('Confluence: spec.id is adopted when no existing binding', async () => {
    const supabase = makeSupabase({ credentials: CONFLUENCE_CREDS, existingPageId: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToConfluence).mockResolvedValue({ page_id: 'fm-conf', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'confluence',
      specs: [makeSpec({ id: 'fm-conf' })],
    })

    expect(publishToConfluence).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'fm-conf',
      null
    )
  })

  it('ClickUp doc: spec.id is adopted as the doc id when no binding', async () => {
    const supabase = makeSupabase({
      credentials: CLICKUP_CREDS,
      folderMapping: undefined,
      existingPageId: null,
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishSingleSpec).mockResolvedValue({ doc_id: 'fm-doc', doc_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'clickup',
      clickup_mode: 'doc',
      matched_folder: '',
      specs: [makeSpec({ path: 'auth.md', id: 'fm-doc' })],
    })

    expect(publishSingleSpec).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'fm-doc',
      null
    )
  })
})

// ---------------------------------------------------------------------------
// ClickUp task_list — spec.id flows through resolveToNativeTaskId
// ---------------------------------------------------------------------------
describe('ClickUp task_list: spec.id resolves to native task ID', () => {
  it('passes spec.id through resolveToNativeTaskId before adopting', async () => {
    const supabase = makeSupabase({
      credentials: CLICKUP_CREDS,
      folderMapping: {
        id: 'fm-1', folder_path: 'docs', target_id: null,
        clickup_list_id: 'list-9', clickup_use_custom_task_ids: false,
        frontmatter_map: null, clickup_doc_id: null, clickup_page_id: null,
      },
      existingPageId: null,
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(resolveToNativeTaskId).mockResolvedValue('NATIVE-999')
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'NATIVE-999', task_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'clickup',
      clickup_mode: 'task_list',
      matched_folder: 'docs',
      specs: [makeSpec({ path: 'docs/auth.md', id: 'CUSTOM-1' })],
    })

    expect(resolveToNativeTaskId).toHaveBeenCalledWith(expect.anything(), 'CUSTOM-1', false)
    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'NATIVE-999',
      'list-9',
      null
    )
  })

  it('uses clickup_use_custom_task_ids from folder_mappings for resolution', async () => {
    const supabase = makeSupabase({
      credentials: CLICKUP_CREDS,
      folderMapping: {
        id: 'fm-1', folder_path: 'docs', target_id: null,
        clickup_list_id: 'list-9', clickup_use_custom_task_ids: true,
        frontmatter_map: null, clickup_doc_id: null, clickup_page_id: null,
      },
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(resolveToNativeTaskId).mockResolvedValue('NAT-1')
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'NAT-1', task_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'clickup',
      clickup_mode: 'task_list',
      matched_folder: 'docs',
      specs: [makeSpec({ path: 'docs/auth.md', id: 'CU-1' })],
    })

    expect(resolveToNativeTaskId).toHaveBeenCalledWith(expect.anything(), 'CU-1', true)
  })
})

// ---------------------------------------------------------------------------
// S3 — spec.id becomes the object key on adoption
// ---------------------------------------------------------------------------
describe('S3: spec.id is adopted as the object key', () => {
  it('publishes to spec.id, not buildS3Key result, when adopting', async () => {
    const supabase = makeSupabase({
      credentials: S3_CREDS,
      folderMapping: { id: 'fm-1', target_id: 'docs', s3_maintain_hierarchy: false, frontmatter_map: null },
      existingPageId: null,
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'custom/path.md', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 's3',
      matched_folder: 'docs',
      s3_root_prefix: 'docs',
      specs: [makeSpec({ path: 'docs/auth.md', id: 'custom/path.md' })],
    })

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'custom/path.md')
  })

  it('falls back to buildS3Key when no spec.id and no binding', async () => {
    const supabase = makeSupabase({
      credentials: S3_CREDS,
      folderMapping: { id: 'fm-1', target_id: 'docs', s3_maintain_hierarchy: false, frontmatter_map: null },
      existingPageId: null,
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(buildS3Key).mockReturnValue('docs/auth.md')
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'docs/auth.md', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 's3',
      matched_folder: 'docs',
      s3_root_prefix: 'docs',
      specs: [makeSpec({ path: 'docs/auth.md' })],
    })

    expect(buildS3Key).toHaveBeenCalled()
    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'docs/auth.md')
  })
})

// ---------------------------------------------------------------------------
// Always-authoritative — spec.id re-points the ledger when it differs
// ---------------------------------------------------------------------------
describe('Always-authoritative: spec.id re-points binding when it differs', () => {
  it('Notion: re-points DB binding to spec.id (frontmatter) and adapter receives new value', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'db-page' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'NEW-PAGE', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ id: 'NEW-PAGE', id_source: 'frontmatter' })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'NEW-PAGE')
    // The dedicated re-point write is a `{ external_page_id }`-only payload.
    const repoint = supabase.updateLog.find(
      (u) =>
        u.table === 'spec_publish_targets' &&
        Object.keys(u.payload).length === 1 &&
        u.payload.external_page_id === 'NEW-PAGE'
    )
    expect(repoint).toBeDefined()
  })

  it('Notion: spec.id from mapping (.mdspecmap specs[path].id) also re-points', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'db-page' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'MAP-PAGE', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ id: 'MAP-PAGE', id_source: 'mapping' })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'MAP-PAGE')
    const repoint = supabase.updateLog.find(
      (u) =>
        u.table === 'spec_publish_targets' &&
        Object.keys(u.payload).length === 1 &&
        u.payload.external_page_id === 'MAP-PAGE'
    )
    expect(repoint).toBeDefined()
  })

  it('Notion: spec.id matches existing binding → no re-point (no DB write)', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'same-page' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'same-page', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ id: 'same-page', id_source: 'frontmatter' })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'same-page')
    // A re-point write is the dedicated `{ external_page_id }`-only payload —
    // the post-publish status update also touches external_page_id but carries
    // status/external_url/published_at alongside it.
    const repoint = supabase.updateLog.find(
      (u) =>
        u.table === 'spec_publish_targets' &&
        Object.keys(u.payload).length === 1 &&
        u.payload.external_page_id === 'same-page'
    )
    expect(repoint).toBeUndefined()
  })

  it('ClickUp task_list: resolves spec.id and re-points to native id when it differs from binding', async () => {
    const supabase = makeSupabase({
      credentials: CLICKUP_CREDS,
      folderMapping: {
        id: 'fm-1', folder_path: 'docs', target_id: null,
        clickup_list_id: 'list-9', clickup_use_custom_task_ids: false,
        frontmatter_map: null, clickup_doc_id: null, clickup_page_id: null,
      },
      existingPageId: 'NATIVE-OLD',
      storedHash: 'h1',
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(resolveToNativeTaskId).mockResolvedValue('NATIVE-NEW')
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'NATIVE-NEW', task_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'clickup',
      clickup_mode: 'task_list',
      matched_folder: 'docs',
      specs: [makeSpec({ path: 'docs/auth.md', id: 'CUSTOM-NEW', id_source: 'frontmatter', content_hash: 'h2' })],
    })

    expect(resolveToNativeTaskId).toHaveBeenCalledWith(expect.anything(), 'CUSTOM-NEW', false)
    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'NATIVE-NEW',
      'list-9',
      null
    )
    const repoint = supabase.updateLog.find(
      (u) =>
        u.table === 'spec_publish_targets' &&
        Object.keys(u.payload).length === 1 &&
        u.payload.external_page_id === 'NATIVE-NEW'
    )
    expect(repoint).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// No spec.id — adapter creates a new record
// ---------------------------------------------------------------------------
describe('No spec.id', () => {
  it('Notion: passes existing DB binding when present', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'db-only' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'db-only', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({})],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'db-only')
  })

  it('Notion: passes null when no DB binding (adapter creates new page)', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'fresh', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({})],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), null)
  })
})
