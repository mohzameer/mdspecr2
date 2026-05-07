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

  it('most-specific subfolder mapping is authoritative: root mapping cannot override a folder restriction', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [
        { folder: 'docs', integration: 'notion', parent: 'p', subfolders: ['api/**'] },
        { folder: '', integration: 'confluence', parent: 'q' },
      ],
    }
    const files = ['docs/internal/x.md', 'docs/api/y.md', 'root.md']
    // docs/internal/x.md: docs mapping rejects it (not in api/**) — most-specific wins, excluded
    // docs/api/y.md: docs mapping allows it
    // root.md: only covered by root mapping (no restriction) — kept
    expect(applySubfolderFilter(files, config)).toEqual(['docs/api/y.md', 'root.md'])
  })

  it('root mapping without restriction does not bypass a subfolder glob in a scoped folder', () => {
    // Regression: s3-selective/.mdspecmap has sub_folders: ['included/**'] but
    // excluded/ files were still syncing because the root ClickUp mapping (no restriction)
    // short-circuited the filter before the scoped mapping could reject them.
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [
        { folder: 's3-selective', integration: 's3', subfolders: ['included/**'] },
        { folder: '', integration: 'clickup', parent: 'q' },
      ],
    }
    const files = [
      's3-selective/ROOT_FILE.md',            // root of scoped folder → kept
      's3-selective/included/INCLUDED.md',    // matches included/** → kept
      's3-selective/excluded/EXCLUDED.md',    // does not match → dropped
      'clickup-root-only/SHALLOW.md',         // only covered by root mapping → kept
    ]
    expect(applySubfolderFilter(files, config)).toEqual([
      's3-selective/ROOT_FILE.md',
      's3-selective/included/INCLUDED.md',
      'clickup-root-only/SHALLOW.md',
    ])
  })

  it('files outside any mapped folder are excluded when subfolder limits exist', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{ folder: 'docs', integration: 'notion', parent: 'p', subfolders: ['api/**'] }],
    }
    const files = ['docs/api/x.md', 'src/foo.md']
    expect(applySubfolderFilter(files, config)).toEqual(['docs/api/x.md'])
  })

  it('pure negation: ["!internal/**"] excludes internal, keeps everything else', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{
        folder: 'docs',
        integration: 'notion',
        parent: 'p',
        subfolders: ['!internal/**'],
      }],
    }
    const files = [
      'docs/api/auth.md',         // not internal → kept
      'docs/guides/setup.md',     // not internal → kept
      'docs/internal/secret.md',  // matches !internal/** → dropped
    ]
    expect(applySubfolderFilter(files, config)).toEqual([
      'docs/api/auth.md',
      'docs/guides/setup.md',
    ])
  })

  it('mixed include + exclude: ["api/**", "!api/private/**"] keeps api but not api/private', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{
        folder: 'docs',
        integration: 'notion',
        parent: 'p',
        subfolders: ['api/**', '!api/private/**'],
      }],
    }
    const files = [
      'docs/api/public.md',       // api/** ∧ ¬api/private/** → kept
      'docs/api/v2/tokens.md',    // api/** ∧ ¬api/private/** → kept
      'docs/api/private/key.md',  // matches negation → dropped
      'docs/guides/x.md',         // doesn't match api/** → dropped
    ]
    expect(applySubfolderFilter(files, config)).toEqual([
      'docs/api/public.md',
      'docs/api/v2/tokens.md',
    ])
  })

  it('mixed include-all + exclude: ["**", "!internal/**"] keeps all subfolders except internal', () => {
    const config: MdspecMapConfig = {
      version: 1,
      mappings: [{
        folder: 'docs',
        integration: 'notion',
        parent: 'p',
        subfolders: ['**', '!internal/**'],
      }],
    }
    const files = [
      'docs/api/x.md',
      'docs/guides/y.md',
      'docs/internal/secret.md',
    ]
    expect(applySubfolderFilter(files, config)).toEqual([
      'docs/api/x.md',
      'docs/guides/y.md',
    ])
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
