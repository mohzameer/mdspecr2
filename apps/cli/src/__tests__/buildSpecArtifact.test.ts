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
it('1.5.1 returns artifact with hash, mdspec_id, title, content', async () => {
  mockFile('# Auth Spec\nSome content.')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.path).toBe('docs/auth.md')
  expect(artifact!.hash).toMatch(/^sha256:[a-f0-9]{64}$/)
  expect(artifact!.mdspec_id).toBe('docs/auth.md')      // auto-ID from path
  expect(artifact!.title).toBe('Auth Spec')              // H1 extracted
  expect(artifact!.content).toContain('# Auth Spec')
})

// 1.5.2 — skip is now via .mdspecmap skip patterns, not frontmatter; file reads succeed
it('1.5.2 file with no H1 derives title from filename', async () => {
  mockFile('No heading here.')
  const artifact = await buildSpecArtifact('docs/my-spec.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.title).toBe('my spec')                // filename fallback
})

// 1.5.3 — explicit mdspec_id via specs: section
it('1.5.3 explicit specs: entry sets stable mdspec_id', async () => {
  mockFile('# Auth\nContent.')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: {
      auth_v2: { path: 'docs/auth.md' },
    },
  }
  const artifact = await buildSpecArtifact('docs/auth.md', config)
  expect(artifact!.mdspec_id).toBe('auth_v2')
})

// 1.5.4 — explicit title in specs: section overrides H1
it('1.5.4 explicit title in specs: overrides H1', async () => {
  mockFile('# Auth Spec\nContent.')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: {
      auth_v2: { path: 'docs/auth.md', title: 'Authentication v2 (internal)' },
    },
  }
  const artifact = await buildSpecArtifact('docs/auth.md', config)
  expect(artifact!.title).toBe('Authentication v2 (internal)')
})

// 1.5.5
it('1.5.5 renamed file sets previous_path in artifact', async () => {
  mockFile('# Auth\n')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig, 'docs/authentication.md')
  expect(artifact!.previous_path).toBe('docs/authentication.md')
})

// 1.5.6
it('1.5.6 returns null and logs error when file read fails', async () => {
  vi.mocked(fs.readFile).mockRejectedValue(new Error('ENOENT: no such file'))
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const artifact = await buildSpecArtifact('docs/missing.md', minimalConfig)
  expect(artifact).toBeNull()
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining('Failed to read'))
})

// 1.5.7 — task_ref resolved from links: section
it('1.5.7 task_ref resolved from links section via auto-ID', async () => {
  mockFile('# SLA Policy\n')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    links: { 'docs/sla.md': 'CU-305' },
  }
  const artifact = await buildSpecArtifact('docs/sla.md', config)
  expect(artifact!.task_ref).toBe('CU-305')
})

// 1.5.8 — task_ref resolved via explicit mdspec_id
it('1.5.8 task_ref resolved from links section via explicit mdspec_id', async () => {
  mockFile('# Checkout Retry\n')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: { checkout_retry: { path: 'docs/checkout-retry.md' } },
    links: { checkout_retry: 'CU-182' },
  }
  const artifact = await buildSpecArtifact('docs/checkout-retry.md', config)
  expect(artifact!.mdspec_id).toBe('checkout_retry')
  expect(artifact!.task_ref).toBe('CU-182')
})

// resolveSpecConfig unit tests
it('resolveSpecConfig: auto-ID uses file path', () => {
  const cfg = resolveSpecConfig('src/utils/SPEC7.md', minimalConfig)
  expect(cfg.id).toBe('src/utils/SPEC7.md')
  expect(cfg.title).toBe('SPEC7')
})

it('resolveSpecConfig: explicit entry uses declared id', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { my_spec: { path: 'docs/spec.md', title: 'My Spec' } },
  }
  const cfg = resolveSpecConfig('docs/spec.md', config)
  expect(cfg.id).toBe('my_spec')
  expect(cfg.title).toBe('My Spec')
})

it('resolveSpecConfig: links resolved by id', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { auth_v2: { path: 'docs/auth.md' } },
    links: { auth_v2: 'CU-291' },
  }
  const cfg = resolveSpecConfig('docs/auth.md', config)
  expect(cfg.task_ref).toBe('CU-291')
})
