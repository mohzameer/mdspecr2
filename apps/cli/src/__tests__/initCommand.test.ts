/**
 * Section 1.8 — Init command
 */
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { initCommand } from '../commands/init.js'

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('child_process', () => ({ execSync: vi.fn() }))

import * as fs from 'fs/promises'

vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`exit:${code}`)
})
const mockErr = vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})

const PROJECT_CONFIG = { name: 'Payments Service', spec_dirs: ['docs/specs'] }
const ALIASES = [
  { name: 'eng-docs', integrations: { type: 'notion' } },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake')
  process.env.MDSPEC_API_URL = 'http://localhost:3000'
})
afterEach(() => {
  delete process.env.MDSPEC_TOKEN
  delete process.env.MDSPEC_API_URL
})

function mockFetch(configOk: boolean, configStatus: number, configBody: unknown, aliasesBody: unknown = ALIASES) {
  global.fetch = vi.fn()
    .mockResolvedValueOnce({
      ok: configOk,
      status: configStatus,
      json: () => Promise.resolve(configBody),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(aliasesBody),
    })
}

// 1.8.1
it('1.8.1 generates .mdspecmap with correct YAML when config + aliases present', async () => {
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
  vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT')) // file does not exist
  vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  mockFetch(true, 200, PROJECT_CONFIG)

  await expect(initCommand({ project: 'test-proj' })).rejects.toThrow('exit:0')

  const written = vi.mocked(fs.writeFile).mock.calls[0]
  const content = written[1] as string
  expect(content).toContain('version: 1')
  expect(content).toContain('sync_all_on_first_run')
  expect(content).toContain('docs/specs')
})

// 1.8.2
it('1.8.2 exits with error when .mdspecmap already exists', async () => {
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
  vi.mocked(fs.access).mockResolvedValue(undefined) // file exists

  await expect(initCommand({ project: 'test-proj' })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('.mdspecmap already exists'))
})

// 1.8.3
it('1.8.3 exits with error when MDSPEC_TOKEN is missing', async () => {
  delete process.env.MDSPEC_TOKEN

  await expect(initCommand({ project: 'test-proj' })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('MDSPEC_TOKEN'))
})

// 1.8.4
it('1.8.4 exits with Project not found on 404 response', async () => {
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
  vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))
  mockFetch(false, 404, { error: 'not_found' })

  await expect(initCommand({ project: 'bad-id' })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('Project not found'))
})

// 1.8.5
it('1.8.5 generates file with commented-out parent when no aliases', async () => {
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
  vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'))
  vi.mocked(fs.writeFile).mockResolvedValue(undefined)
  mockFetch(true, 200, PROJECT_CONFIG, []) // empty aliases

  await expect(initCommand({ project: 'test-proj' })).rejects.toThrow('exit:0')

  const content = vi.mocked(fs.writeFile).mock.calls[0][1] as string
  // When no aliases, no integration/parent fields are added
  expect(content).toContain('version: 1')
  expect(content).not.toContain('integration: notion')
})
