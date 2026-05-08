import { describe, it, expect } from 'vitest'
import { extractLinkId } from '../commands/publish.js'

// ---------------------------------------------------------------------------
// Notion
// ---------------------------------------------------------------------------
describe('Notion', () => {
  it('extracts 32-char hex ID with title prefix', () => {
    expect(extractLinkId('https://www.notion.so/my-workspace/Engineering-Docs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'))
      .toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
  })

  it('extracts bare 32-char hex ID with no title prefix', () => {
    expect(extractLinkId('https://www.notion.so/a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'))
      .toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
  })

  it('extracts hyphenated UUID and preserves hyphens', () => {
    expect(extractLinkId('https://www.notion.so/my-ws/a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4'))
      .toBe('a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4')
  })

  it('extracts ID from database URL with ?v= view param', () => {
    expect(extractLinkId('https://www.notion.so/my-workspace/My-DB-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4?v=someviewid'))
      .toBe('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
  })

  it('throws on URL with no recognisable ID segment', () => {
    expect(() => extractLinkId('https://www.notion.so/')).toThrow(/did not match any known Notion/)
  })

  it('throws on short path with no 32-char hex', () => {
    expect(() => extractLinkId('https://www.notion.so/abc')).toThrow(/did not match any known Notion/)
  })
})

// ---------------------------------------------------------------------------
// Confluence Cloud
// ---------------------------------------------------------------------------
describe('Confluence Cloud', () => {
  it('extracts numeric page ID from standard cloud URL', () => {
    expect(extractLinkId('https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Platform+Docs'))
      .toBe('123456')
  })

  it('extracts page ID when no title segment follows', () => {
    expect(extractLinkId('https://acme.atlassian.net/wiki/spaces/ENG/pages/123456'))
      .toBe('123456')
  })

  it('extracts page ID with trailing slash', () => {
    expect(extractLinkId('https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/'))
      .toBe('123456')
  })

  it('throws with Data Center message for /display/ URLs', () => {
    expect(() => extractLinkId('https://acme.atlassian.net/display/ENG/Auth+Flow'))
      .toThrow(/Confluence Data Center URLs/)
  })

  it('throws on cloud URL missing page ID segment', () => {
    expect(() => extractLinkId('https://acme.atlassian.net/wiki/spaces/ENG/pages/'))
      .toThrow(/Expected a Confluence Cloud URL/)
  })
})

// ---------------------------------------------------------------------------
// ClickUp
// ---------------------------------------------------------------------------
describe('ClickUp', () => {
  it('extracts space ID from /v/s/ URL', () => {
    expect(extractLinkId('https://app.clickup.com/90181234/v/s/90181844797'))
      .toBe('90181844797')
  })

  it('extracts list ID from /li/ URL', () => {
    expect(extractLinkId('https://app.clickup.com/90181234/li/901812098656'))
      .toBe('901812098656')
  })

  it('extracts doc ID from /docs/ URL', () => {
    expect(extractLinkId('https://app.clickup.com/90181234/docs/abc123xyz'))
      .toBe('abc123xyz')
  })

  it('throws on unrecognised ClickUp URL shape', () => {
    expect(() => extractLinkId('https://app.clickup.com/90181234/home'))
      .toThrow(/did not match any known ClickUp pattern/)
  })
})

// ---------------------------------------------------------------------------
// General
// ---------------------------------------------------------------------------
describe('general', () => {
  it('throws with suggestion to use id: when value is not a URL', () => {
    const err = (() => { try { extractLinkId('just-an-id') } catch (e) { return e as Error } })()
    expect(err.message).toMatch(/requires a URL starting with http/)
    expect(err.message).toMatch(/id:just-an-id/)
  })

  it('throws on unrecognised domain', () => {
    expect(() => extractLinkId('https://unknown.example.com/some/path'))
      .toThrow(/Unrecognised domain/)
  })
})
