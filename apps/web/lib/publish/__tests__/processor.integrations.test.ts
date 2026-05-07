/**
 * Processor integration tests — Notion, Confluence, ClickUp (doc + task_list)
 *
 * Verifies that existing integration dispatch paths were not broken by the
 * S3 additions (new GroupContext fields, new else-if branch, new switch case).
 *
 * Covers:
 *   - Notion: basic publish, credentials forwarded, result stored
 *   - Confluence: basic publish, credentials forwarded, result stored
 *   - ClickUp doc mode (flat/single): dispatches to publishSingleSpec
 *   - ClickUp doc mode (multi): dispatches to publishSpecAsPage, stores doc_id
 *   - ClickUp task_list mode: dispatches to publishAsTask
 *   - Content-unchanged skip applies for all integrations
 *   - Per-spec error recorded and group continues for all integrations
 *   - Empty group exits immediately for all integrations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/lib/db-server', () => ({
  createSupabaseServiceClient: vi.fn(),
}))
vi.mock('@/lib/publish/adapters/notion', () => ({
  publishToNotion: vi.fn(),
  // Default: stored page sits under the integration's root_page_id (the
  // common case for most existing tests). Tests that specifically assert
  // stale-parent behavior should override this per-case.
  getNotionPageParentId: vi.fn().mockResolvedValue({ ok: true, parentId: 'page-root-123' }),
}))
vi.mock('@/lib/publish/adapters/confluence', () => ({
  publishToConfluence: vi.fn(),
}))
vi.mock('@/lib/publish/adapters/clickup', () => ({
  publishSingleSpec: vi.fn(),
  publishSpecAsPage: vi.fn(),
  publishAsTask: vi.fn(),
  clickUpDocExists: vi.fn(),
  clickUpPageExists: vi.fn(),
  resolveToNativeTaskId: vi.fn(),
  // Default: stored docs/tasks live under the folder mapping's target.
  // Tests asserting stale-parent / list-mismatch behavior override per-case.
  getClickUpDocParent: vi.fn().mockResolvedValue({ ok: true, parent: 'space:ws-111' }),
  getClickUpTaskListId: vi.fn().mockResolvedValue({ ok: true, listId: 'list-999' }),
}))
vi.mock('@/lib/publish/adapters/s3', () => ({
  publishToS3: vi.fn(),
  buildS3Key: vi.fn(),
}))
vi.mock('@/lib/folder-mapping', () => ({
  resolveFolderMapping: vi.fn().mockResolvedValue({ shouldRunAgent: false, templateId: null, trigger: null }),
}))
vi.mock('@/lib/agents/processor', () => ({
  runAgentInline: vi.fn(),
}))

import { runPublishGroup, UnrecoverableError } from '../processor.js'
import { createSupabaseServiceClient } from '@/lib/db-server'
import { publishToNotion } from '@/lib/publish/adapters/notion'
import { publishToConfluence } from '@/lib/publish/adapters/confluence'
import {
  publishSingleSpec,
  publishSpecAsPage,
  publishAsTask,
  clickUpDocExists,
  clickUpPageExists,
  getClickUpDocParent,
  getClickUpTaskListId,
} from '@/lib/publish/adapters/clickup'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-111'
const INTEGRATION_ID = 'int-222'

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

function chain(data: unknown, error: unknown = null) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'neq', 'not', 'order', 'insert', 'update', 'upsert', 'delete', 'maybeSingle']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  c.single = vi.fn().mockResolvedValue({ data, error })
  c.maybeSingle = vi.fn().mockResolvedValue({ data, error })
  ;(c as Record<string, unknown>).then = (
    r: (v: unknown) => unknown,
    rej?: (e: unknown) => unknown
  ) => Promise.resolve({ data, error }).then(r, rej)
  const ur = { eq: vi.fn().mockResolvedValue({ error: null }) }
  ;(c.update as ReturnType<typeof vi.fn>).mockReturnValue(ur)
  return c
}

/**
 * Minimal supabase mock for a non-ClickUp integration (Notion, Confluence, S3).
 */
function makeSimpleSupabase(credentials: Record<string, unknown>, existingPageId: string | null = null, storedHash = 'different') {
  let integrationDone = false
  let sptCount = 0

  const fromMock = vi.fn((table: string) => {
    if (table === 'integrations' && !integrationDone) {
      integrationDone = true
      return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
    }
    if (table === 'spec_publish_targets') {
      sptCount++
      if (sptCount % 2 === 1) return chain({ external_page_id: existingPageId, retry_count: 0, content_hash: storedHash })
      return chain(null)
    }
    return chain(null)
  })

  const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(credentials), error: null })
  return { from: fromMock, rpc: rpcMock }
}

/**
 * Supabase mock for ClickUp — includes folder_mappings query in setupClickupGroupContext.
 */
function makeClickUpSupabase(
  credentials: Record<string, unknown>,
  folderMapping: Record<string, unknown> | null,
  existingPageId: string | null = null,
  storedHash = 'different'
) {
  let integrationDone = false
  let mappingDone = false
  let sptCount = 0

  const fromMock = vi.fn((table: string) => {
    if (table === 'integrations' && !integrationDone) {
      integrationDone = true
      return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
    }
    if (table === 'folder_mappings' && !mappingDone) {
      mappingDone = true
      return chain(folderMapping)
    }
    if (table === 'spec_publish_targets') {
      sptCount++
      if (sptCount % 2 === 1) return chain({ external_page_id: existingPageId, retry_count: 0, content_hash: storedHash })
      return chain(null)
    }
    if (table === 'folder_mappings') return chain(null)
    return chain(null)
  })

  const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(credentials), error: null })
  return { from: fromMock, rpc: rpcMock }
}

const NOTION_CREDS = { token: 'secret_abc', root_page_id: 'page-root-123' }
const CONFLUENCE_CREDS = { base_url: 'https://acme.atlassian.net', email: 'dev@acme.com', token: 'conf-tok', space_key: 'ENG' }
const CLICKUP_CREDS = { api_token: 'pk_abc123', workspace_id: 'ws-111' }

beforeEach(() => {
  vi.mocked(publishToNotion).mockReset()
  vi.mocked(publishToConfluence).mockReset()
  vi.mocked(publishSingleSpec).mockReset()
  vi.mocked(publishSpecAsPage).mockReset()
  vi.mocked(publishAsTask).mockReset()
  vi.mocked(clickUpDocExists).mockReset()
  vi.mocked(clickUpPageExists).mockReset()
})

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------
describe('Notion dispatch', () => {
  it('calls publishToNotion with correct credentials and spec', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSimpleSupabase(NOTION_CREDS) as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'page-abc', page_url: 'https://notion.so/page-abc' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToNotion).toHaveBeenCalledWith(
      { token: NOTION_CREDS.token, root_page_id: NOTION_CREDS.root_page_id },
      expect.objectContaining({ path: 'docs/specs/auth.md' }),
      null
    )
  })

  it('stores page_id and page_url in spec_publish_targets on success', async () => {
    const supabase = makeSimpleSupabase(NOTION_CREDS)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(supabase as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'page-abc', page_url: 'https://notion.so/page-abc' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs: [makeSpec()], matched_folder: 'docs/specs' })

    const updateCall = vi.mocked(supabase.from).mock.calls.find(c => c[0] === 'spec_publish_targets')
    expect(updateCall).toBeDefined()
    expect(publishToNotion).toHaveBeenCalledOnce()
  })

  it('passes existingPageId to publishToNotion on subsequent publish', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSimpleSupabase(NOTION_CREDS, 'existing-page-id') as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'existing-page-id', page_url: 'https://notion.so/existing' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToNotion).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'existing-page-id')
  })

  it('records error and continues when publishToNotion throws', async () => {
    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/a.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/b.md', content_hash: 'h2' }),
    ]
    let integrationDone = false; let sptCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) { integrationDone = true; return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' }) }
      if (table === 'spec_publish_targets') { sptCount++; return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null) }
      return chain(null)
    })
    const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(NOTION_CREDS), error: null })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock, rpc: rpcMock } as never)
    vi.mocked(publishToNotion)
      .mockRejectedValueOnce(new Error('Notion API error')) // s1 first attempt
      .mockResolvedValueOnce({ page_id: 'p1', page_url: '' }) // s1 retry
      .mockResolvedValueOnce({ page_id: 'p2', page_url: '' }) // s2

    await expect(runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs, matched_folder: 'docs' })).resolves.toBeUndefined()
    expect(publishToNotion).toHaveBeenCalledTimes(3)
  })

  it('forwards database-mode credentials (mode, database_id, data_source_id) to adapter', async () => {
    const dbCreds = {
      ...NOTION_CREDS,
      mode: 'database',
      database_id: 'db-id',
      data_source_id: 'data-source-id',
    }
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSimpleSupabase(dbCreds) as never)
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'row-id', page_url: 'https://notion.so/row-id' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToNotion).toHaveBeenCalledWith(
      expect.objectContaining({
        token: dbCreds.token,
        root_page_id: dbCreds.root_page_id,
        mode: 'database',
        database_id: 'db-id',
        data_source_id: 'data-source-id',
      }),
      expect.anything(),
      null
    )
  })
})

// ---------------------------------------------------------------------------
// Notion — folder_mappings.target_id override (per-folder destination)
//
// The user picks a parent page or wiki sub-page from the project map; that
// selection is saved to folder_mappings.target_id and MUST override the
// integration-level credentials.root_page_id when publishing specs in that
// folder. Without this, the per-folder picker has no effect.
// ---------------------------------------------------------------------------

/**
 * Supabase mock for Notion that returns a folder_mappings row.
 * Mirrors makeClickUpSupabase but for Notion (no clickup_mode filter).
 */
function makeNotionSupabaseWithMapping(
  credentials: Record<string, unknown>,
  folderMapping: Record<string, unknown> | null,
  existingPageId: string | null = null,
  storedHash = 'different'
) {
  let integrationDone = false
  let mappingDone = false
  let sptCount = 0

  const fromMock = vi.fn((table: string) => {
    if (table === 'integrations' && !integrationDone) {
      integrationDone = true
      return chain({ credentials_secret_id: 'sec-xyz', status: 'connected' })
    }
    if (table === 'folder_mappings' && !mappingDone) {
      mappingDone = true
      return chain(folderMapping)
    }
    if (table === 'spec_publish_targets') {
      sptCount++
      if (sptCount % 2 === 1) return chain({ external_page_id: existingPageId, retry_count: 0, content_hash: storedHash })
      return chain(null)
    }
    if (table === 'folder_mappings') return chain(null)
    return chain(null)
  })

  const rpcMock = vi.fn().mockResolvedValue({ data: JSON.stringify(credentials), error: null })
  return { from: fromMock, rpc: rpcMock }
}

describe('Notion folder_mappings.target_id override', () => {
  it('passes folder_mappings.target_id as root_page_id when set (overrides integration default)', async () => {
    const FOLDER_TARGET = 'page-folder-override-456'
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeNotionSupabaseWithMapping(NOTION_CREDS, {
        id: 'fm-no', folder_path: 'docs/specs', target_id: FOLDER_TARGET,
        frontmatter_map: null,
      }) as never
    )
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'p1', page_url: 'https://notion.so/p1' })

    await runPublishGroup({
      project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion',
      specs: [makeSpec()], matched_folder: 'docs/specs',
    })

    expect(publishToNotion).toHaveBeenCalledWith(
      expect.objectContaining({ root_page_id: FOLDER_TARGET }),
      expect.anything(),
      null
    )
    expect(publishToNotion).not.toHaveBeenCalledWith(
      expect.objectContaining({ root_page_id: NOTION_CREDS.root_page_id }),
      expect.anything(),
      expect.anything()
    )
  })

  it('falls back to credentials.root_page_id when folder_mappings.target_id is null', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeNotionSupabaseWithMapping(NOTION_CREDS, {
        id: 'fm-no', folder_path: 'docs/specs', target_id: null,
        frontmatter_map: null,
      }) as never
    )
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'p1', page_url: 'https://notion.so/p1' })

    await runPublishGroup({
      project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion',
      specs: [makeSpec()], matched_folder: 'docs/specs',
    })

    expect(publishToNotion).toHaveBeenCalledWith(
      expect.objectContaining({ root_page_id: NOTION_CREDS.root_page_id }),
      expect.anything(),
      null
    )
  })

  it('falls back to credentials.root_page_id when no folder_mappings row exists', async () => {
    // No mapping registered for this folder — should not crash, should use integration default.
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeNotionSupabaseWithMapping(NOTION_CREDS, null) as never
    )
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'p1', page_url: 'https://notion.so/p1' })

    await runPublishGroup({
      project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion',
      specs: [makeSpec()], matched_folder: 'docs/specs',
    })

    expect(publishToNotion).toHaveBeenCalledWith(
      expect.objectContaining({ root_page_id: NOTION_CREDS.root_page_id }),
      expect.anything(),
      null
    )
  })

  it('database-mode credentials still override root_page_id from folder mapping', async () => {
    const dbCreds = { ...NOTION_CREDS, mode: 'database', database_id: 'db-id', data_source_id: 'ds-id' }
    const FOLDER_TARGET = 'wiki-row-override-789'
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeNotionSupabaseWithMapping(dbCreds, {
        id: 'fm-no', folder_path: 'docs/specs', target_id: FOLDER_TARGET,
        frontmatter_map: null,
      }) as never
    )
    vi.mocked(publishToNotion).mockResolvedValue({ page_id: 'p1', page_url: 'https://notion.so/p1' })

    await runPublishGroup({
      project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion',
      specs: [makeSpec()], matched_folder: 'docs/specs',
    })

    expect(publishToNotion).toHaveBeenCalledWith(
      expect.objectContaining({
        root_page_id: FOLDER_TARGET,
        mode: 'database',
        database_id: 'db-id',
        data_source_id: 'ds-id',
      }),
      expect.anything(),
      null
    )
  })
})

// ---------------------------------------------------------------------------
// Confluence
// ---------------------------------------------------------------------------
describe('Confluence dispatch', () => {
  it('calls publishToConfluence with correct credentials', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSimpleSupabase(CONFLUENCE_CREDS) as never)
    vi.mocked(publishToConfluence).mockResolvedValue({ page_id: 'cf-page', page_url: 'https://acme.atlassian.net/wiki/cf-page' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'confluence', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToConfluence).toHaveBeenCalledWith(
      {
        base_url: CONFLUENCE_CREDS.base_url,
        email: CONFLUENCE_CREDS.email,
        token: CONFLUENCE_CREDS.token,
        space_key: CONFLUENCE_CREDS.space_key,
      },
      expect.objectContaining({ path: 'docs/specs/auth.md' }),
      null
    )
  })

  it('passes existingPageId on subsequent publish', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(makeSimpleSupabase(CONFLUENCE_CREDS, 'cf-existing') as never)
    vi.mocked(publishToConfluence).mockResolvedValue({ page_id: 'cf-existing', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'confluence', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToConfluence).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'cf-existing')
  })

})

// ---------------------------------------------------------------------------
// ClickUp — doc mode (flat / single)
// ---------------------------------------------------------------------------
describe('ClickUp doc mode — flat (no parent_doc)', () => {
  const folderMapping = {
    id: 'fm-cu', target_id: 'space:ws-111', clickup_list_id: null,
    clickup_use_custom_task_ids: false, frontmatter_map: null,
    clickup_doc_id: null, clickup_page_id: null,
  }

  it('dispatches to publishSingleSpec when no parent doc is set', async () => {
    vi.mocked(clickUpDocExists).mockResolvedValue(false)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMapping) as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'doc-abc', page_url: 'https://app.clickup.com/doc/doc-abc' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(publishSingleSpec).toHaveBeenCalledWith(
      { api_token: CLICKUP_CREDS.api_token, workspace_id: CLICKUP_CREDS.workspace_id },
      expect.objectContaining({ path: 'docs/specs/auth.md' }),
      null,
      folderMapping.target_id
    )
    expect(publishSpecAsPage).not.toHaveBeenCalled()
  })

  it('checks if stored doc still exists before using it', async () => {
    vi.mocked(clickUpDocExists).mockResolvedValue(true)
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMapping, 'existing-doc-id') as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'existing-doc-id', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(clickUpDocExists).toHaveBeenCalledWith(
      { api_token: CLICKUP_CREDS.api_token, workspace_id: CLICKUP_CREDS.workspace_id },
      'existing-doc-id'
    )
  })

  it('recreates doc when stored doc_id returns 404 from ClickUp', async () => {
    vi.mocked(clickUpDocExists).mockResolvedValue(false)   // doc was deleted
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMapping, 'stale-doc-id') as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'new-doc-id', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    // Called with null because stale ID was cleared
    expect(publishSingleSpec).toHaveBeenCalledWith(expect.anything(), expect.anything(), null, expect.anything())
  })

  it('recreates doc when its parent no longer matches the folder mapping target', async () => {
    // Self-heal: stored doc exists but under the OLD parent. ClickUp can't
    // move docs between spaces/folders, so abandon the stored id and let
    // publishSingleSpec create a fresh doc under the (current) target_id.
    vi.mocked(clickUpDocExists).mockResolvedValue(true)
    vi.mocked(getClickUpDocParent).mockResolvedValue({ ok: true, parent: 'space:OLD-PARENT' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMapping, 'doc-at-old-parent') as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'doc-fresh', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(publishSingleSpec).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null,                  // existing id cleared
      'space:ws-111',        // current target_id
    )
  })

  it('keeps stored doc when its parent matches the folder mapping target', async () => {
    vi.mocked(clickUpDocExists).mockResolvedValue(true)
    vi.mocked(getClickUpDocParent).mockResolvedValue({ ok: true, parent: 'space:ws-111' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMapping, 'doc-at-correct-parent', 'different') as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'doc-at-correct-parent', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    // Stored id forwarded — no recreation
    expect(publishSingleSpec).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'doc-at-correct-parent', 'space:ws-111'
    )
  })
})

// ---------------------------------------------------------------------------
// ClickUp — doc mode (multi — parent_doc set)
// ---------------------------------------------------------------------------
describe('ClickUp doc mode — multi (parent_doc set)', () => {
  const folderMappingWithDoc = {
    id: 'fm-cu', target_id: 'space:ws-111', clickup_list_id: null,
    clickup_use_custom_task_ids: false, frontmatter_map: null,
    clickup_doc_id: 'shared-doc-id', clickup_page_id: null,
  }

  it('dispatches to publishSpecAsPage when parent doc exists', async () => {
    // setupClickupGroupContext now verifies parent (not just existence) of the
    // shared doc. Default mock returns the matching parent, so multi-mode stays.
    vi.mocked(getClickUpDocParent).mockResolvedValue({ ok: true, parent: 'space:ws-111' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingWithDoc) as never
    )
    vi.mocked(publishSpecAsPage).mockResolvedValue({ page_id: 'page-xyz', doc_id: 'shared-doc-id', doc_url: 'https://app.clickup.com/doc/page-xyz' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(publishSpecAsPage).toHaveBeenCalled()
    expect(publishSingleSpec).not.toHaveBeenCalled()
  })

  it('falls back to flat mode when shared doc no longer exists in ClickUp', async () => {
    vi.mocked(getClickUpDocParent).mockResolvedValue({ ok: false, missing: true })   // shared doc deleted
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingWithDoc) as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'new-doc', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(publishSingleSpec).toHaveBeenCalled()
    expect(publishSpecAsPage).not.toHaveBeenCalled()
  })

  it('abandons shared doc when its parent no longer matches the folder mapping target', async () => {
    // User re-pointed the folder mapping (target_id) to a new space/folder.
    // The doc still exists, but lives under the OLD parent. Self-heal: drop
    // sharedSubDocId — multi-mode stays (so semantics don't change), and
    // publishSpecAsPage creates a fresh doc under the current target_id.
    // ClickUp can't move a doc between spaces/folders.
    vi.mocked(getClickUpDocParent).mockResolvedValue({ ok: true, parent: 'space:OLD-PARENT' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingWithDoc) as never
    )
    vi.mocked(publishSpecAsPage).mockResolvedValue({ page_id: 'page-new', doc_id: 'doc-new', doc_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    // publishSpecAsPage receives folderDocId=null so it creates fresh under
    // the current folder mapping target_id (space:ws-111).
    expect(publishSpecAsPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      null,             // folderDocId — cleared by self-heal
      null,             // existingPageId
      expect.anything(),
      'space:ws-111',   // current target_id
      undefined,
    )
  })
})

// ---------------------------------------------------------------------------
// ClickUp — task_list mode
// ---------------------------------------------------------------------------
describe('ClickUp task_list mode', () => {
  const folderMappingTaskList = {
    id: 'fm-cu', target_id: null, clickup_list_id: 'list-999',
    clickup_use_custom_task_ids: false, frontmatter_map: null,
    clickup_doc_id: null, clickup_page_id: null,
  }

  it('dispatches to publishAsTask with list ID', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingTaskList) as never
    )
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'task-abc', task_url: 'https://app.clickup.com/t/task-abc' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'task_list' })

    expect(publishAsTask).toHaveBeenCalledWith(
      { api_token: CLICKUP_CREDS.api_token, workspace_id: CLICKUP_CREDS.workspace_id },
      expect.objectContaining({ path: 'docs/specs/auth.md' }),
      null,        // no existing task id
      'list-999',  // list id
      null         // no frontmatter map
    )
    expect(publishSingleSpec).not.toHaveBeenCalled()
    expect(publishSpecAsPage).not.toHaveBeenCalled()
  })

  it('records error and does not call publishAsTask when list_id is missing', async () => {
    const noListMapping = { ...folderMappingTaskList, clickup_list_id: null }
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, noListMapping) as never
    )

    // Per-spec errors are caught and recorded — group resolves, not rejects
    await expect(
      runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'task_list' })
    ).resolves.toBeUndefined()
    expect(publishAsTask).not.toHaveBeenCalled()
  })

  it('passes existing task_id on update', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingTaskList, 'task-existing') as never
    )
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'task-existing', task_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'task_list' })

    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'task-existing', 'list-999', null
    )
  })

  it('recreates task when stored task lives in a different list than the folder mapping', async () => {
    // Self-heal: stored task is in OLD-LIST, folder mapping now points to
    // 'list-999'. ClickUp can't move a task between lists via PUT, so the
    // processor must abandon the stored id and let publishAsTask create a
    // fresh task in the current list.
    vi.mocked(getClickUpTaskListId).mockResolvedValue({ ok: true, listId: 'OLD-LIST' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingTaskList, 'task-old-list') as never
    )
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'task-fresh', task_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'task_list' })

    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), null, 'list-999', null
    )
  })

  it('recreates task when stored task no longer exists (404)', async () => {
    vi.mocked(getClickUpTaskListId).mockResolvedValue({ ok: false, missing: true })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingTaskList, 'task-deleted') as never
    )
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'task-fresh', task_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'task_list' })

    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), null, 'list-999', null
    )
  })

  it('keeps stored task_id when it lives in the matching list', async () => {
    vi.mocked(getClickUpTaskListId).mockResolvedValue({ ok: true, listId: 'list-999' })
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingTaskList, 'task-in-correct-list') as never
    )
    vi.mocked(publishAsTask).mockResolvedValue({ task_id: 'task-in-correct-list', task_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'task_list' })

    expect(publishAsTask).toHaveBeenCalledWith(
      expect.anything(), expect.anything(), 'task-in-correct-list', 'list-999', null
    )
  })
})

// ---------------------------------------------------------------------------
// Cross-integration: UnrecoverableError on missing integration
// ---------------------------------------------------------------------------
describe('UnrecoverableError — all integration types', () => {
  for (const target_type of ['notion', 'confluence', 'clickup', 's3'] as const) {
    it(`throws UnrecoverableError when integration not found — ${target_type}`, async () => {
      const fromMock = vi.fn(() => chain(null, { message: 'not found' }))
      vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)

      await expect(
        runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type, specs: [makeSpec()], matched_folder: 'docs/specs' })
      ).rejects.toThrow(UnrecoverableError)
    })
  }
})
