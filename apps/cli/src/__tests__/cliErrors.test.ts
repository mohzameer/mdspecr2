/**
 * Section 1.7 — CLI error handling
 * Tests publishCommand responses to various server error codes.
 */
import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { publishCommand } from '../commands/publish.js'

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('child_process', () => ({ execSync: vi.fn() }))

import * as fs from 'fs/promises'
import { execSync } from 'child_process'

vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`exit:${code}`)
})
const mockErr = vi.spyOn(console, 'error').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})

const validMapYaml = 'version: 1\nmappings:\n  - integration: notion\n    parent: eng\n'

function setupMocks(fetchResponse: { status: number; body: unknown; ok?: boolean }) {
  vi.clearAllMocks()
  vi.spyOn(process, 'cwd').mockReturnValue('/fake')
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
  process.env.GITHUB_SHA = 'abc123'
  process.env.GITHUB_REF_NAME = 'main'
  process.env.GITHUB_REPOSITORY = 'owner/repo'

  vi.mocked(fs.access).mockResolvedValue(undefined)
  vi.mocked(fs.readFile).mockImplementation((path: unknown) => {
    if (String(path).endsWith('.mdspecmap')) return Promise.resolve(validMapYaml as never)
    return Promise.resolve('# Spec content' as never)
  })
  vi.mocked(fs.readdir).mockResolvedValue([
    { name: '.mdspecmap', isDirectory: () => false, isFile: () => true } as never,
    { name: 'spec.md', isDirectory: () => false, isFile: () => true } as never,
  ] as never)
  vi.mocked(execSync as unknown as (cmd: string) => string).mockImplementation((cmd) => {
    if (cmd.includes('log -1 --format=%ct')) return '1700000000'
    return ''
  })

  const ok = fetchResponse.ok ?? (fetchResponse.status >= 200 && fetchResponse.status < 300)
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status: fetchResponse.status,
    json: () => Promise.resolve(fetchResponse.body),
    text: () => Promise.resolve(JSON.stringify(fetchResponse.body)),
  })
}

beforeEach(() => {
  process.env.MDSPEC_TOKEN = 'mds_abcd1234_aabbccddeeff00112233445566778899'
})
afterEach(() => {
  delete process.env.MDSPEC_TOKEN
  delete process.env.GITHUB_SHA
  delete process.env.GITHUB_REF_NAME
  delete process.env.GITHUB_REPOSITORY
})

// 1.7.1
it('1.7.1 401 response logs authentication failed', async () => {
  setupMocks({ status: 401, body: { error: 'invalid_token' }, ok: false })

  await expect(publishCommand({ project: 'p', skipDiff: true })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('Authentication failed'))
})

// 1.7.2
it('1.7.2 402 response logs spec limit reached and upgrade URL', async () => {
  setupMocks({
    status: 402,
    body: { error: 'spec_limit_reached', upgrade_url: 'https://mdspec.dev/upgrade' },
    ok: false,
  })

  await expect(publishCommand({ project: 'p', skipDiff: true })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('Spec limit reached'))
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('https://mdspec.dev/upgrade'))
})

// 1.7.3
it('1.7.3 403 response logs repo mismatch', async () => {
  setupMocks({
    status: 403,
    body: { error: 'repo_mismatch', registered: 'owner/other', received: 'owner/repo' },
    ok: false,
  })

  await expect(publishCommand({ project: 'p', skipDiff: true })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('repo mismatch'))
})

// 1.7.4
it('1.7.4 422 unresolved aliases lists each alias with suggestion', async () => {
  setupMocks({
    status: 422,
    body: {
      error: 'unresolved_aliases',
      aliases: [{ alias: 'eng', folder: 'docs', suggestion: 'eng-docs' }],
    },
    ok: false,
  })

  await expect(publishCommand({ project: 'p', skipDiff: true })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining("'eng'"))
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining("did you mean 'eng-docs'"))
})

// 1.7.5
it('1.7.5 network error logs Network error', async () => {
  setupMocks({ status: 0, body: null })
  global.fetch = vi.fn().mockRejectedValue(new Error('fetch failed'))

  await expect(publishCommand({ project: 'p', skipDiff: true })).rejects.toThrow('exit:1')
  expect(mockErr).toHaveBeenCalledWith(expect.stringContaining('Network error'))
})
