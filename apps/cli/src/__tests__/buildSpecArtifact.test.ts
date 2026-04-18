import { it, expect, vi, beforeEach } from 'vitest'
import { buildSpecArtifact, resolveSpecConfig } from '../commands/publish.js'
import type { MdspecMapConfig } from '../commands/publish.js'

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

const minimalConfig: MdspecMapConfig = {
  version: 1,
  mappings: [{ folder: 'docs' }],
}

function mockFile(content: string) {
  vi.mocked(fs.readFile).mockResolvedValue(content as never)
}

// 1.5.1
it('1.5.1 returns artifact with hash, title, content — H1 extracted', async () => {
  mockFile('# Auth Spec\nSome content.')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.path).toBe('docs/auth.md')
  expect(artifact!.hash).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(artifact!.title).toBe('Auth Spec')
  expect(artifact!.content).toContain('# Auth Spec')
})

// 1.5.2
it('1.5.2 file with no H1 derives title from filename', async () => {
  mockFile('No heading here.')
  const artifact = await buildSpecArtifact('docs/my-spec.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.title).toBe('my spec')
})

// 1.5.3
it('1.5.3 specs[path].title overrides H1', async () => {
  mockFile('# Auth Spec\nContent.')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: {
      'docs/auth.md': { title: 'Authentication v2 (internal)' },
    },
  }
  const artifact = await buildSpecArtifact('docs/auth.md', config)
  expect(artifact!.title).toBe('Authentication v2 (internal)')
})

// 1.5.4
it('1.5.4 renamed file sets previous_path in artifact', async () => {
  mockFile('# Auth\n')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig, 'docs/authentication.md')
  expect(artifact!.previous_path).toBe('docs/authentication.md')
})

// 1.5.5
it('1.5.5 returns null and logs error when file read fails', async () => {
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'))
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const artifact = await buildSpecArtifact('docs/missing.md', minimalConfig)
  expect(artifact).toBeNull()
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Failed to read'))
})

// 1.5.6
it('1.5.6 id_ref resolved from specs[path].task', async () => {
  mockFile('# SLA Policy\n')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: {
      'docs/sla.md': { id: 'CU-305' },
    },
  }
  const artifact = await buildSpecArtifact('docs/sla.md', config)
  expect(artifact!.id_ref).toBe('CU-305')
})

// 1.5.7
it('1.5.7 agent resolved from specs[path].agent', async () => {
  mockFile('# Checkout\n')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: {
      'docs/checkout.md': { agent: 'task_template' },
    },
  }
  const artifact = await buildSpecArtifact('docs/checkout.md', config)
  expect(artifact!.agent).toBe('task_template')
})

// 1.5.8
it('1.5.8 spec with no specs: entry has no id_ref or agent', async () => {
  mockFile('# Plain\n')
  const artifact = await buildSpecArtifact('docs/plain.md', minimalConfig)
  expect(artifact!.id_ref).toBeUndefined()
  expect(artifact!.agent).toBeUndefined()
})

// resolveSpecConfig unit tests
it('resolveSpecConfig: no entry — title from filename', () => {
  const cfg = resolveSpecConfig('src/utils/SPEC7.md', minimalConfig)
  expect(cfg.title).toBe('SPEC7')
  expect(cfg.id_ref).toBeUndefined()
})

it('resolveSpecConfig: specs[path] entry — title overrides', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { 'docs/spec.md': { title: 'My Spec' } },
  }
  const cfg = resolveSpecConfig('docs/spec.md', config)
  expect(cfg.title).toBe('My Spec')
})

it('resolveSpecConfig: specs[path].task resolved as id_ref', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { 'docs/auth.md': { id: 'CU-291' } },
  }
  const cfg = resolveSpecConfig('docs/auth.md', config)
  expect(cfg.id_ref).toBe('CU-291')
})

it('resolveSpecConfig: unmatched path has no entry', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { 'docs/other.md': { id: 'CU-100' } },
  }
  const cfg = resolveSpecConfig('docs/auth.md', config)
  expect(cfg.id_ref).toBeUndefined()
  expect(cfg.title).toBe('auth')
})
