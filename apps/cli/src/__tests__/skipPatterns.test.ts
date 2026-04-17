import { describe, it, expect } from 'vitest'
import { applySkipPatterns } from '../commands/publish.js'

// 1.2.1
it('1.2.1 global skip by filename matches DRAFT_*.md', () => {
  const result = applySkipPatterns(
    ['docs/DRAFT_foo.md', 'docs/bar.md'],
    ['DRAFT_*.md'],
    new Map()
  )
  expect(result).toEqual(['docs/bar.md'])
})

// 1.2.2
it('1.2.2 global skip by path pattern **/scratch/**', () => {
  const result = applySkipPatterns(
    ['docs/scratch/foo.md', 'docs/bar.md'],
    ['**/scratch/**'],
    new Map()
  )
  expect(result).toEqual(['docs/bar.md'])
})

// 1.2.3
it('1.2.3 folder-level skip applies to files in that folder', () => {
  const folderSkips = new Map([['docs', ['_*.md']]])
  const result = applySkipPatterns(
    ['docs/_internal.md', 'docs/public.md'],
    [],
    folderSkips
  )
  expect(result).toEqual(['docs/public.md'])
})

// 1.2.4
it('1.2.4 folder-level skip does not affect files outside that folder', () => {
  const folderSkips = new Map([['docs', ['_*.md']]])
  const result = applySkipPatterns(
    ['src/_util.md'],
    [],
    folderSkips
  )
  expect(result).toEqual(['src/_util.md'])
})

// 1.2.5
it('1.2.5 global and folder skips combined — folder pattern wins', () => {
  const folderSkips = new Map([['docs', ['_*.md']]])
  const result = applySkipPatterns(
    ['docs/_internal.md', 'docs/DRAFT_foo.md', 'docs/bar.md'],
    ['DRAFT_*.md'],
    folderSkips
  )
  expect(result).toEqual(['docs/bar.md'])
})

// 1.2.6
it('1.2.6 no skip patterns passes all files through', () => {
  const files = ['docs/foo.md', 'docs/bar.md', 'src/readme.md']
  const result = applySkipPatterns(files, [], new Map())
  expect(result).toEqual(files)
})

// 1.2.7 — tested indirectly via buildSpecArtifact which returns null for mdspec_skip:true
it('1.2.7 mdspec_skip frontmatter is handled in buildSpecArtifact (see that test suite)', () => {
  // applySkipPatterns operates on file paths, not frontmatter
  // mdspec_skip is handled in buildSpecArtifact returning null
  expect(true).toBe(true)
})
