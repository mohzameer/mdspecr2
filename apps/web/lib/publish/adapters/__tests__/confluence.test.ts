/**
 * Confluence adapter — unit tests
 *
 * Covers:
 *   - mdToConfluenceStorage: headings, paragraphs, lists, code blocks, mixed content
 *   - publishToConfluence: create (builds folder hierarchy), update (version increment)
 *   - Flat path (no ancestor folders) — no intermediate pages
 *   - URL format: ${base}/wiki/spaces/${space_key}/pages/${pageId}
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock axios — use vi.hoisted so the vars are available when vi.mock runs
// ---------------------------------------------------------------------------
const { mockGet, mockPost, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
  },
}))

import { mdToConfluenceStorage, publishToConfluence, type ConfluenceCredentials } from '../confluence'

const CREDS: ConfluenceCredentials = {
  base_url: 'https://acme.atlassian.net',
  email: 'dev@acme.com',
  token: 'conf-tok',
  space_key: 'ENG',
}

const BASE = 'https://acme.atlassian.net'
const SPEC = {
  path: 'auth.md',
  content: '# Auth\n\nSpec content.',
  resolvedTitle: 'Auth Spec',
}

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
  mockPut.mockReset()
})

// ---------------------------------------------------------------------------
// mdToConfluenceStorage — pure function
// ---------------------------------------------------------------------------
describe('mdToConfluenceStorage — headings', () => {
  it('converts H1 to <h1>', () => {
    expect(mdToConfluenceStorage('# Hello')).toContain('<h1>Hello</h1>')
  })

  it('converts H2 to <h2>', () => {
    expect(mdToConfluenceStorage('## Hello')).toContain('<h2>Hello</h2>')
  })

  it('converts H3 to <h3>', () => {
    expect(mdToConfluenceStorage('### Hello')).toContain('<h3>Hello</h3>')
  })
})

describe('mdToConfluenceStorage — paragraphs and lists', () => {
  it('wraps plain text in <p>', () => {
    expect(mdToConfluenceStorage('Hello world')).toContain('<p>Hello world</p>')
  })

  it('converts - list item to <ul><li>', () => {
    expect(mdToConfluenceStorage('- item one')).toContain('<ul><li>item one</li></ul>')
  })

  it('converts * list item to <ul><li>', () => {
    expect(mdToConfluenceStorage('* item two')).toContain('<ul><li>item two</li></ul>')
  })

  it('skips blank lines (produces no output for whitespace-only lines)', () => {
    const result = mdToConfluenceStorage('\n\n   \n')
    expect(result.trim()).toBe('')
  })
})

describe('mdToConfluenceStorage — code blocks', () => {
  it('wraps code block in ac:structured-macro', () => {
    const md = '```js\nconsole.log("hi")\n```'
    const result = mdToConfluenceStorage(md)
    expect(result).toContain('<ac:structured-macro ac:name="code">')
    expect(result).toContain('</ac:structured-macro>')
  })

  it('sets language parameter from fence language', () => {
    const result = mdToConfluenceStorage('```typescript\nconst x = 1\n```')
    expect(result).toContain('<ac:parameter ac:name="language">typescript</ac:parameter>')
  })

  it('uses "none" when no language is specified', () => {
    const result = mdToConfluenceStorage('```\ncode here\n```')
    expect(result).toContain('<ac:parameter ac:name="language">none</ac:parameter>')
  })

  it('preserves multi-line code block body verbatim', () => {
    const body = 'line one\nline two\nline three'
    const result = mdToConfluenceStorage('```python\n' + body + '\n```')
    expect(result).toContain(body)
  })

  it('wraps body in CDATA section', () => {
    const result = mdToConfluenceStorage('```bash\necho hi\n```')
    expect(result).toContain('<![CDATA[echo hi]]>')
  })
})

describe('mdToConfluenceStorage — mixed content', () => {
  it('produces heading, paragraph, and list nodes in order', () => {
    const md = '# Title\n\nA paragraph.\n\n- item one'
    const result = mdToConfluenceStorage(md)
    expect(result).toContain('<h1>Title</h1>')
    expect(result).toContain('<p>A paragraph.</p>')
    expect(result).toContain('<ul><li>item one</li></ul>')
    // Verify ordering
    const h1Pos = result.indexOf('<h1>')
    const pPos = result.indexOf('<p>')
    const ulPos = result.indexOf('<ul>')
    expect(h1Pos).toBeLessThan(pPos)
    expect(pPos).toBeLessThan(ulPos)
  })

  it('handles heading followed immediately by code block', () => {
    const md = '## Setup\n```bash\nnpm install\n```'
    const result = mdToConfluenceStorage(md)
    expect(result).toContain('<h2>Setup</h2>')
    expect(result).toContain('<ac:structured-macro ac:name="code">')
    expect(result).toContain('npm install')
  })
})

// ---------------------------------------------------------------------------
// publishToConfluence — create (flat path, no ancestor folders)
// ---------------------------------------------------------------------------
describe('publishToConfluence — create, flat path', () => {
  it('searches for existing page then creates if not found', async () => {
    // findOrCreatePage: search returns empty → post creates
    mockGet.mockResolvedValueOnce({ data: { results: [] } })
    mockPost.mockResolvedValueOnce({ data: { id: 'new-page-id' } })

    const result = await publishToConfluence(CREDS, SPEC, null)

    expect(mockGet).toHaveBeenCalledOnce()
    expect(mockGet).toHaveBeenCalledWith(
      `${BASE}/wiki/rest/api/content`,
      expect.objectContaining({
        auth: { username: CREDS.email, password: CREDS.token },
        params: expect.objectContaining({ title: 'Auth Spec', spaceKey: 'ENG' }),
      })
    )
    expect(mockPost).toHaveBeenCalledOnce()
    expect(result).toEqual({
      page_id: 'new-page-id',
      page_url: `${BASE}/wiki/spaces/ENG/pages/new-page-id`,
    })
  })

  it('returns existing page ID when search finds a match (no POST)', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: [{ id: 'existing-page-id' }] } })

    const result = await publishToConfluence(CREDS, SPEC, null)

    expect(mockPost).not.toHaveBeenCalled()
    expect(result.page_id).toBe('existing-page-id')
  })

  it('passes storage body in create payload', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: [] } })
    mockPost.mockResolvedValueOnce({ data: { id: 'p1' } })

    await publishToConfluence(CREDS, { ...SPEC, content: '# Heading' }, null)

    const payload = mockPost.mock.calls[0][1] as Record<string, unknown>
    const body = payload.body as { storage: { value: string; representation: string } }
    expect(body.storage.representation).toBe('storage')
    expect(body.storage.value).toContain('<h1>Heading</h1>')
  })
})

// ---------------------------------------------------------------------------
// publishToConfluence — create with ancestor folders
// ---------------------------------------------------------------------------
describe('publishToConfluence — create with folder hierarchy', () => {
  it('creates intermediate folder pages before the spec page', async () => {
    const nestedSpec = {
      path: 'docs/specs/auth.md',
      content: '# Auth',
      resolvedTitle: 'Auth Spec',
    }

    // findOrCreatePage calls: 'docs' → 'specs' → 'Auth Spec'
    // Each: GET (not found) → POST (create)
    mockGet
      .mockResolvedValueOnce({ data: { results: [] } })  // docs: not found
      .mockResolvedValueOnce({ data: { results: [] } })  // specs: not found
      .mockResolvedValueOnce({ data: { results: [] } })  // Auth Spec: not found
    mockPost
      .mockResolvedValueOnce({ data: { id: 'folder-docs' } })
      .mockResolvedValueOnce({ data: { id: 'folder-specs' } })
      .mockResolvedValueOnce({ data: { id: 'spec-page' } })

    const result = await publishToConfluence(CREDS, nestedSpec, null)

    // 3 GET searches + 3 POSTs
    expect(mockGet).toHaveBeenCalledTimes(3)
    expect(mockPost).toHaveBeenCalledTimes(3)

    // First folder page: no ancestors (parentId=null)
    const firstPost = mockPost.mock.calls[0][1] as Record<string, unknown>
    expect(firstPost.ancestors).toBeUndefined()

    // Second folder page: ancestors = [{ id: 'folder-docs' }]
    const secondPost = mockPost.mock.calls[1][1] as Record<string, unknown>
    expect(secondPost.ancestors).toEqual([{ id: 'folder-docs' }])

    // Spec page: ancestors = [{ id: 'folder-specs' }]
    const thirdPost = mockPost.mock.calls[2][1] as Record<string, unknown>
    expect(thirdPost.ancestors).toEqual([{ id: 'folder-specs' }])

    expect(result.page_id).toBe('spec-page')
  })

  it('reuses existing folder pages (no POST when GET finds result)', async () => {
    const nestedSpec = { path: 'docs/auth.md', content: '# Auth', resolvedTitle: 'Auth' }

    mockGet
      .mockResolvedValueOnce({ data: { results: [{ id: 'existing-docs-folder' }] } }) // docs: found
      .mockResolvedValueOnce({ data: { results: [] } })                               // Auth: not found
    mockPost.mockResolvedValueOnce({ data: { id: 'auth-page' } })

    await publishToConfluence(CREDS, nestedSpec, null)

    // Only one POST — for the spec page; docs folder reused
    expect(mockPost).toHaveBeenCalledOnce()
    const postPayload = mockPost.mock.calls[0][1] as Record<string, unknown>
    expect(postPayload.ancestors).toEqual([{ id: 'existing-docs-folder' }])
  })
})

// ---------------------------------------------------------------------------
// publishToConfluence — update (existingPageId provided)
// ---------------------------------------------------------------------------
describe('publishToConfluence — update', () => {
  it('fetches current version, increments by 1, and PUTs updated body', async () => {
    // Ancestor folders: none (flat path 'auth.md')
    // Version fetch GET:
    mockGet.mockResolvedValueOnce({ data: { version: { number: 5 } } })
    mockPut.mockResolvedValueOnce({})

    const result = await publishToConfluence(CREDS, SPEC, 'page-existing')

    // GET fetches current version of the existing page
    expect(mockGet).toHaveBeenCalledOnce()
    expect(mockGet).toHaveBeenCalledWith(
      `${BASE}/wiki/rest/api/content/page-existing`,
      expect.objectContaining({ params: { expand: 'version' } })
    )

    // PUT increments version number
    expect(mockPut).toHaveBeenCalledOnce()
    const putPayload = mockPut.mock.calls[0][1] as Record<string, unknown>
    expect((putPayload.version as { number: number }).number).toBe(6)
    expect((putPayload.body as { storage: { value: string } }).storage.value).toContain('<h1>Auth</h1>')

    expect(result).toEqual({
      page_id: 'page-existing',
      page_url: `${BASE}/wiki/spaces/ENG/pages/page-existing`,
    })
  })

  it('builds ancestor folder pages before updating (nested path)', async () => {
    const nestedSpec = { path: 'docs/auth.md', content: '# Auth', resolvedTitle: 'Auth' }

    // docs folder: found
    mockGet
      .mockResolvedValueOnce({ data: { results: [{ id: 'docs-folder' }] } })
      // version fetch for existing page
      .mockResolvedValueOnce({ data: { version: { number: 2 } } })
    mockPut.mockResolvedValueOnce({})

    await publishToConfluence(CREDS, nestedSpec, 'page-existing')

    // 2 GETs: folder search + version fetch
    expect(mockGet).toHaveBeenCalledTimes(2)
    // PUT updates existing page (no POST)
    expect(mockPost).not.toHaveBeenCalled()
    expect(mockPut).toHaveBeenCalledOnce()
  })

  it('returns existing page_id and correct URL after update', async () => {
    mockGet.mockResolvedValueOnce({ data: { version: { number: 1 } } })
    mockPut.mockResolvedValueOnce({})

    const result = await publishToConfluence(CREDS, SPEC, 'page-upd')

    expect(result.page_id).toBe('page-upd')
    expect(result.page_url).toBe(`${BASE}/wiki/spaces/ENG/pages/page-upd`)
  })
})

// ---------------------------------------------------------------------------
// publishToConfluence — auth forwarded correctly
// ---------------------------------------------------------------------------
describe('publishToConfluence — auth forwarding', () => {
  it('uses Basic Auth (email + token) on all requests', async () => {
    mockGet.mockResolvedValueOnce({ data: { results: [] } })
    mockPost.mockResolvedValueOnce({ data: { id: 'p1' } })

    await publishToConfluence(CREDS, SPEC, null)

    for (const call of mockGet.mock.calls) {
      const opts = call[1] as { auth?: { username: string; password: string } }
      expect(opts?.auth).toEqual({ username: 'dev@acme.com', password: 'conf-tok' })
    }
    for (const call of mockPost.mock.calls) {
      const opts = call[2] as { auth?: { username: string; password: string } }
      expect(opts?.auth).toEqual({ username: 'dev@acme.com', password: 'conf-tok' })
    }
  })

  it('strips trailing slash from base_url', async () => {
    const credsWithSlash = { ...CREDS, base_url: 'https://acme.atlassian.net/' }
    mockGet.mockResolvedValueOnce({ data: { results: [] } })
    mockPost.mockResolvedValueOnce({ data: { id: 'p1' } })

    const result = await publishToConfluence(credsWithSlash, SPEC, null)

    expect(mockGet).toHaveBeenCalledWith(
      'https://acme.atlassian.net/wiki/rest/api/content',
      expect.anything()
    )
    // No double-slash in the path portion after the protocol
    expect(result.page_url.replace('https://', '')).not.toContain('//')
  })
})
