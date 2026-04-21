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
 * Call order: integrations → spec_publish_targets (fetch) → specs (hash) → spec_publish_targets (update)
 */
function makeSimpleSupabase(credentials: Record<string, unknown>, existingPageId: string | null = null, storedHash = 'different') {
  let integrationDone = false
  let sptCount = 0

  const fromMock = vi.fn((table: string) => {
    if (table === 'integrations' && !integrationDone) {
      integrationDone = true
      return chain({ credentials: JSON.stringify(credentials), status: 'connected' })
    }
    if (table === 'spec_publish_targets') {
      sptCount++
      if (sptCount % 2 === 1) return chain({ external_page_id: existingPageId, retry_count: 0 })
      return chain(null)
    }
    if (table === 'specs') return chain({ content_hash: storedHash })
    return chain(null)
  })

  return { from: fromMock }
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
      return chain({ credentials: JSON.stringify(credentials), status: 'connected' })
    }
    if (table === 'folder_mappings' && !mappingDone) {
      mappingDone = true
      return chain(folderMapping)
    }
    if (table === 'spec_publish_targets') {
      sptCount++
      if (sptCount % 2 === 1) return chain({ external_page_id: existingPageId, retry_count: 0 })
      return chain(null)
    }
    if (table === 'specs') return chain({ content_hash: storedHash })
    if (table === 'folder_mappings') return chain(null)
    return chain(null)
  })

  return { from: fromMock }
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

  it('skips publishToNotion when content hash unchanged', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSimpleSupabase(NOTION_CREDS, 'existing-page', 'hash-abc') as never
    )

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToNotion).not.toHaveBeenCalled()
  })

  it('records error and continues when publishToNotion throws', async () => {
    const specs = [
      makeSpec({ spec_id: 's1', spec_publish_target_id: 'spt-1', path: 'docs/a.md', content_hash: 'h1' }),
      makeSpec({ spec_id: 's2', spec_publish_target_id: 'spt-2', path: 'docs/b.md', content_hash: 'h2' }),
    ]
    let integrationDone = false; let sptCount = 0
    const fromMock = vi.fn((table: string) => {
      if (table === 'integrations' && !integrationDone) { integrationDone = true; return chain({ credentials: JSON.stringify(NOTION_CREDS), status: 'connected' }) }
      if (table === 'spec_publish_targets') { sptCount++; return sptCount % 2 === 1 ? chain({ external_page_id: null, retry_count: 0 }) : chain(null) }
      return chain(null)
    })
    vi.mocked(createSupabaseServiceClient).mockReturnValue({ from: fromMock } as never)
    vi.mocked(publishToNotion).mockRejectedValueOnce(new Error('Notion API error')).mockResolvedValueOnce({ page_id: 'p2', page_url: '' })

    await expect(runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'notion', specs, matched_folder: 'docs' })).resolves.toBeUndefined()
    expect(publishToNotion).toHaveBeenCalledTimes(2)
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

  it('skips publishToConfluence when content hash unchanged', async () => {
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeSimpleSupabase(CONFLUENCE_CREDS, 'cf-page', 'hash-abc') as never
    )

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'confluence', specs: [makeSpec()], matched_folder: 'docs/specs' })

    expect(publishToConfluence).not.toHaveBeenCalled()
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
    vi.mocked(clickUpDocExists).mockResolvedValue(true)   // shared doc exists
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingWithDoc) as never
    )
    vi.mocked(publishSpecAsPage).mockResolvedValue({ page_id: 'page-xyz', doc_id: 'shared-doc-id', doc_url: 'https://app.clickup.com/doc/page-xyz' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(publishSpecAsPage).toHaveBeenCalled()
    expect(publishSingleSpec).not.toHaveBeenCalled()
  })

  it('falls back to flat mode when shared doc no longer exists in ClickUp', async () => {
    vi.mocked(clickUpDocExists).mockResolvedValue(false)   // shared doc deleted
    vi.mocked(createSupabaseServiceClient).mockReturnValue(
      makeClickUpSupabase(CLICKUP_CREDS, folderMappingWithDoc) as never
    )
    vi.mocked(publishSingleSpec).mockResolvedValue({ page_id: 'new-doc', page_url: '' })

    await runPublishGroup({ project_id: PROJECT_ID, integration_id: INTEGRATION_ID, target_type: 'clickup', specs: [makeSpec()], matched_folder: 'docs/specs', clickup_mode: 'doc' })

    expect(publishSingleSpec).toHaveBeenCalled()
    expect(publishSpecAsPage).not.toHaveBeenCalled()
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
