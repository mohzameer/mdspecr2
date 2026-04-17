import { it, expect, vi, beforeEach } from 'vitest'
import { buildSpecArtifact } from '../commands/publish.js'

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))
vi.mock('child_process', () => ({ execSync: vi.fn() }))

import * as fs from 'fs/promises'

vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => vi.clearAllMocks())

function mockFile(content: string) {
  vi.mocked(fs.readFile).mockResolvedValue(content as never)
}

// 1.5.1
it('1.5.1 returns artifact with hash, frontmatter, content', async () => {
  mockFile('---\ntitle: Auth Spec\n---\n# Auth\nSome content.')
  const artifact = await buildSpecArtifact('docs/auth.md')
  expect(artifact).not.toBeNull()
  expect(artifact!.path).toBe('docs/auth.md')
  expect(artifact!.hash).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(artifact!.frontmatter).toEqual({ title: 'Auth Spec' })
  expect(artifact!.content).toContain('# Auth')
})

// 1.5.2
it('1.5.2 returns null when mdspec_skip: true', async () => {
  mockFile('---\nmdspec_skip: true\n---\n# Secret')
  const artifact = await buildSpecArtifact('docs/secret.md')
  expect(artifact).toBeNull()
})

// 1.5.3
it('1.5.3 valid mdspec_id is preserved in frontmatter', async () => {
  mockFile('---\nmdspec_id: auth_v2\n---\n# Auth')
  const artifact = await buildSpecArtifact('docs/auth.md')
  expect(artifact!.frontmatter.mdspec_id).toBe('auth_v2')
})

// 1.5.4
it('1.5.4 invalid mdspec_id is deleted and warning logged', async () => {
  const mockWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  mockFile('---\nmdspec_id: "INVALID!"\n---\n# Auth')
  const artifact = await buildSpecArtifact('docs/auth.md')
  expect(artifact!.frontmatter.mdspec_id).toBeUndefined()
  expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining('invalid mdspec_id'))
})

// 1.5.5
it('1.5.5 renamed file sets previous_path in artifact', async () => {
  mockFile('---\ntitle: Auth\n---\n# Auth')
  const artifact = await buildSpecArtifact('docs/auth.md', 'docs/authentication.md')
  expect(artifact!.previous_path).toBe('docs/authentication.md')
})

// 1.5.6
it('1.5.6 returns null and logs error when file read fails', async () => {
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'))
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const artifact = await buildSpecArtifact('docs/missing.md')
  expect(artifact).toBeNull()
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Failed to read'))
})

// 1.5.7
it('1.5.7 file with no frontmatter returns empty frontmatter object', async () => {
  mockFile('# Plain markdown\nNo frontmatter here.')
  const artifact = await buildSpecArtifact('docs/plain.md')
  expect(artifact).not.toBeNull()
  expect(artifact!.frontmatter).toEqual({})
  expect(artifact!.content).toContain('# Plain markdown')
})
