import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveFirstRunMode } from '../commands/publish.js'

vi.mock('child_process', () => ({ execSync: vi.fn() }))
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))

vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// ---------------------------------------------------------------------------
// Section 1.4 — First run handling (via resolveFirstRunMode)
// ---------------------------------------------------------------------------

// 1.4.1
it('1.4.1 first run with sync_all=true returns publish_all', () => {
  expect(resolveFirstRunMode(true, '0000000000000000000000000000000000000000')).toBe('publish_all')
})

// 1.4.2
it('1.4.2 first run with sync_all=false returns exit', () => {
  expect(resolveFirstRunMode(false, '0000000000000000000000000000000000000000')).toBe('exit')
})

// 1.4.3
it('1.4.3 first run with undefined before returns exit', () => {
  expect(resolveFirstRunMode(false, undefined)).toBe('exit')
})

// 1.4.4
it('1.4.4 normal run with valid SHA returns detect_changes', () => {
  expect(resolveFirstRunMode(false, 'abc123def456')).toBe('detect_changes')
})

// ---------------------------------------------------------------------------
// Section 1.6 — Payload construction (via publishCommand with mocked deps)
// ---------------------------------------------------------------------------

import * as fs from 'fs/promises'
import { execSync } from 'child_process'
import { publishCommand } from '../commands/publish.js'

const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`exit:${code}`)
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake')
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

const validMapYaml = 'version: 1\nmappings:\n  - folder: /\n    integration: notion\n    parent: eng-docs\n'
const specContent = '# Auth\nSome content.'

function setupPublishMocks(fetchResponse: unknown) {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockImplementation((path: unknown) => {
    if (String(path).endsWith('.mdspecmap')) return Promise.resolve(validMapYaml as never)
    return Promise.resolve(specContent as never)
  })
  vi.mocked(fs.readdir).mockResolvedValue([
    { name: 'auth.md', isDirectory: () => false, isFile: () => true } as never,
  ] as never)
  vi.mocked(execSync as unknown as (cmd: string) => string).mockImplementation((cmd) => {
    if (cmd.startsWith('git diff')) return 'M\tauth.md'
    if (cmd.includes('log -1 --format=%ct')) return '1700000000'
    return ''
  })
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    json: () => Promise.resolve(fetchResponse),
  })
}

// 1.6.1
it('1.6.1 payload includes config matching parsed .mdspecmap', async () => {
  setupPublishMocks({ accepted: true, saved: 1, queued: 1 })

  await expect(publishCommand({ project: 'test-proj', skipDiff: true })).rejects.toThrow('exit:0')

  const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
  expect(body.config.version).toBe(1)
  expect(body.config.mappings[0].integration).toBe('notion')
})

// 1.6.2
it('1.6.2 payload includes a valid unix commit_timestamp', async () => {
  setupPublishMocks({ accepted: true, saved: 1, queued: 1 })

  await expect(publishCommand({ project: 'test-proj', skipDiff: true })).rejects.toThrow('exit:0')

  const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
  expect(body.commit_timestamp).toBeGreaterThan(1_000_000_000)
})

// 1.6.3
it('1.6.3 renamed spec has previous_path in payload', async () => {
  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockImplementation((path: unknown) => {
    if (String(path).endsWith('.mdspecmap')) return Promise.resolve(validMapYaml as never)
    return Promise.resolve(specContent as never)
  })
  vi.mocked(fs.readdir).mockResolvedValue([
    { name: 'new.md', isDirectory: () => false, isFile: () => true } as never,
  ] as never)
  vi.mocked(execSync as unknown as (cmd: string) => string).mockImplementation((cmd) => {
    if (cmd.startsWith('git diff')) return 'R090\told.md\tnew.md'
    if (cmd.includes('log -1 --format=%ct')) return '1700000000'
    return ''
  })
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 202,
    json: () => Promise.resolve({ accepted: true, saved: 1, queued: 1 }),
  })
  process.env.GITHUB_EVENT_BEFORE = 'prevsha123'

  await expect(publishCommand({ project: 'test-proj' })).rejects.toThrow('exit:0')

  const body = JSON.parse((vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
  const renamedSpec = body.specs.find((s: { path: string }) => s.path === 'new.md')
  expect(renamedSpec?.previous_path).toBe('old.md')
})
