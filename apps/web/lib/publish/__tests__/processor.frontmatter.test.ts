/**
 * Authoritative frontmatter native ID override (Option B)
 *
 * Verifies that when a spec's frontmatter contains a native ID (clickup_id,
 * notion_page_id, confluence_page_id, s3_key), that value is used to bind
 * publish on EVERY publish — overriding whatever DB.external_page_id holds.
 * Editing/changing frontmatter re-points the binding; removing it falls
 * back to DB.
 *
 * Also covers:
 *   - Default key per integration
 *   - Per-mapping `frontmatter_map.id` override of the default key
 *   - DB persistence of new ID after override
 *   - ClickUp task_list goes through resolveToNativeTaskId (custom IDs)
 *   - S3 object key follows the override
 *   - Frontmatter ID takes priority over .mdspecmap specs[].id (id_ref)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db-server', () => ({ createSupabaseServiceClient: vi.fn() }))
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

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

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
  frontmatter: Record<string, unknown>
  id_ref: string | undefined
}> = {}) {
  return {
    spec_id: 'spec-001',
    spec_publish_target_id: SPT_ID,
    path: 'docs/auth.md',
    title: 'Auth',
    content: '# Auth\n',
    content_hash: 'h1',
    frontmatter: {},
    id_ref: undefined,
    ...overrides,
  }
}

// Tracks update calls so tests can assert DB persistence of overrides
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
  folderMapping?: Record<string, unknown> | null  // null = no row; undefined = skip table
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
      return makeChain({ credentials: JSON.stringify(credentials), status: 'connected' }, updateLog, table)
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

  return { from: fromMock, updateLog }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(clickUpDocExists).mockResolvedValue(true)
  vi.mocked(s3ObjectExists).mockResolvedValue(true)
  vi.mocked(buildS3Key).mockImplementation((path) => path.split('/').pop()!)
})

// ---------------------------------------------------------------------------
// Notion — default key `notion_page_id`
// ---------------------------------------------------------------------------
describe('Notion: frontmatter notion_page_id is authoritative', () => {
  it('uses frontmatter notion_page_id over DB external_page_id', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'old-db-page' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'fm-page', page_url: 'https://notion.so/fm-page' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: { notion_page_id: 'fm-page' } })],
    })

    // Adapter receives frontmatter ID, NOT the DB ID
    expect(publishToNotion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ path: 'docs/auth.md' }),
      'fm-page'
    )
    // DB updated to new ID before adapter dispatch
    const overrideUpdate = supabase.updateLog.find(
      (u) => u.table === 'spec_publish_targets' && u.payload.external_page_id === 'fm-page'
    )
    expect(overrideUpdate).toBeDefined()
  })

  it('falls back to DB external_page_id when frontmatter has no notion_page_id', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'db-only' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'db-only', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: {} })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'db-only')
  })

  it('frontmatter_map.id renames the default key (notion_page_id → custom)', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'custom-id', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: { my_notion_id: 'custom-id', notion_page_id: 'WRONG' } })],
      frontmatter_map: { id: 'my_notion_id' },
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'custom-id')
  })

  it('non-string frontmatter value is ignored (number falls through to DB)', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'db-fallback' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'db-fallback', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: { notion_page_id: 12345 } })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'db-fallback')
  })

  it('changing frontmatter ID re-points the binding (DB updated on every publish)', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'old' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'new', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: { notion_page_id: 'new' } })],
    })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'new')
  })
})

// ---------------------------------------------------------------------------
// Confluence — default key `confluence_page_id`
// ---------------------------------------------------------------------------
describe('Confluence: frontmatter confluence_page_id is authoritative', () => {
  it('uses frontmatter confluence_page_id over DB', async () => {
    const supabase = makeSupabase({ credentials: CONFLUENCE_CREDS, existingPageId: 'old-conf' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToConfluence).mockResolvedValue({ page_id: 'fm-conf', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'confluence',
      specs: [makeSpec({ frontmatter: { confluence_page_id: 'fm-conf' } })],
    })

    expect(publishToConfluence).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'fm-conf'
    )
  })
})

// ---------------------------------------------------------------------------
// ClickUp doc mode — default key `clickup_id`
// ---------------------------------------------------------------------------
describe('ClickUp doc: frontmatter clickup_id is authoritative', () => {
  it('uses frontmatter clickup_id for an existing doc', async () => {
    // Root-folder mapping (no folder_mappings row queried for root specs)
    const supabase = makeSupabase({
      credentials: CLICKUP_CREDS,
      folderMapping: undefined,            // root path → no setupClickup mapping query
      existingPageId: 'old-doc',
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishSingleSpec).mockResolvedValue({ doc_id: 'fm-doc', doc_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'clickup',
      clickup_mode: 'doc',
      matched_folder: '',                  // root → setupClickupGroupContext returns early
      specs: [makeSpec({
        path: 'auth.md',
        frontmatter: { clickup_id: 'fm-doc' },
      })],
    })

    expect(publishSingleSpec).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'fm-doc',                            // existingPageId override
      null                                 // folderMappingTargetId (none for root)
    )
  })
})

// ---------------------------------------------------------------------------
// ClickUp task_list — frontmatter clickup_id is resolved via resolveToNativeTaskId
// ---------------------------------------------------------------------------
describe('ClickUp task_list: frontmatter clickup_id resolves to native task ID', () => {
  it('passes frontmatter ID through resolveToNativeTaskId before adopting', async () => {
    const supabase = makeSupabase({
      credentials: CLICKUP_CREDS,
      folderMapping: {
        id: 'fm-1',
        folder_path: 'docs',
        target_id: null,
        clickup_list_id: 'list-9',
        clickup_use_custom_task_ids: false,
        frontmatter_map: null,
        clickup_doc_id: null,
        clickup_page_id: null,
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
      specs: [makeSpec({
        path: 'docs/auth.md',
        frontmatter: { clickup_id: 'CUSTOM-1' },     // user pasted a custom-task-ID
      })],
    })

    expect(resolveToNativeTaskId).toHaveBeenCalledWith(expect.anything(), 'CUSTOM-1', false)
    // After resolution, publishAsTask receives the native ID — NOT the custom one
    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      'NATIVE-999',
      'list-9',
      null
    )
  })

  it('frontmatter clickup_id wins over .mdspecmap specs[].id (id_ref)', async () => {
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
    vi.mocked(resolveToNativeTaskId).mockResolvedValue('FROM-FM')
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'FROM-FM', task_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'clickup',
      clickup_mode: 'task_list',
      matched_folder: 'docs',
      specs: [makeSpec({
        path: 'docs/auth.md',
        id_ref: 'FROM-MAP',                          // .mdspecmap specs[].id (lower priority)
        frontmatter: { clickup_id: 'FROM-FM' },      // frontmatter (higher priority)
      })],
    })

    // resolveToNativeTaskId called with frontmatter value, never the id_ref
    expect(resolveToNativeTaskId).toHaveBeenCalledWith(expect.anything(), 'FROM-FM', false)
    expect(resolveToNativeTaskId).not.toHaveBeenCalledWith(expect.anything(), 'FROM-MAP', expect.anything())
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
      specs: [makeSpec({ path: 'docs/auth.md', frontmatter: { clickup_id: 'CU-1' } })],
    })

    expect(resolveToNativeTaskId).toHaveBeenCalledWith(expect.anything(), 'CU-1', true)
  })
})

// ---------------------------------------------------------------------------
// S3 — default key `s3_key` overrides computed object key
// ---------------------------------------------------------------------------
describe('S3: frontmatter s3_key overrides computed object key', () => {
  it('publishes to frontmatter s3_key, not buildS3Key result', async () => {
    const supabase = makeSupabase({
      credentials: S3_CREDS,
      folderMapping: { id: 'fm-1', target_id: 'docs', s3_maintain_hierarchy: false, frontmatter_map: null },
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToS3).mockResolvedValue({ page_id: 'custom/path.md', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 's3',
      matched_folder: 'docs',
      s3_root_prefix: 'docs',
      specs: [makeSpec({
        path: 'docs/auth.md',
        frontmatter: { s3_key: 'custom/path.md' },
      })],
    })

    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'custom/path.md')
  })

  it('falls back to buildS3Key when frontmatter has no s3_key', async () => {
    const supabase = makeSupabase({
      credentials: S3_CREDS,
      folderMapping: { id: 'fm-1', target_id: 'docs', s3_maintain_hierarchy: false, frontmatter_map: null },
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
      specs: [makeSpec({ path: 'docs/auth.md', frontmatter: {} })],
    })

    expect(buildS3Key).toHaveBeenCalled()
    expect(publishToS3).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'docs/auth.md')
  })
})

// ---------------------------------------------------------------------------
// Persistence: DB external_page_id reflects the frontmatter override
// ---------------------------------------------------------------------------
describe('DB persistence', () => {
  it('writes the new ID to spec_publish_targets when frontmatter differs from DB', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'old' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'new', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: { notion_page_id: 'new' } })],
    })

    const overrideWrites = supabase.updateLog.filter(
      (u) => u.table === 'spec_publish_targets'
        && u.payload.external_page_id === 'new'
        && u.rowId === SPT_ID
    )
    expect(overrideWrites.length).toBeGreaterThanOrEqual(1)
  })

  it('does not write a redundant update when frontmatter ID matches DB', async () => {
    const supabase = makeSupabase({ credentials: NOTION_CREDS, existingPageId: 'same' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'same', page_url: '' })

    await runPublishGroup({
      project_id: PROJECT_ID,
      integration_id: INTEGRATION_ID,
      target_type: 'notion',
      specs: [makeSpec({ frontmatter: { notion_page_id: 'same' }, content_hash: 'h1' })],
    })

    // No "override" update (only the normal post-publish status='published' update)
    const overrideWrites = supabase.updateLog.filter(
      (u) => u.table === 'spec_publish_targets'
        && u.payload.external_page_id === 'same'
        && Object.keys(u.payload).length === 1   // override is JUST {external_page_id}
    )
    expect(overrideWrites.length).toBe(0)
  })
})
