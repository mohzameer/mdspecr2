/**
 * Jira adapter — unit tests
 *
 * Covers:
 *   - mdToAdf: headings, paragraphs, lists, code blocks, empty input
 *   - publishToJira: create (POST /issue), update (GET verify + PUT),
 *     self-heal when the stored issue 404s
 *   - URL format: ${site_url}/browse/${issueKey}
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

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

import { mdToAdf, publishToJira, type JiraOAuthCredentials } from '../jira'

const CREDS: JiraOAuthCredentials = {
  cloud_id: 'cloud-123',
  site_url: 'https://acme.atlassian.net',
  access_token: 'jira-tok',
  refresh_token: 'jira-refresh',
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  project_key: 'ENG',
}

const API = 'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3'
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
// mdToAdf — pure function
// ---------------------------------------------------------------------------
describe('mdToAdf', () => {
  it('wraps output in a versioned doc node', () => {
    const adf = mdToAdf('hello')
    expect(adf.type).toBe('doc')
    expect(adf.version).toBe(1)
    expect(adf.content).toHaveLength(1)
  })

  it('converts headings with the correct level', () => {
    expect(mdToAdf('# H1').content![0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(mdToAdf('## H2').content![0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(mdToAdf('### H3').content![0]).toMatchObject({ type: 'heading', attrs: { level: 3 } })
  })

  it('converts a plain line to a paragraph with a text node', () => {
    const para = mdToAdf('just text').content![0]
    expect(para.type).toBe('paragraph')
    expect(para.content).toEqual([{ type: 'text', text: 'just text' }])
  })

  it('groups consecutive bullets into one bulletList', () => {
    const adf = mdToAdf('- one\n- two')
    expect(adf.content).toHaveLength(1)
    expect(adf.content![0].type).toBe('bulletList')
    expect(adf.content![0].content).toHaveLength(2)
  })

  it('groups consecutive numbered items into one orderedList', () => {
    const adf = mdToAdf('1. one\n2. two')
    expect(adf.content![0].type).toBe('orderedList')
    expect(adf.content![0].content).toHaveLength(2)
  })

  it('converts a fenced block to a codeBlock', () => {
    const adf = mdToAdf('```\nconst x = 1\n```')
    expect(adf.content![0]).toMatchObject({
      type: 'codeBlock',
      content: [{ type: 'text', text: 'const x = 1' }],
    })
  })

  it('skips blank lines and never emits empty text nodes', () => {
    const adf = mdToAdf('a\n\n\nb')
    expect(adf.content).toHaveLength(2)
  })

  it('always emits at least one block node for empty input', () => {
    const adf = mdToAdf('')
    expect(adf.content).toHaveLength(1)
    expect(adf.content![0]).toEqual({ type: 'paragraph', content: [] })
  })
})

// ---------------------------------------------------------------------------
// publishToJira — create
// ---------------------------------------------------------------------------
describe('publishToJira — create', () => {
  it('POSTs a new issue and returns its key and browse URL', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: '10001', key: 'ENG-7' } })

    const result = await publishToJira(CREDS, SPEC, null)

    expect(mockPost).toHaveBeenCalledTimes(1)
    const [url, payload] = mockPost.mock.calls[0]
    expect(url).toBe(`${API}/issue`)
    expect(payload.fields.project).toEqual({ key: 'ENG' })
    expect(payload.fields.summary).toBe('Auth Spec')
    expect(payload.fields.issuetype).toEqual({ name: 'Task' })
    expect(payload.fields.description.type).toBe('doc')
    expect(result).toEqual({
      page_id: 'ENG-7',
      page_url: 'https://acme.atlassian.net/browse/ENG-7',
    })
  })

  it('uses the project key override when provided', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: '1', key: 'OPS-3' } })
    await publishToJira(CREDS, SPEC, null, 'OPS')
    expect(mockPost.mock.calls[0][1].fields.project).toEqual({ key: 'OPS' })
  })

  it('uses the issue type override when provided', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: '1', key: 'ENG-9' } })
    await publishToJira(CREDS, SPEC, null, null, 'Story')
    expect(mockPost.mock.calls[0][1].fields.issuetype).toEqual({ name: 'Story' })
  })
})

// ---------------------------------------------------------------------------
// publishToJira — update
// ---------------------------------------------------------------------------
describe('publishToJira — update', () => {
  it('verifies the stored issue then PUTs the updated fields', async () => {
    mockGet.mockResolvedValueOnce({ data: { key: 'ENG-7' } })
    mockPut.mockResolvedValueOnce({ data: {} })

    const result = await publishToJira(CREDS, SPEC, 'ENG-7')

    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockPost).not.toHaveBeenCalled()
    const [url, payload] = mockPut.mock.calls[0]
    expect(url).toBe(`${API}/issue/ENG-7`)
    expect(payload.fields.summary).toBe('Auth Spec')
    expect(result.page_id).toBe('ENG-7')
  })

  it('falls through to create when the stored issue 404s', async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 404 } })
    mockPost.mockResolvedValueOnce({ data: { id: '2', key: 'ENG-12' } })

    const result = await publishToJira(CREDS, SPEC, 'ENG-7')

    expect(mockPut).not.toHaveBeenCalled()
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(result.page_id).toBe('ENG-12')
  })

  it('rethrows non-404 errors during update', async () => {
    mockGet.mockRejectedValueOnce({ response: { status: 500 } })
    await expect(publishToJira(CREDS, SPEC, 'ENG-7')).rejects.toBeDefined()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
