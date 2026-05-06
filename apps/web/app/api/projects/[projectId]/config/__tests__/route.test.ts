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

  function makeMapClient(folderMappings: unknown[], aliases: unknown[]) {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === 'projects') return makeChain({ data: { id: PROJECT_ID, org_id: ORG_ID, spec_dirs: ['docs'], name: 'Test' }, error: null })
        if (table === 'folder_mappings') return makeChain({ data: folderMappings, error: null })
        if (table === 'aliases') return makeChain({ data: aliases, error: null })
        return makeChain({ data: null, error: null })
      }),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
    }
    return sb
  }

  // ---------------------------------------------------------------------------
  // Helper to build a mock supabase client for the generator with specific mappings
  // ---------------------------------------------------------------------------

  // Real-world scenario: 4 folders, all ClickUp, mix of doc/task_list
  it('2.4.10 real-world scenario: 4 folders, all ClickUp, default: emitted, per-mapping fields correct', async () => {
    const sb = makeMapClient([
      // / (root) — doc, workspace root, no parent doc, no skip
      {
        folder_path: '', integration_id: 'ck1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'clickup' },
      },
      // src — doc, workspace root, has parent doc
      {
        folder_path: 'src', integration_id: 'ck1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: '2kzm3ftx-5278', clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'clickup' },
      },
      // src/hooks — doc, workspace root, no parent doc
      {
        folder_path: 'src/hooks', integration_id: 'ck1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'clickup' },
      },
      // src/utils — task_list, with list ID, custom task IDs, agent template, skip
      {
        folder_path: 'src/utils', integration_id: 'ck1', clickup_mode: 'task_list',
        skip_patterns: ['archive/*'], target_id: 'space:90187244544',
        clickup_list_id: '901812098656', clickup_doc_id: null,
        clickup_use_custom_task_ids: true,
        template_id: 'tpl1', templates: { name: 'Task Template' },
        integrations: { type: 'clickup' },
      },
    ], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()

    // default: block since all are clickup
    expect(text).toContain('default:')
    expect(text).toContain('integration: clickup')
    // parent is always a comment in default — never auto-populated
    expect(text).not.toMatch(/^  parent:/m)

    // / (root) — minimal, just folder
    expect(text).toContain('- folder: /')
    // no per-mapping integration: since default covers it
    expect(text).not.toMatch(/^    integration:/m)

    // src — has parent_doc
    expect(text).toContain('folder: src')
    expect(text).toContain('parent_doc: id:2kzm3ftx-5278')

    // src/hooks — minimal, just folder (no parent_doc, no target)
    expect(text).toContain('folder: src/hooks')

    // src/utils — task_list with all fields
    expect(text).toContain('folder: src/utils')
    expect(text).toContain('target: task')
    expect(text).toContain('list_id: id:901812098656')
    expect(text).toContain('space_id: id:space:90187244544')
    expect(text).toContain('custom_task_ids: true')
    expect(text).toContain('agent: Task Template')
    expect(text).toContain('- "archive/*"')
  })

  it('2.4.11 workspace root (target_id null) emits no space_id', async () => {
    const sb = makeMapClient([{
      folder_path: 'docs', integration_id: 'ck1', clickup_mode: 'doc',
      skip_patterns: [], target_id: null, clickup_list_id: null,
      clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).not.toContain('space_id:')
  })

  it('2.4.12 task_list with no list_id emits commented placeholder', async () => {
    const sb = makeMapClient([{
      folder_path: 'src/utils', integration_id: 'ck1', clickup_mode: 'task_list',
      skip_patterns: [], target_id: null, clickup_list_id: null,
      clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('# list_id: id:<clickup-list-id>')
  })

  it('2.4.13 custom_task_ids false does not emit custom_task_ids field', async () => {
    const sb = makeMapClient([{
      folder_path: 'src/utils', integration_id: 'ck1', clickup_mode: 'task_list',
      skip_patterns: [], target_id: null, clickup_list_id: '901812098656',
      clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).not.toContain('custom_task_ids:')
  })

  it('2.4.14 mixed integrations emit per-mapping integration: and no default:', async () => {
    const sb = makeMapClient([
      {
        folder_path: 'docs', integration_id: 'ck1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'clickup' },
      },
      {
        folder_path: 'specs', integration_id: 'no1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'notion' },
      },
    ], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    // no default: block (the word appears in a comment about sync_all_on_first_run but not as a YAML key)
    expect(text).not.toMatch(/^default:/m)
    // per-mapping integrations
    expect(text).toContain('integration: clickup')
    expect(text).toContain('integration: notion')
  })

  it('2.4.15 doc mapping without parent_doc emits no parent_doc field', async () => {
    const sb = makeMapClient([{
      folder_path: 'docs', integration_id: 'ck1', clickup_mode: 'doc',
      skip_patterns: [], target_id: null, clickup_list_id: null,
      clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).not.toContain('parent_doc:')
  })

  it('2.4.16 agent template name is emitted only when set', async () => {
    const sb = makeMapClient([
      {
        folder_path: 'src/utils', integration_id: 'ck1', clickup_mode: 'task_list',
        skip_patterns: [], target_id: null, clickup_list_id: '901812098656',
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: 'tpl1', templates: { name: 'Release Notes' },
        integrations: { type: 'clickup' },
      },
      {
        folder_path: 'docs', integration_id: 'ck1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'clickup' },
      },
    ], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('agent: Release Notes')
    // only one agent line — the docs mapping has no agent
    expect(text.match(/^    agent:/gm)?.length).toBe(1)
  })

  it('2.4.6 task_list mapping emits list_id with id: prefix', async () => {
    const sb = makeMapClient([{
      folder_path: 'src/utils', integration_id: 'int1', clickup_mode: 'task_list',
      skip_patterns: [], target_id: null, clickup_list_id: '901812098656',
      clickup_doc_id: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('target: task')
    expect(text).toContain('list_id: id:901812098656')
  })

  it('2.4.7 doc mapping with parent doc emits parent_doc with id: prefix', async () => {
    const sb = makeMapClient([{
      folder_path: 'src', integration_id: 'int1', clickup_mode: 'doc',
      skip_patterns: [], target_id: null, clickup_list_id: null,
      clickup_doc_id: '2kzm3ftx-5278', integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('parent_doc: id:2kzm3ftx-5278')
  })

  it('2.4.8 mapping with space target emits space_id with id: prefix', async () => {
    const sb = makeMapClient([{
      folder_path: '/', integration_id: 'int1', clickup_mode: 'doc',
      skip_patterns: [], target_id: 'space:90181844797', clickup_list_id: null,
      clickup_doc_id: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('space_id: id:space:90181844797')
  })

  it('2.4.9 generator does not emit parent — user must set it manually', async () => {
    const sb = makeMapClient([{
      folder_path: 'docs/specs', integration_id: 'int1', clickup_mode: 'doc',
      skip_patterns: [], target_id: null, clickup_list_id: null,
      clickup_doc_id: null, integrations: { type: 'clickup' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    // parent is always emitted as a comment — never auto-populated
    expect(text).not.toMatch(/^  parent:/m)
    expect(text).toContain('# parent:')
  })

  // ---------------------------------------------------------------------------
  // 2.4.20+ — target_id field-name matrix per integration type
  // The server route must emit:
  //   clickup    → space_id: id:<target>
  //   s3         → parent_dir: <target>
  //   notion     → parent: id:<target>
  //   confluence → parent: id:<target>
  // ---------------------------------------------------------------------------

  it('2.4.20 Notion mapping with target_id emits parent: id:<target> (NOT space_id)', async () => {
    const sb = makeMapClient([{
      folder_path: 'src/utils', integration_id: 'no1', clickup_mode: null,
      skip_patterns: [], target_id: 'cc69bd0f-98d7-4d6e-8701-72d92a920cf5',
      clickup_list_id: null, clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'notion' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('parent: id:cc69bd0f-98d7-4d6e-8701-72d92a920cf5')
    expect(text).not.toMatch(/^    space_id:/m)
    expect(text).not.toContain('parent_dir:')
  })

  it('2.4.21 S3 mapping with target_id emits parent_dir: <target> (NOT space_id, no id: prefix)', async () => {
    const sb = makeMapClient([{
      folder_path: 'src', integration_id: 's31', clickup_mode: null,
      skip_patterns: [], target_id: 'eng-specs',
      clickup_list_id: null, clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 's3' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('parent_dir: eng-specs')
    expect(text).not.toMatch(/^    space_id:/m)
    expect(text).not.toContain('parent: id:')
  })

  it('2.4.22 Confluence mapping with target_id emits parent: id:<target> (NOT space_id)', async () => {
    const sb = makeMapClient([{
      folder_path: 'docs', integration_id: 'cf1', clickup_mode: null,
      skip_patterns: [], target_id: '12345',
      clickup_list_id: null, clickup_doc_id: null, clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'confluence' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('parent: id:12345')
    expect(text).not.toMatch(/^    space_id:/m)
    expect(text).not.toContain('parent_dir:')
  })

  it('2.4.23 mixed-integration map: each row uses its own target_id field name', async () => {
    const sb = makeMapClient([
      {
        folder_path: '', integration_id: 'ck1', clickup_mode: 'doc',
        skip_patterns: [], target_id: null, clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'clickup' },
      },
      {
        folder_path: 'src', integration_id: 's31', clickup_mode: null,
        skip_patterns: [], target_id: 'eng-specs', clickup_list_id: null,
        clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 's3' },
      },
      {
        folder_path: 'src/utils', integration_id: 'no1', clickup_mode: null,
        skip_patterns: [], target_id: 'cc69bd0f-98d7-4d6e-8701-72d92a920cf5',
        clickup_list_id: null, clickup_doc_id: null, clickup_use_custom_task_ids: false,
        template_id: null, templates: null, integrations: { type: 'notion' },
      },
    ], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).toContain('parent_dir: eng-specs')
    expect(text).toContain('parent: id:cc69bd0f-98d7-4d6e-8701-72d92a920cf5')
    // No space_id should appear at all in this map (none of the mappings has clickup target_id set)
    expect(text).not.toMatch(/^    space_id:/m)
  })

  it('2.4.24 ClickUp parent_doc field is not emitted for non-ClickUp integrations', async () => {
    // clickup_doc_id should never be populated for non-ClickUp rows in practice,
    // but the generator must still gate parent_doc on intType === 'clickup'.
    const sb = makeMapClient([{
      folder_path: 'src', integration_id: 'no1', clickup_mode: null,
      skip_patterns: [], target_id: null,
      clickup_list_id: null, clickup_doc_id: '2kzm3ftx-5278',
      clickup_use_custom_task_ids: false,
      template_id: null, templates: null, integrations: { type: 'notion' },
    }], [])
    vi.mocked(createSupabaseServerClient).mockResolvedValue(sb as never)

    const res = await generateMap(new Request(`http://localhost/api/projects/${PROJECT_ID}/generate-mdspecmap`), { params: mapParams })
    const text = await res.text()
    expect(text).not.toContain('parent_doc:')
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
