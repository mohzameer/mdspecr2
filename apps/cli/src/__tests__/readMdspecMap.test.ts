import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readMdspecMap } from '../commands/publish.js'

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
  vi.mocked(fs.readFile).mockResolvedValue('version: 1\nmappings:\n  - folder: /\n' as never)

  const cfg = await readMdspecMap()
  expect(cfg.version).toBe(1)
  expect(cfg.mappings).toHaveLength(1)
  expect(cfg.mappings[0].folder).toBe('/')
})

// 1.1.2
it('1.1.2 parses valid full config with all fields', async () => {
  const yaml = [
    'version: 1',
    'sync_all_on_first_run: true',
    'mappings:',
    '  - folder: docs/specs',
    '    integration: notion',
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
  vi.mocked(fs.readFile).mockResolvedValue('version: 2\nmappings:\n  - folder: /\n' as never)

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
it('1.1.7 exits when folder missing in mapping', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - integration: notion\n' as never
  )

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('mappings[0].folder: required'))
})

// 1.1.8
it('1.1.8 exits on invalid integration type with suggestion', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - folder: /\n    integration: notiom\n' as never
  )

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining("did you mean 'notion'"))
})

// 1.1.9
it('1.1.9 exits on invalid target value', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    "version: 1\nmappings:\n  - folder: /\n    integration: notion\n    target: page\n" as never
  )

  await expect(readMdspecMap()).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(
    expect.stringContaining("must be 'document' or 'task'")
  )
})

// 1.1.10
it('1.1.10 allows skip-only mapping with no integration', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockResolvedValue(
    'version: 1\nmappings:\n  - folder: /\n    skip:\n      - README.md\n' as never
  )

  const cfg = await readMdspecMap()
  expect(cfg.mappings[0].integration).toBeUndefined()
  expect(cfg.mappings[0].skip).toEqual(['README.md'])
  expect(mockExit).not.toHaveBeenCalled()
})
