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
    }
  }),
}))

import { publishToNotion, type NotionCredentials } from '../notion'

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
  mockClientCtor.mockReset()

  // Sensible defaults
  mockPagesCreate.mockResolvedValue({ id: 'created-page-id', url: 'https://notion.so/created-page-id' })
  mockPagesRetrieve.mockResolvedValue({ id: 'created-page-id', url: 'https://notion.so/created-page-id' })
  mockPagesUpdate.mockResolvedValue({ id: 'created-page-id' })
  mockBlocksList.mockResolvedValue({ results: [] })
  mockBlocksAppend.mockResolvedValue({})
  mockBlocksDelete.mockResolvedValue({})
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

  it('creates intermediate folder pages for nested specs', async () => {
    // First two list calls are folder-page lookups (return no match → create)
    mockBlocksList.mockResolvedValue({ results: [] })
    mockPagesCreate
      .mockResolvedValueOnce({ id: 'folder-1', url: '' })       // specs
      .mockResolvedValueOnce({ id: 'folder-2', url: '' })       // specs/payments
      .mockResolvedValueOnce({ id: 'spec-page', url: 'https://notion.so/spec-page' })

    const nested = { ...SPEC, path: 'specs/payments/checkout.md' }
    const result = await publishToNotion(PAGE_CREDS, nested, null)

    // 2 folder pages + 1 spec page
    expect(mockPagesCreate).toHaveBeenCalledTimes(3)

    // First folder under root
    expect(mockPagesCreate.mock.calls[0][0].parent).toEqual({ type: 'page_id', page_id: 'root-page-id' })
    // Second folder under first folder
    expect(mockPagesCreate.mock.calls[1][0].parent).toEqual({ type: 'page_id', page_id: 'folder-1' })
    // Spec under second folder
    expect(mockPagesCreate.mock.calls[2][0].parent).toEqual({ type: 'page_id', page_id: 'folder-2' })

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

    // No new page created for the spec
    // (folder-page creates would only happen if path were nested; SPEC.path = 'auth.md' is flat)
    expect(mockPagesCreate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Database mode
// ---------------------------------------------------------------------------
describe('Database mode — create', () => {
  it('creates a row using parent.data_source_id with Name + Content properties', async () => {
    const result = await publishToNotion(DB_CREDS, SPEC, null)

    expect(mockPagesCreate).toHaveBeenCalledTimes(1)
    const call = mockPagesCreate.mock.calls[0][0]
    expect(call.parent).toEqual({ type: 'data_source_id', data_source_id: 'data-source-id' })
    expect(call.properties.Name.title[0].text.content).toBe('Auth Spec')
    expect(call.properties.Content.rich_text[0].text.content).toBe(SPEC.content)
    expect(result).toEqual({ page_id: 'created-page-id', page_url: 'https://notion.so/created-page-id' })
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
  it('splits Content > 2000 chars into multiple rich_text segments in database mode', async () => {
    const longContent = 'x'.repeat(5500) // → 3 chunks (2000 + 2000 + 1500)
    await publishToNotion(DB_CREDS, { ...SPEC, content: longContent }, null)

    const call = mockPagesCreate.mock.calls[0][0]
    const segments = call.properties.Content.rich_text
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
