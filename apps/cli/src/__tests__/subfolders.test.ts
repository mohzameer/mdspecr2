import { describe, it, expect } from 'vitest'
import { applySubfolderFilter, resolveConfigPaths } from '../commands/publish.js'
import type { MdspecMapConfig } from '../commands/publish.js'

// ---------------------------------------------------------------------------
// applySubfolderFilter
// ---------------------------------------------------------------------------

describe('applySubfolderFilter', () => {
  it('no subfolder limits: passes all files through', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p' }],
    }
    const files = ['docs/a.md', 'docs/api/b.md']
    expect(applySubfolderFilter(files, config)).toEqual(files)
  })

  it('subfolders: ["api/**"] keeps root files and api/** but drops other subfolders', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p', subfolders: ['api/**'] }],
    }
    const files = [
      'docs/readme.md',           // root of mapping → kept
      'docs/api/auth.md',         // matches api/** → kept
      'docs/api/v2/tokens.md',    // matches api/** → kept
      'docs/internal/secret.md',  // not matched → dropped
    ]
    expect(applySubfolderFilter(files, config)).toEqual([
      'docs/readme.md',
      'docs/api/auth.md',
      'docs/api/v2/tokens.md',
    ])
  })

  it('multiple globs: all matches kept', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{
        folder: 'docs',
        integration: 'notion',
        parent: 'p',
        subfolders: ['api/**', 'guides/**'],
      }],
    }
    const files = [
      'docs/api/x.md',
      'docs/guides/y.md',
      'docs/internal/z.md',
    ]
    expect(applySubfolderFilter(files, config)).toEqual(['docs/api/x.md', 'docs/guides/y.md'])
  })

  it('empty mapping folder (root scope): subfolders match relative to repo root', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: '', integration: 'notion', parent: 'p', subfolders: ['docs/**'] }],
    }
    const files = ['readme.md', 'docs/a.md', 'src/b.md']
    // readme.md at root → kept; docs/a.md matches → kept; src/b.md not matched → dropped
    expect(applySubfolderFilter(files, config)).toEqual(['readme.md', 'docs/a.md'])
  })

  it('file covered by mapping with no subfolders restriction is kept', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [
        { folder: 'docs', integration: 'notion', parent: 'p', subfolders: ['api/**'] },
        { folder: '', integration: 'confluence', parent: 'q' },
      ],
    }
    const files = ['docs/internal/x.md']
    // first mapping would drop it, but root mapping covers it without restriction
    expect(applySubfolderFilter(files, config)).toEqual(['docs/internal/x.md'])
  })

  it('files outside any mapped folder are excluded when subfolder limits exist', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p', subfolders: ['api/**'] }],
    }
    const files = ['docs/api/x.md', 'src/foo.md']
    expect(applySubfolderFilter(files, config)).toEqual(['docs/api/x.md'])
  })
})

// ---------------------------------------------------------------------------
// resolveConfigPaths — sub_folders array propagation
// ---------------------------------------------------------------------------

describe('resolveConfigPaths sub_folders array', () => {
  it('propagates sub_folders array to each mapping as subfolders', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        sub_folders: ['api/**', 'guides/**'],
        mappings: [{ integration: 'notion', parent: 'p' }],
      },
      'docs'
    )
    expect(cfg.mappings[0].subfolders).toEqual(['api/**', 'guides/**'])
    expect(cfg.mappings[0].depth).toBeUndefined()
  })

  it('per-mapping subfolders takes precedence over top-level sub_folders', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        sub_folders: ['api/**'],
        mappings: [{ integration: 'notion', parent: 'p', subfolders: ['guides/**'] }],
      },
      'docs'
    )
    expect(cfg.mappings[0].subfolders).toEqual(['guides/**'])
  })

  it('strips top-level sub_folders from resolved config', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        sub_folders: ['api/**'],
        mappings: [{ integration: 'notion', parent: 'p' }],
      },
      'docs'
    )
    expect((cfg as unknown as Record<string, unknown>).sub_folders).toBeUndefined()
  })
})
