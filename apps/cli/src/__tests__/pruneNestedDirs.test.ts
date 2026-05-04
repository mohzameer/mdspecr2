import { describe, it, expect } from 'vitest'
import { pruneNestedDirs } from '../commands/publish.js'

describe('pruneNestedDirs', () => {
  it('returns root only when root is present', () => {
    expect(pruneNestedDirs(['', 'src', 'docs'])).toEqual([''])
  })

  it('passes through non-overlapping dirs', () => {
    expect(pruneNestedDirs(['docs', 'src']).sort()).toEqual(['docs', 'src'])
  })

  it('drops nested dir when ancestor is present', () => {
    expect(pruneNestedDirs(['src', 'src/hooks', 'src/utils'])).toEqual(['src'])
  })

  it('keeps siblings under same parent when parent is absent', () => {
    expect(pruneNestedDirs(['src/hooks', 'src/utils']).sort()).toEqual([
      'src/hooks',
      'src/utils',
    ])
  })

  it('does not treat partial-name prefixes as ancestors', () => {
    // "src" should not be considered an ancestor of "src-extras"
    expect(pruneNestedDirs(['src', 'src-extras']).sort()).toEqual([
      'src',
      'src-extras',
    ])
  })

  it('dedupes exact duplicates', () => {
    expect(pruneNestedDirs(['src', 'src'])).toEqual(['src'])
  })
})
