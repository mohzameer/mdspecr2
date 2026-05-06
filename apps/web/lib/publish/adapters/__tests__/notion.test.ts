/**
 * Notion adapter — unit tests
 *
 * Covers:
 *   - Notion-Version header pin (2025-09-03)
 *   - Page mode: create, update, nested folder hierarchy
 *   - Database mode: create row with parent.data_source_id, update row, missing data_source_id
 *   - rich_text chunking for content > 2000 chars
 *   - Block batching at 100 per request
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @notionhq/client
// ---------------------------------------------------------------------------
const mockPagesCreate = vi.fn()
const mockPagesUpdate = vi.fn()
const mockPagesRetrieve = vi.fn()
const mockBlocksList = vi.fn()
const mockBlocksAppend = vi.fn()
const mockBlocksDelete = vi.fn()
const mockRequest = vi.fn()
const mockClientCtor = vi.fn()

vi.mock('@notionhq/client', () => ({
  Client: vi.fn().mockImplementation((opts) => {
    mockClientCtor(opts)
    return {
      pages: {
        create: mockPagesCreate,
        update: mockPagesUpdate,
        retrieve: mockPagesRetrieve,
      },
      blocks: {
        delete: mockBlocksDelete,
        children: {
          list: mockBlocksList,
          append: mockBlocksAppend,
        },
      },
      request: mockRequest,
    }
  }),
}))

import { publishToNotion, getNotionPageParentId, type NotionCredentials } from '../notion'

const PAGE_CREDS: NotionCredentials = {
  token: 'secret_abc',
  root_page_id: 'root-page-id',
}

const DB_CREDS: NotionCredentials = {
  token: 'secret_abc',
  root_page_id: 'root-page-id',
  mode: 'database',
  database_id: 'db-id',
  data_source_id: 'data-source-id',
}

const SPEC = {
  path: 'auth.md',
  content: '# Heading\n\nSome paragraph.',
  resolvedTitle: 'Auth Spec',
}

beforeEach(() => {
  mockPagesCreate.mockReset()
  mockPagesUpdate.mockReset()
  mockPagesRetrieve.mockReset()
  mockBlocksList.mockReset()
  mockBlocksAppend.mockReset()
  mockBlocksDelete.mockReset()
  mockRequest.mockReset()
  mockClientCtor.mockReset()

  // Sensible defaults
  mockPagesCreate.mockResolvedValue({ id: 'created-page-id', url: 'https://notion.so/created-page-id' })
  mockPagesRetrieve.mockResolvedValue({ id: 'created-page-id', url: 'https://notion.so/created-page-id' })
  mockPagesUpdate.mockResolvedValue({ id: 'created-page-id' })
  mockBlocksList.mockResolvedValue({ results: [] })
  mockBlocksAppend.mockResolvedValue({})
  mockBlocksDelete.mockResolvedValue({})
  mockRequest.mockResolvedValue({ properties: { Name: { type: 'title' } } })
})

// ---------------------------------------------------------------------------
// Notion-Version header
// ---------------------------------------------------------------------------
describe('Notion-Version header', () => {
  it('pins notionVersion to 2025-09-03 on every Client construction', async () => {
    await publishToNotion(PAGE_CREDS, SPEC, null)
    expect(mockClientCtor).toHaveBeenCalledWith(
      expect.objectContaining({ auth: 'secret_abc', notionVersion: '2025-09-03' })
    )
  })
})

// ---------------------------------------------------------------------------
// Page mode
// ---------------------------------------------------------------------------
describe('Page mode — create', () => {
  it('creates a page under the root with parent.page_id', async () => {
    const result = await publishToNotion(PAGE_CREDS, SPEC, null)

    expect(mockPagesCreate).toHaveBeenCalledTimes(1)
    const call = mockPagesCreate.mock.calls[0][0]
    expect(call.parent).toEqual({ type: 'page_id', page_id: 'root-page-id' })
    expect(call.properties.title.title[0].text.content).toBe('Auth Spec')
    expect(result).toEqual({ page_id: 'created-page-id', page_url: 'https://notion.so/created-page-id' })
  })

  it('publishes nested-path specs flat under root_page_id (no folder hierarchy in Notion)', async () => {
    // Notion publishes are flat: the .mdspecmap parent is authoritative and
    // every spec lands directly under it. Repo folders never become Notion
    // wrapper pages — there is no `pages.update`-able way to relocate later,
    // so we keep the destination shape fixed and source-of-truth driven.
    mockPagesCreate.mockResolvedValueOnce({ id: 'spec-page', url: 'https://notion.so/spec-page' })

    const nested = { ...SPEC, path: 'specs/payments/checkout.md' }
    const result = await publishToNotion(PAGE_CREDS, nested, null)

    expect(mockPagesCreate).toHaveBeenCalledTimes(1)
    expect(mockPagesCreate.mock.calls[0][0].parent).toEqual({ type: 'page_id', page_id: 'root-page-id' })
    expect(result.page_id).toBe('spec-page')
  })
})

describe('Page mode — update', () => {
  it('clears existing blocks then appends fresh ones', async () => {
    mockBlocksList.mockResolvedValue({ results: [{ id: 'old-block-1' }, { id: 'old-block-2' }] })

    await publishToNotion(PAGE_CREDS, SPEC, 'existing-page-id')

    // Two existing blocks deleted
    expect(mockBlocksDelete).toHaveBeenCalledTimes(2)
    expect(mockBlocksDelete).toHaveBeenCalledWith({ block_id: 'old-block-1' })
    expect(mockBlocksDelete).toHaveBeenCalledWith({ block_id: 'old-block-2' })

    // Fresh content appended on existing page
    expect(mockBlocksAppend).toHaveBeenCalled()
    expect(mockBlocksAppend.mock.calls[0][0].block_id).toBe('existing-page-id')

    // Adapter never creates wrapper pages — flat publishing only
    expect(mockPagesCreate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// getNotionPageParentId — used by the publish processor to detect when a
// stored external_page_id points under a parent that no longer matches the
// .mdspecmap-authoritative target_id, so we can abandon and recreate.
// ---------------------------------------------------------------------------
describe('getNotionPageParentId', () => {
  it('returns the parent page_id for a normal nested page', async () => {
    mockPagesRetrieve.mockResolvedValueOnce({ id: 'p1', parent: { type: 'page_id', page_id: 'parent-abc' } })
    const res = await getNotionPageParentId('secret_abc', 'p1')
    expect(res).toEqual({ ok: true, parentId: 'parent-abc' })
  })

  it('returns parentId=null when the page lives under a database/workspace (not page-parented)', async () => {
    mockPagesRetrieve.mockResolvedValueOnce({ id: 'p1', parent: { type: 'workspace' } })
    const res = await getNotionPageParentId('secret_abc', 'p1')
    expect(res).toEqual({ ok: true, parentId: null })
  })

  it('reports missing when the page is archived', async () => {
    mockPagesRetrieve.mockResolvedValueOnce({ id: 'p1', archived: true, parent: { type: 'page_id', page_id: 'parent-abc' } })
    const res = await getNotionPageParentId('secret_abc', 'p1')
    expect(res).toEqual({ ok: false, missing: true })
  })

  it('reports missing on object_not_found from Notion', async () => {
    mockPagesRetrieve.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'object_not_found' }))
    const res = await getNotionPageParentId('secret_abc', 'p1')
    expect(res).toEqual({ ok: false, missing: true })
  })

  it('rethrows non-recoverable errors (e.g. network/auth) so the worker retries', async () => {
    mockPagesRetrieve.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { code: 'rate_limited' }))
    await expect(getNotionPageParentId('secret_abc', 'p1')).rejects.toThrow(/rate limited/)
  })
})

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------
describe('Database mode — create', () => {
  it('creates a row using parent.data_source_id with the database title property', async () => {
    const result = await publishToNotion(DB_CREDS, SPEC, null)

    expect(mockPagesCreate).toHaveBeenCalledTimes(1)
    const call = mockPagesCreate.mock.calls[0][0]
    expect(call.parent).toEqual({ type: 'data_source_id', data_source_id: 'data-source-id' })
    expect(call.properties.Name.title[0].text.content).toBe('Auth Spec')
    expect(call.properties.Content).toBeUndefined()
    expect(result).toEqual({ page_id: 'created-page-id', page_url: 'https://notion.so/created-page-id' })
  })

  it('uses the auto-detected title property name (custom column name)', async () => {
    mockRequest.mockResolvedValueOnce({ properties: { 'Task name': { type: 'title' }, Status: { type: 'select' } } })
    await publishToNotion(DB_CREDS, SPEC, null)
    const call = mockPagesCreate.mock.calls[0][0]
    expect(call.properties['Task name'].title[0].text.content).toBe('Auth Spec')
    expect(call.properties.Name).toBeUndefined()
  })

  it('throws when data_source_id is missing', async () => {
    const bad: NotionCredentials = { ...DB_CREDS, data_source_id: undefined }
    await expect(publishToNotion(bad, SPEC, null)).rejects.toThrow(/data_source_id/)
  })
})

describe('Database mode — update', () => {
  it('updates row properties and replaces child blocks', async () => {
    mockBlocksList.mockResolvedValue({ results: [{ id: 'old-1' }] })

    await publishToNotion(DB_CREDS, SPEC, 'existing-row-id')

    // Properties patched
    expect(mockPagesUpdate).toHaveBeenCalledTimes(1)
    const update = mockPagesUpdate.mock.calls[0][0]
    expect(update.page_id).toBe('existing-row-id')
    expect(update.properties.Name.title[0].text.content).toBe('Auth Spec')

    // Old blocks cleared, new ones appended
    expect(mockBlocksDelete).toHaveBeenCalledWith({ block_id: 'old-1' })
    expect(mockBlocksAppend).toHaveBeenCalled()

    // No new page created
    expect(mockPagesCreate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// rich_text chunking and block batching
// ---------------------------------------------------------------------------
describe('rich_text chunking', () => {
  it('splits paragraph text > 2000 chars into multiple rich_text segments', async () => {
    const longLine = 'x'.repeat(5500) // → 3 chunks (2000 + 2000 + 1500)
    await publishToNotion(PAGE_CREDS, { ...SPEC, content: longLine }, null)

    const call = mockPagesCreate.mock.calls[0][0]
    const paragraph = call.children[0]
    expect(paragraph.type).toBe('paragraph')
    const segments = paragraph.paragraph.rich_text
    expect(segments).toHaveLength(3)
    expect(segments[0].text.content.length).toBe(2000)
    expect(segments[1].text.content.length).toBe(2000)
    expect(segments[2].text.content.length).toBe(1500)
  })
})

describe('Block batching', () => {
  it('appends remaining blocks in chunks of 100 after create', async () => {
    // Build content with 250 paragraph lines → 250 blocks
    const lines: string[] = []
    for (let i = 0; i < 250; i++) lines.push(`line ${i}`)
    const content = lines.join('\n')

    await publishToNotion(PAGE_CREDS, { ...SPEC, content }, null)

    // First 100 sent via children on create; remaining 150 via 2 append calls (100 + 50)
    const createCall = mockPagesCreate.mock.calls[0][0]
    expect(createCall.children).toHaveLength(100)
    expect(mockBlocksAppend).toHaveBeenCalledTimes(2)
    expect(mockBlocksAppend.mock.calls[0][0].children).toHaveLength(100)
    expect(mockBlocksAppend.mock.calls[1][0].children).toHaveLength(50)
  })
})
