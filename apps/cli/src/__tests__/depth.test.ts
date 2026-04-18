import { it, expect, describe } from 'vitest'
import { isWithinDepth, applyDepthFilter } from '../commands/publish.js'
import type { MdspecMapConfig } from '../commands/publish.js'

// ---------------------------------------------------------------------------
// isWithinDepth
// ---------------------------------------------------------------------------

describe('isWithinDepth', () => {
  it('depth=1: direct child of folder passes', () => {
    expect(isWithinDepth('docs/auth.md', 'docs', 1)).toBe(true)
  })

  it('depth=1: nested file fails', () => {
    expect(isWithinDepth('docs/api/auth.md', 'docs', 1)).toBe(false)
  })

  it('depth=2: one level deep passes', () => {
    expect(isWithinDepth('docs/api/auth.md', 'docs', 2)).toBe(true)
  })

  it('depth=2: two levels deep fails', () => {
    expect(isWithinDepth('docs/api/v2/auth.md', 'docs', 2)).toBe(false)
  })

  it('root folder + depth=1: top-level file passes', () => {
    expect(isWithinDepth('readme.md', '', 1)).toBe(true)
  })

  it('root folder + depth=1: nested file fails', () => {
    expect(isWithinDepth('docs/auth.md', '', 1)).toBe(false)
  })

  it('root folder + depth=2: one level deep passes', () => {
    expect(isWithinDepth('docs/auth.md', '', 2)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// applyDepthFilter
// ---------------------------------------------------------------------------

describe('applyDepthFilter', () => {
  it('no depth limits: all files pass through unchanged', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p' }],
    }
    const files = ['docs/a.md', 'docs/api/b.md', 'docs/api/v2/c.md']
    expect(applyDepthFilter(files, config)).toEqual(files)
  })

  it('depth=1 on docs: removes nested files under docs', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p', depth: 1 }],
    }
    const files = ['docs/auth.md', 'docs/api/tokens.md', 'docs/api/v2/deep.md']
    expect(applyDepthFilter(files, config)).toEqual(['docs/auth.md'])
  })

  it('depth=2 on docs: keeps one level of nesting, removes two levels', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p', depth: 2 }],
    }
    const files = ['docs/auth.md', 'docs/api/tokens.md', 'docs/api/v2/deep.md']
    expect(applyDepthFilter(files, config)).toEqual(['docs/auth.md', 'docs/api/tokens.md'])
  })

  it('file covered by a mapping without depth limit is always kept', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [
        { folder: 'docs', integration: 'notion', parent: 'p', depth: 1 },
        { folder: '/', integration: 'confluence', parent: 'q' }, // no depth limit
      ],
    }
    // docs/api/deep.md exceeds depth=1 for docs mapping but root mapping has no limit
    const files = ['docs/auth.md', 'docs/api/deep.md']
    expect(applyDepthFilter(files, config)).toEqual(['docs/auth.md', 'docs/api/deep.md'])
  })

  it('files outside mapped folders are excluded by depth filter', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p', depth: 1 }],
    }
    // src/foo.md is not under docs at all — no mapping covers it
    const files = ['docs/auth.md', 'src/foo.md']
    expect(applyDepthFilter(files, config)).toEqual(['docs/auth.md'])
  })
})
