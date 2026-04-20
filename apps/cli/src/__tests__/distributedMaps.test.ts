/**
 * Distributed .mdspecmap — integration tests
 *
 * Covers the full pipeline that was missing and allowed the id_ref bug to
 * ship: discoverMdspecMapFiles → readMdspecMapAt → resolveConfigPaths →
 * mergeConfigs → buildSpecArtifact / publishCommand payload.
 *
 * Each describe block corresponds to one layer of the pipeline, with the
 * final block doing end-to-end payload assertions across multiple nested maps.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  discoverMdspecMapFiles,
  readMdspecMapAt,
  resolveConfigPaths,
  mergeConfigs,
  buildSpecArtifact,
  publishCommand,
} from '../commands/publish.js'

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('child_process', () => ({ execSync: vi.fn() }))

import * as fs from 'fs/promises'
import { execSync } from 'child_process'

vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dir(name: string, children?: ReturnType<typeof file>[]) {
  return { name, isDirectory: () => true, isFile: () => false, _children: children }
}
function file(name: string) {
  return { name, isDirectory: () => false, isFile: () => true }
}

/**
 * Sets up fs.readdir so it returns different entries depending on the path.
 * `tree` maps absolute directory paths → their direct entries.
 */
function mockReaddir(tree: Record<string, ReturnType<typeof file | typeof dir>[]>) {
  vi.mocked(fs.readdir).mockImplementation((p: unknown) => {
    const entries = tree[String(p)]
    if (!entries) return Promise.resolve([] as never)
    return Promise.resolve(entries as never)
  })
}

/**
 * Sets up fs.readFile so .mdspecmap files return the given YAML and .md files
 * return the given content (defaults to '# Spec\n').
 */
function mockReadFile(mapYamls: Record<string, string>, specContent = '# Spec\n') {
  vi.mocked(fs.readFile).mockImplementation((p: unknown) => {
    const path = String(p)
    if (path.endsWith('.mdspecmap')) {
      const yaml = Object.entries(mapYamls).find(([k]) => path.endsWith(k))?.[1]
      return Promise.resolve((yaml ?? 'version: 1\nmappings: []\n') as never)
    }
    return Promise.resolve(specContent as never)
  })
}

// ---------------------------------------------------------------------------
// 1. discoverMdspecMapFiles
// ---------------------------------------------------------------------------

describe('discoverMdspecMapFiles', () => {
  it('returns single entry for root-level .mdspecmap', async () => {
    mockReaddir({ '/repo': [file('.mdspecmap'), file('README.md')] })
    const refs = await discoverMdspecMapFiles('/repo')
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({ filePath: '/repo/.mdspecmap', scopeDir: '' })
  })

  it('returns correct scopeDir for nested .mdspecmap', async () => {
    mockReaddir({
      '/repo': [dir('src'), file('README.md')],
      '/repo/src': [dir('hooks')],
      '/repo/src/hooks': [file('.mdspecmap'), file('INFO7.md')],
    })
    const refs = await discoverMdspecMapFiles('/repo')
    expect(refs).toHaveLength(1)
    expect(refs[0]).toEqual({ filePath: '/repo/src/hooks/.mdspecmap', scopeDir: 'src/hooks' })
  })

  it('discovers multiple .mdspecmap files at different depths', async () => {
    mockReaddir({
      '/repo': [file('.mdspecmap'), dir('docs'), dir('src')],
      '/repo/docs': [file('.mdspecmap'), file('api.md')],
      '/repo/src': [dir('hooks')],
      '/repo/src/hooks': [file('.mdspecmap'), file('INFO7.md')],
    })
    const refs = await discoverMdspecMapFiles('/repo')
    const scopeDirs = refs.map((r) => r.scopeDir).sort()
    expect(scopeDirs).toEqual(['', 'docs', 'src/hooks'])
  })

  it('skips node_modules directories', async () => {
    mockReaddir({
      '/repo': [dir('node_modules'), dir('src')],
      '/repo/node_modules': [file('.mdspecmap')],
      '/repo/src': [file('.mdspecmap')],
    })
    const refs = await discoverMdspecMapFiles('/repo')
    expect(refs).toHaveLength(1)
    expect(refs[0].scopeDir).toBe('src')
  })

  it('skips hidden directories (dot-prefixed)', async () => {
    mockReaddir({
      '/repo': [dir('.git'), dir('docs')],
      '/repo/.git': [file('.mdspecmap')],
      '/repo/docs': [file('.mdspecmap')],
    })
    const refs = await discoverMdspecMapFiles('/repo')
    expect(refs).toHaveLength(1)
    expect(refs[0].scopeDir).toBe('docs')
  })

  it('handles 3-level nesting with correct scopeDir', async () => {
    mockReaddir({
      '/repo': [dir('a')],
      '/repo/a': [dir('b')],
      '/repo/a/b': [dir('c')],
      '/repo/a/b/c': [file('.mdspecmap'), file('deep.md')],
    })
    const refs = await discoverMdspecMapFiles('/repo')
    expect(refs[0]).toEqual({ filePath: '/repo/a/b/c/.mdspecmap', scopeDir: 'a/b/c' })
  })

  it('returns empty array when no .mdspecmap files exist', async () => {
    mockReaddir({
      '/repo': [file('README.md'), dir('docs')],
      '/repo/docs': [file('guide.md')],
    })
    const refs = await discoverMdspecMapFiles('/repo')
    expect(refs).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 2. resolveConfigPaths — specs key normalization across nesting levels
// ---------------------------------------------------------------------------

describe('resolveConfigPaths — specs key normalization', () => {
  it('prefixes filename-only key with scopeDir', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'clickup' }],
        specs: { 'INFO7.md': { id: '86exam62a', title: 'History' } },
      },
      'src/hooks'
    )
    expect(cfg.specs!['src/hooks/INFO7.md']).toEqual({ id: '86exam62a', title: 'History' })
    expect(cfg.specs!['INFO7.md']).toBeUndefined()
  })

  it('correctly combines scope + sub-path key', () => {
    // .mdspecmap lives at src/ but references hooks/INFO7.md within it
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'clickup' }],
        specs: { 'hooks/INFO7.md': { id: '86exam62a' } },
      },
      'src'
    )
    expect(cfg.specs!['src/hooks/INFO7.md']).toEqual({ id: '86exam62a' })
    expect(cfg.specs!['hooks/INFO7.md']).toBeUndefined()
  })

  it('root scopeDir leaves keys unchanged', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'notion' }],
        specs: { 'README.md': { title: 'Home' }, 'docs/guide.md': { id: 'task-1' } },
      },
      ''
    )
    expect(cfg.specs!['README.md']).toEqual({ title: 'Home' })
    expect(cfg.specs!['docs/guide.md']).toEqual({ id: 'task-1' })
  })

  it('3-level deep scopeDir is prefixed correctly', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'notion' }],
        specs: { 'deep.md': { id: 'deep-task' } },
      },
      'a/b/c'
    )
    expect(cfg.specs!['a/b/c/deep.md']).toEqual({ id: 'deep-task' })
  })

  it('multiple specs entries all get prefixed', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'notion' }],
        specs: {
          'alpha.md': { id: 'task-a' },
          'beta.md': { id: 'task-b' },
          'sub/gamma.md': { id: 'task-c' },
        },
      },
      'docs'
    )
    expect(cfg.specs!['docs/alpha.md']).toEqual({ id: 'task-a' })
    expect(cfg.specs!['docs/beta.md']).toEqual({ id: 'task-b' })
    expect(cfg.specs!['docs/sub/gamma.md']).toEqual({ id: 'task-c' })
  })

  it('config without specs section produces no specs key', () => {
    const cfg = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion' }] },
      'docs'
    )
    expect(cfg.specs).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 3. mergeConfigs — specs from multiple resolved configs
// ---------------------------------------------------------------------------

describe('mergeConfigs — multi-map specs merging', () => {
  it('merges specs from root map and nested map without collision', () => {
    const root = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'notion' }],
        specs: { 'README.md': { title: 'Home' } },
      },
      ''
    )
    const nested = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'clickup' }],
        specs: { 'INFO7.md': { id: '86exam62a' } },
      },
      'src/hooks'
    )
    const merged = mergeConfigs([root, nested])
    expect(merged.specs!['README.md']).toEqual({ title: 'Home' })
    expect(merged.specs!['src/hooks/INFO7.md']).toEqual({ id: '86exam62a' })
    expect(Object.keys(merged.specs!)).toHaveLength(2)
  })

  it('merges specs from three maps at different depths', () => {
    const configs = [
      resolveConfigPaths(
        { version: 1, mappings: [{ integration: 'notion' }], specs: { 'root.md': { id: 'r1' } } },
        ''
      ),
      resolveConfigPaths(
        { version: 1, mappings: [{ integration: 'notion' }], specs: { 'api.md': { id: 'd1' } } },
        'docs'
      ),
      resolveConfigPaths(
        { version: 1, mappings: [{ integration: 'clickup' }], specs: { 'task.md': { id: 'h1' } } },
        'src/hooks'
      ),
    ]
    const merged = mergeConfigs(configs)
    expect(merged.specs!['root.md']).toEqual({ id: 'r1' })
    expect(merged.specs!['docs/api.md']).toEqual({ id: 'd1' })
    expect(merged.specs!['src/hooks/task.md']).toEqual({ id: 'h1' })
  })

  it('later config wins when two maps have a conflicting spec key', () => {
    const a = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion' }], specs: { 'shared.md': { id: 'old' } } },
      ''
    )
    const b = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion' }], specs: { 'shared.md': { id: 'new' } } },
      ''
    )
    const merged = mergeConfigs([a, b])
    expect(merged.specs!['shared.md']).toEqual({ id: 'new' })
  })

  it('merged specs keys are all repo-relative — no bare filenames from nested scopes', () => {
    const nested = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'clickup' }],
        specs: {
          'INFO7.md': { id: '86exam62a' },
          'INFO8.md': { id: '86exam63b' },
        },
      },
      'src/hooks'
    )
    const merged = mergeConfigs([nested])
    const keys = Object.keys(merged.specs ?? {})
    // No bare filename — all must start with the scope path
    expect(keys.every((k) => k.startsWith('src/hooks/'))).toBe(true)
    expect(keys).toContain('src/hooks/INFO7.md')
    expect(keys).toContain('src/hooks/INFO8.md')
  })
})

// ---------------------------------------------------------------------------
// 4. buildSpecArtifact — id_ref after full pipeline
// ---------------------------------------------------------------------------

describe('buildSpecArtifact with distributed map config', () => {
  it('resolves id_ref for spec governed by nested .mdspecmap', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# History\n' as never)

    // Simulate the post-pipeline merged config (scopeDir already applied)
    const mergedConfig = mergeConfigs([
      resolveConfigPaths(
        {
          version: 1,
          mappings: [{ integration: 'clickup' }],
          specs: { 'INFO7.md': { id: '86exam62a', title: 'History' } },
        },
        'src/hooks'
      ),
    ])

    const artifact = await buildSpecArtifact('src/hooks/INFO7.md', mergedConfig)
    expect(artifact).not.toBeNull()
    expect(artifact!.id_ref).toBe('86exam62a')
    expect(artifact!.title).toBe('History')
  })

  it('resolves id_ref for spec governed by root .mdspecmap', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# Home\n' as never)

    const mergedConfig = mergeConfigs([
      resolveConfigPaths(
        {
          version: 1,
          mappings: [{ integration: 'notion' }],
          specs: { 'README.md': { id: 'root-task-1' } },
        },
        ''
      ),
    ])

    const artifact = await buildSpecArtifact('README.md', mergedConfig)
    expect(artifact!.id_ref).toBe('root-task-1')
  })

  it('resolves id_ref for deep nested spec (3 levels)', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# Deep\n' as never)

    const mergedConfig = mergeConfigs([
      resolveConfigPaths(
        {
          version: 1,
          mappings: [{ integration: 'notion' }],
          specs: { 'deep.md': { id: 'deep-task-xyz' } },
        },
        'a/b/c'
      ),
    ])

    const artifact = await buildSpecArtifact('a/b/c/deep.md', mergedConfig)
    expect(artifact!.id_ref).toBe('deep-task-xyz')
  })

  it('does NOT set id_ref for spec that has no entry in any map', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# Unlisted\n' as never)

    const mergedConfig = mergeConfigs([
      resolveConfigPaths(
        {
          version: 1,
          mappings: [{ integration: 'notion' }],
          specs: { 'other.md': { id: 'task-99' } },
        },
        'src'
      ),
    ])

    const artifact = await buildSpecArtifact('src/unlisted.md', mergedConfig)
    expect(artifact!.id_ref).toBeUndefined()
  })

  it('correctly resolves id_ref from sub-path key within a scope', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('# Sub\n' as never)

    // .mdspecmap at src/ references hooks/INFO7.md (path relative to src/)
    const mergedConfig = mergeConfigs([
      resolveConfigPaths(
        {
          version: 1,
          mappings: [{ integration: 'clickup' }],
          specs: { 'hooks/INFO7.md': { id: '86exam62a' } },
        },
        'src'
      ),
    ])

    const artifact = await buildSpecArtifact('src/hooks/INFO7.md', mergedConfig)
    expect(artifact!.id_ref).toBe('86exam62a')
  })
})

// ---------------------------------------------------------------------------
// 5. publishCommand payload — end-to-end with multiple nested maps
// ---------------------------------------------------------------------------

vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`exit:${code}`)
})

beforeEach(() => {
  vi.spyOn(process, 'cwd').mockReturnValue('/repo')
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
  process.env.GITHUB_SHA = 'abc123'
  process.env.GITHUB_REF_NAME = 'main'
  process.env.GITHUB_REPOSITORY = 'owner/repo'
  process.env.GITHUB_EVENT_BEFORE = 'abc000'
})

afterEach(() => {
  delete process.env.MDSPEC_TOKEN
  delete process.env.GITHUB_SHA
  delete process.env.GITHUB_REF_NAME
  delete process.env.GITHUB_REPOSITORY
  delete process.env.GITHUB_EVENT_BEFORE
})

const rootMapYaml = `version: 1
mappings:
  - integration: notion
    parent: eng-docs
specs:
  README.md:
    id: root-task-1
`

const hooksMapYaml = `version: 1
mappings:
  - integration: clickup
    target: task
    list_id: id:901817533430
specs:
  INFO7.md:
    id: 86exam62a
    title: History
`

function setupMultiMapMocks(fetchResponse: unknown) {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockImplementation((p: unknown) => {
    const path = String(p)
    if (path === '/repo/.mdspecmap') return Promise.resolve(rootMapYaml as never)
    if (path === '/repo/src/hooks/.mdspecmap') return Promise.resolve(hooksMapYaml as never)
    return Promise.resolve('# Content\n' as never)
  })
  mockReaddir({
    '/repo': [file('.mdspecmap'), file('README.md'), dir('src')],
    '/repo/src': [dir('hooks')],
    '/repo/src/hooks': [file('.mdspecmap'), file('INFO7.md')],
  })
  vi.mocked(execSync as unknown as (cmd: string) => string).mockImplementation((cmd) => {
    if (cmd.startsWith('git diff')) return 'M\tREADME.md\nM\tsrc/hooks/INFO7.md'
    if (cmd.includes('log -1 --format=%ct')) return '1700000000'
    return ''
  })
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    json: () => Promise.resolve(fetchResponse),
  })
}

describe('publishCommand payload — distributed maps', () => {
  it('payload contains id_ref for spec governed by nested .mdspecmap', async () => {
    setupMultiMapMocks({ accepted: true, saved: 2, queued: 2 })

    await expect(publishCommand({ project: 'proj', skipDiff: true })).rejects.toThrow('exit:0')

    const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    const hooksSpec = body.specs.find((s: { path: string }) => s.path === 'src/hooks/INFO7.md')
    expect(hooksSpec).toBeDefined()
    expect(hooksSpec.id_ref).toBe('86exam62a')
    expect(hooksSpec.title).toBe('History')
  })

  it('payload contains id_ref for spec governed by root .mdspecmap', async () => {
    setupMultiMapMocks({ accepted: true, saved: 2, queued: 2 })

    await expect(publishCommand({ project: 'proj', skipDiff: true })).rejects.toThrow('exit:0')

    const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    const rootSpec = body.specs.find((s: { path: string }) => s.path === 'README.md')
    expect(rootSpec).toBeDefined()
    expect(rootSpec.id_ref).toBe('root-task-1')
  })

  it('payload config.mappings contain folder from each .mdspecmap scopeDir', async () => {
    setupMultiMapMocks({ accepted: true, saved: 2, queued: 2 })

    await expect(publishCommand({ project: 'proj', skipDiff: true })).rejects.toThrow('exit:0')

    const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    const folders = body.config.mappings.map((m: { folder: string }) => m.folder)
    expect(folders).toContain('')           // root .mdspecmap
    expect(folders).toContain('src/hooks')  // nested .mdspecmap
  })

  it('spec without a specs: entry has no id_ref in payload', async () => {
    // Setup with only one map and no specs: section
    vi.mocked(fs.readFile).mockImplementation((p: unknown) => {
      const path = String(p)
      if (path.endsWith('.mdspecmap'))
        return Promise.resolve('version: 1\nmappings:\n  - integration: notion\n    parent: docs\n' as never)
      return Promise.resolve('# Plain\n' as never)
    })
    mockReaddir({
      '/repo': [file('.mdspecmap'), file('plain.md')],
    })
    vi.mocked(execSync as unknown as (cmd: string) => string).mockImplementation((cmd) => {
      if (cmd.startsWith('git diff')) return 'M\tplain.md'
      if (cmd.includes('log -1 --format=%ct')) return '1700000000'
      return ''
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ accepted: true, saved: 1, queued: 1 }),
    })

    await expect(publishCommand({ project: 'proj', skipDiff: true })).rejects.toThrow('exit:0')

    const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    const spec = body.specs.find((s: { path: string }) => s.path === 'plain.md')
    expect(spec).toBeDefined()
    expect(spec.id_ref).toBeUndefined()
  })
})
