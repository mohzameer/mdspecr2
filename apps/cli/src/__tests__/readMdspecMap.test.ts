import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readMdspecMap, readMdspecMapAt, resolveConfigPaths, mergeConfigs } from '../commands/publish.js'

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('child_process', () => ({ execSync: vi.fn() }))

import * as fs from 'fs/promises'

const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`exit:${code}`)
})
const mockErr = vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake')
})

// 1.1.1
it('1.1.1 parses valid minimal config', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue('version: 1\nmappings:\n  - integration: notion\n' as never)

  const cfg = await readMdspecMap()
  expect(cfg.version).toBe(1)
  expect(cfg.mappings).toHaveLength(1)
  expect(cfg.mappings[0].folder).toBeUndefined()
})

// 1.1.2
it('1.1.2 parses valid full config with all fields', async () => {
  const yaml = [
    'version: 1',
    'sync_all_on_first_run: true',
    'mappings:',
    '  - integration: notion',
    '    parent: eng-docs',
    '    target: document',
    '    skip:',
    '      - DRAFT_*.md',
  ].join('\n')
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(yaml as never)

  const cfg = await readMdspecMap()
  expect(cfg.sync_all_on_first_run).toBe(true)
  expect(cfg.mappings[0].integration).toBe('notion')
  expect(cfg.mappings[0].parent).toBe('eng-docs')
  expect(cfg.mappings[0].skip).toEqual(['DRAFT_*.md'])
})

// 1.1.3
it('1.1.3 exits when .mdspecmap not found', async () => {
  vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('.mdspecmap not found'))
})

// 1.1.4
it('1.1.4 exits on invalid YAML', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue('version: 1\nmappings: {broken' as never)

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('not valid YAML'))
})

// 1.1.5
it('1.1.5 exits on wrong version', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue('version: 2\nmappings:\n  - integration: notion\n' as never)

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('version: must be 1'))
})

// 1.1.6
it('1.1.6 exits when mappings missing', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue('version: 1\n' as never)

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('mappings: must be an array'))
})

// 1.1.7
it('1.1.7 accepts mapping without folder (implicit scope root)', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    parent: eng-docs\n' as never
  )

  const cfg = await readMdspecMap()
  expect(cfg.mappings[0].folder).toBeUndefined()
  expect(cfg.mappings[0].integration).toBe('notion')
  expect(mockExit).not.toHaveBeenCalled()
})

// 1.1.8
it('1.1.8 exits on invalid integration type with suggestion', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notiom\n' as never
  )

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining("did you mean 'notion'"))
})

// 1.1.9
it('1.1.9 exits on invalid target value', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    "version: 1\nmappings:\n  - integration: notion\n    target: page\n" as never
  )

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(
    expect.stringContaining("must be 'document' or 'task'")
  )
})

// depth validation
it('depth: valid positive integer is accepted', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    depth: 2\n' as never
  )
  const cfg = await readMdspecMap()
  expect(cfg.mappings[0].depth).toBe(2)
  expect(mockExit).not.toHaveBeenCalled()
})

it('depth: zero is invalid', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    depth: 0\n' as never
  )
  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('depth: must be a positive integer'))
})

it('depth: negative value is invalid', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    depth: -1\n' as never
  )
  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('depth: must be a positive integer'))
})

it('folder: key in mapping causes validation error', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - folder: src\n    integration: notion\n' as never
  )
  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('mappings[0].folder: not supported'))
})

// 1.1.10
it('1.1.10 allows skip-only mapping with no integration', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - skip:\n      - README.md\n' as never
  )

  const cfg = await readMdspecMap()
  expect(cfg.mappings[0].integration).toBeUndefined()
  expect(cfg.mappings[0].skip).toEqual(['README.md'])
  expect(mockExit).not.toHaveBeenCalled()
})

it('default: valid block is parsed', async () => {
  const yaml = [
    'version: 1',
    'default:',
    '  integration: clickup',
    '  parent: eng-docs',
    'mappings:',
    '  - {}',
    '  - target: task',
  ].join('\n')
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(yaml as never)

  const cfg = await readMdspecMap()
  expect(cfg.default?.integration).toBe('clickup')
  expect(cfg.default?.parent).toBe('eng-docs')
  expect(cfg.mappings[0].integration).toBeUndefined()
  expect(mockExit).not.toHaveBeenCalled()
})

it('default: invalid integration type errors', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\ndefault:\n  integration: slack\nmappings:\n  - {}\n' as never
  )
  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('default.integration'))
})

it('link: prefix with valid URL passes validation', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    parent: link:https://www.notion.so/ws/Docs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4\n' as never
  )
  const cfg = await readMdspecMap()
  expect(cfg.mappings[0].parent).toBe('link:https://www.notion.so/ws/Docs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4')
  expect(mockExit).not.toHaveBeenCalled()
})

it('link: prefix with empty value errors', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  // quote the value so YAML parses it as string "link:" rather than a nested mapping
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    parent: "link:"\n' as never
  )
  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('link: prefix requires a URL'))
})

it('link: prefix with non-URL value errors', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n    parent: link:just-an-id\n' as never
  )
  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('link: prefix value must be a URL starting with http'))
})

// parseParent unit tests
import { parseParent } from '../commands/publish.js'

it('parseParent: alias: prefix', () => {
  expect(parseParent('alias:eng-docs')).toEqual({ type: 'alias', value: 'eng-docs' })
})

it('parseParent: id: prefix', () => {
  expect(parseParent('id:90181844797')).toEqual({ type: 'id', value: '90181844797' })
})

it('parseParent: bare value', () => {
  expect(parseParent('eng-docs')).toEqual({ type: 'bare', value: 'eng-docs' })
})

it('parseParent: bare numeric ID', () => {
  expect(parseParent('90181844797')).toEqual({ type: 'bare', value: '90181844797' })
})

it('parseParent: link: prefix with Notion URL', () => {
  const url = 'https://www.notion.so/ws/Eng-Docs-a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
  expect(parseParent(`link:${url}`)).toEqual({ type: 'link', value: url })
})

it('parseParent: link: prefix with Confluence URL', () => {
  const url = 'https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Title'
  expect(parseParent(`link:${url}`)).toEqual({ type: 'link', value: url })
})

it('parseParent: link: prefix with ClickUp URL', () => {
  const url = 'https://app.clickup.com/90181234/v/s/90181844797'
  expect(parseParent(`link:${url}`)).toEqual({ type: 'link', value: url })
})

// ---------------------------------------------------------------------------
// readMdspecMapAt
// ---------------------------------------------------------------------------

describe('readMdspecMapAt', () => {
  it('reads and validates config at arbitrary path', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'version: 1\nmappings:\n  - integration: notion\n    parent: api-docs\n' as never
    )
    const cfg = await readMdspecMapAt('/repo/docs/api/.mdspecmap')
    expect(cfg.version).toBe(1)
    expect(cfg.mappings[0].folder).toBeUndefined()
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('exits on YAML error with file path in message', async () => {
    vi.mocked(fs.readFile).mockResolvedValue('version: 1\nmappings: {broken' as never)
    await expect(readMdspecMapAt('/repo/docs/.mdspecmap')).rejects.toThrow('exit:1')
    expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('not valid YAML'))
  })

  it('accepts sub_folders: false without error', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'version: 1\nsub_folders: false\nmappings:\n  - integration: notion\n    parent: docs\n' as never
    )
    const cfg = await readMdspecMapAt('/repo/docs/.mdspecmap')
    expect(cfg.sub_folders).toBe(false)
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('accepts sub_folders as a list of glob strings', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'version: 1\nsub_folders:\n  - api/**\n  - guides/**\nmappings:\n  - integration: notion\n    parent: docs\n' as never
    )
    const cfg = await readMdspecMapAt('/repo/docs/.mdspecmap')
    expect(cfg.sub_folders).toEqual(['api/**', 'guides/**'])
    expect(mockExit).not.toHaveBeenCalled()
  })

  it('rejects sub_folders with non-string entries', async () => {
    vi.mocked(fs.readFile).mockResolvedValue(
      'version: 1\nsub_folders:\n  - 42\nmappings:\n  - integration: notion\n    parent: docs\n' as never
    )
    await expect(readMdspecMapAt('/repo/docs/.mdspecmap')).rejects.toThrow('exit:1')
    expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('sub_folders'))
  })
})

// ---------------------------------------------------------------------------
// resolveConfigPaths
// ---------------------------------------------------------------------------

describe('resolveConfigPaths', () => {
  it('sets folder to scopeDir on every mapping', () => {
    const cfg = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion', parent: 'docs' }] },
      'docs/api'
    )
    expect(cfg.mappings[0].folder).toBe('docs/api')
  })

  it('root scopeDir yields empty string folder', () => {
    const cfg = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion', parent: 'p' }] },
      ''
    )
    expect(cfg.mappings[0].folder).toBe('')
  })

  it('multiple mappings all get the same scopeDir as folder', () => {
    const cfg = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion' }, { integration: 'confluence' }] },
      'docs/api'
    )
    expect(cfg.mappings[0].folder).toBe('docs/api')
    expect(cfg.mappings[1].folder).toBe('docs/api')
  })

  it('sub_folders: false sets depth: 1 on mappings without depth', () => {
    const cfg = resolveConfigPaths(
      { version: 1, sub_folders: false, mappings: [{ integration: 'notion', parent: 'p' }] },
      'docs'
    )
    expect(cfg.mappings[0].depth).toBe(1)
  })

  it('sub_folders: false does not override existing depth', () => {
    const cfg = resolveConfigPaths(
      { version: 1, sub_folders: false, mappings: [{ integration: 'notion', parent: 'p', depth: 2 }] },
      'docs'
    )
    expect(cfg.mappings[0].depth).toBe(2)
  })

  it('sub_folders: true (default) does not add depth', () => {
    const cfg = resolveConfigPaths(
      { version: 1, mappings: [{ integration: 'notion', parent: 'p' }] },
      'docs'
    )
    expect(cfg.mappings[0].depth).toBeUndefined()
  })

  it('strips sub_folders from resolved config', () => {
    const cfg = resolveConfigPaths(
      { version: 1, sub_folders: false, mappings: [{ integration: 'notion', parent: 'p' }] },
      'docs'
    )
    expect((cfg as unknown as Record<string, unknown>).sub_folders).toBeUndefined()
  })

  it('rekeys specs entries to repo-relative paths', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'clickup' }],
        specs: { 'INFO7.md': { id: '86exam62a', title: 'History' } },
      },
      'src/hooks'
    )
    expect(cfg.specs?.['src/hooks/INFO7.md']).toEqual({ id: '86exam62a', title: 'History' })
    expect(cfg.specs?.['INFO7.md']).toBeUndefined()
  })

  it('specs keys at root scopeDir are unchanged', () => {
    const cfg = resolveConfigPaths(
      {
        version: 1,
        mappings: [{ integration: 'notion' }],
        specs: { 'README.md': { title: 'Home' } },
      },
      ''
    )
    expect(cfg.specs?.['README.md']).toEqual({ title: 'Home' })
  })
})

// ---------------------------------------------------------------------------
// Payload round-trip — YAML → readMdspecMapAt → resolveConfigPaths → mergeConfigs
//
// Asserts that mapping fields documented in api-reference scenarios survive
// every stage of CLI processing and land on the merged config that the CLI
// posts to /api/publish.
// ---------------------------------------------------------------------------

describe('payload round-trip', () => {
  async function roundTrip(yaml: string, scopeDir: string) {
    vi.mocked(fs.readFile).mockResolvedValue(yaml as never)
    const parsed = await readMdspecMapAt(`/repo/${scopeDir || ''}/.mdspecmap`)
    const resolved = resolveConfigPaths(parsed, scopeDir)
    return mergeConfigs([resolved])
  }

  it('S3 with maintain_hierarchy: true survives parse → resolve → merge', async () => {
    const yaml = [
      'version: 1',
      'mappings:',
      '  - integration: s3',
      '    parent: alias:handbook-site',
      '    maintain_hierarchy: true',
      '',
    ].join('\n')

    const merged = await roundTrip(yaml, 'handbook')

    expect(merged.mappings).toHaveLength(1)
    const m = merged.mappings[0]
    expect(m.integration).toBe('s3')
    expect(m.parent).toBe('alias:handbook-site')
    expect(m.maintain_hierarchy).toBe(true)
    expect(m.folder).toBe('handbook')
  })

  it('S3 flat-mode mapping (default maintain_hierarchy) survives round-trip', async () => {
    const yaml = [
      'version: 1',
      'mappings:',
      '  - integration: s3',
      '    parent: alias:docs-archive',
      '    skip:',
      '      - DRAFT_*.md',
      '',
    ].join('\n')

    const merged = await roundTrip(yaml, 'docs')

    expect(merged.mappings).toHaveLength(1)
    const m = merged.mappings[0]
    expect(m.integration).toBe('s3')
    expect(m.parent).toBe('alias:docs-archive')
    expect(m.maintain_hierarchy).toBeUndefined()  // default flat — no field set
    expect(m.skip).toEqual(['DRAFT_*.md'])
    expect(m.folder).toBe('docs')
  })

  it('ClickUp task-mode mapping (target/list_id/space_id/custom_task_ids/agent) survives round-trip', async () => {
    const yaml = [
      'version: 1',
      'sub_folders: false',
      'mappings:',
      '  - integration: clickup',
      '    target: task',
      '    list_id: id:901812098656',
      '    space_id: id:90185234',
      '    custom_task_ids: true',
      '    agent: Sprint Task Template',
      '',
    ].join('\n')

    const merged = await roundTrip(yaml, 'eng/sprints')

    expect(merged.mappings).toHaveLength(1)
    const m = merged.mappings[0]
    expect(m.integration).toBe('clickup')
    expect(m.target).toBe('task')
    expect(m.list_id).toBe('id:901812098656')
    expect(m.space_id).toBe('id:90185234')
    expect(m.custom_task_ids).toBe(true)
    expect(m.agent).toBe('Sprint Task Template')
    expect(m.folder).toBe('eng/sprints')
    // sub_folders: false should have been lowered to depth: 1 on the mapping
    expect(m.depth).toBe(1)
    // top-level sub_folders is dropped from the merged config
    expect((merged as unknown as Record<string, unknown>).sub_folders).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// mergeConfigs
// ---------------------------------------------------------------------------

describe('mergeConfigs', () => {
  it('merges mappings from all configs', () => {
    const a = { version: 1 as const, mappings: [{ folder: 'docs/api', integration: 'notion', parent: 'a' }] }
    const b = { version: 1 as const, mappings: [{ folder: 'docs/tasks', integration: 'clickup', parent: 'b' }] }
    const merged = mergeConfigs([a, b])
    expect(merged.mappings).toHaveLength(2)
    expect(merged.mappings[0].integration).toBe('notion')
    expect(merged.mappings[1].integration).toBe('clickup')
  })

  it('sync_all_on_first_run is true if any config has it true', () => {
    const a = { version: 1 as const, mappings: [] }
    const b = { version: 1 as const, sync_all_on_first_run: true, mappings: [] }
    expect(mergeConfigs([a, b]).sync_all_on_first_run).toBe(true)
  })

  it('sync_all_on_first_run is absent when none set it', () => {
    const a = { version: 1 as const, mappings: [] }
    const b = { version: 1 as const, mappings: [] }
    expect(mergeConfigs([a, b]).sync_all_on_first_run).toBeUndefined()
  })

  it('merges specs sections', () => {
    const a = { version: 1 as const, mappings: [], specs: { 'docs/a.md': { title: 'A' } } }
    const b = { version: 1 as const, mappings: [], specs: { 'docs/b.md': { title: 'B' } } }
    const merged = mergeConfigs([a, b])
    expect(merged.specs?.['docs/a.md']?.title).toBe('A')
    expect(merged.specs?.['docs/b.md']?.title).toBe('B')
  })

  it('later config wins on duplicate spec key', () => {
    const a = { version: 1 as const, mappings: [], specs: { 'docs/a.md': { title: 'Old' } } }
    const b = { version: 1 as const, mappings: [], specs: { 'docs/a.md': { title: 'New' } } }
    expect(mergeConfigs([a, b]).specs?.['docs/a.md']?.title).toBe('New')
  })
})
