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
  expect(artifact!.title_source).toBe('derived')
  expect(artifact!.content).toContain('# Auth Spec')
})

// 1.5.2
it('1.5.2 file with no H1 derives title from filename', async () => {
  mockFile('No heading here.')
  const artifact = await buildSpecArtifact('docs/my-spec.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.title).toBe('my spec')
  expect(artifact!.title_source).toBe('derived')
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
  expect(artifact!.title_source).toBe('mapping')
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
it('1.5.6 unified id resolved from specs[path].id', async () => {
  mockFile('# SLA Policy\n')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: {
      'docs/sla.md': { id: 'CU-305' },
    },
  }
  const artifact = await buildSpecArtifact('docs/sla.md', config)
  expect(artifact!.id).toBe('CU-305')
  expect(artifact!.id_source).toBe('mapping')
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
  expect(artifact!.agent_source).toBe('mapping')
})

// 1.5.8
it('1.5.8 spec with no specs: entry has no id or agent', async () => {
  mockFile('# Plain\n')
  const artifact = await buildSpecArtifact('docs/plain.md', minimalConfig)
  expect(artifact!.id).toBeUndefined()
  expect(artifact!.agent).toBeUndefined()
})

// resolveSpecConfig unit tests
it('resolveSpecConfig: no entry — title from filename', () => {
  const cfg = resolveSpecConfig('src/utils/SPEC7.md', minimalConfig)
  expect(cfg.title).toBe('SPEC7')
  expect(cfg.title_source).toBe('derived')
  expect(cfg.id).toBeUndefined()
})

it('resolveSpecConfig: specs[path] entry — title overrides', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { 'docs/spec.md': { title: 'My Spec' } },
  }
  const cfg = resolveSpecConfig('docs/spec.md', config)
  expect(cfg.title).toBe('My Spec')
  expect(cfg.title_source).toBe('mapping')
})

it('resolveSpecConfig: specs[path].id resolved as id with mapping source', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { 'docs/auth.md': { id: 'CU-291' } },
  }
  const cfg = resolveSpecConfig('docs/auth.md', config)
  expect(cfg.id).toBe('CU-291')
  expect(cfg.id_source).toBe('mapping')
})

it('resolveSpecConfig: unmatched path has no entry', () => {
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [],
    specs: { 'docs/other.md': { id: 'CU-100' } },
  }
  const cfg = resolveSpecConfig('docs/auth.md', config)
  expect(cfg.id).toBeUndefined()
  expect(cfg.title).toBe('auth')
})

// ---------------------------------------------------------------------------
// Frontmatter parsing — unified allowlist {id, title, agent}
// ---------------------------------------------------------------------------

// FM.1 — frontmatter id is unified, no per-integration keys
it('FM.1 frontmatter id sets artifact.id with frontmatter source', async () => {
  mockFile('---\nid: "abc123"\n---\n# Body\ncontent')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.id).toBe('abc123')
  expect(artifact!.id_source).toBe('frontmatter')
})

// FM.2 — frontmatter is stripped from artifact.content
it('FM.2 strips frontmatter from artifact.content (adapters never see ---)', async () => {
  mockFile('---\nid: "abc"\n---\n# Body\nLine two')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact!.content).not.toContain('---')
  expect(artifact!.content).not.toContain('id:')
  expect(artifact!.content).toContain('# Body')
  expect(artifact!.content).toContain('Line two')
})

// FM.3 — hash from stripped content (frontmatter changes do not invalidate hash)
it('FM.3 hash is computed from stripped content', async () => {
  mockFile('# Body\nLine two')
  const a1 = await buildSpecArtifact('docs/auth.md', minimalConfig)

  mockFile('---\nid: "abc"\n---\n# Body\nLine two')
  const a2 = await buildSpecArtifact('docs/auth.md', minimalConfig)

  expect(a1!.hash).toBe(a2!.hash)
})

// FM.4 — frontmatter title wins over specs[path].title and H1
it('FM.4 frontmatter.title wins over specs[].title and H1', async () => {
  mockFile('---\ntitle: From Frontmatter\n---\n# H1 Title')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: { 'docs/auth.md': { title: 'From Map' } },
  }
  const artifact = await buildSpecArtifact('docs/auth.md', config)
  expect(artifact!.title).toBe('From Frontmatter')
  expect(artifact!.title_source).toBe('frontmatter')
})

// FM.5 — frontmatter id wins over specs[path].id
it('FM.5 frontmatter.id wins over specs[].id', async () => {
  mockFile('---\nid: from-fm\n---\n# Body')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: { 'docs/auth.md': { id: 'from-map' } },
  }
  const artifact = await buildSpecArtifact('docs/auth.md', config)
  expect(artifact!.id).toBe('from-fm')
  expect(artifact!.id_source).toBe('frontmatter')
})

// FM.6 — frontmatter agent wins over specs[path].agent
it('FM.6 frontmatter.agent wins over specs[].agent', async () => {
  mockFile('---\nagent: from-fm-template\n---\n# Body')
  const config: MdspecMapConfig = {
    version: 1,
    mappings: [{ folder: 'docs' }],
    specs: { 'docs/auth.md': { agent: 'from-map-template' } },
  }
  const artifact = await buildSpecArtifact('docs/auth.md', config)
  expect(artifact!.agent).toBe('from-fm-template')
  expect(artifact!.agent_source).toBe('frontmatter')
})

// FM.7 — per-integration frontmatter keys are hard errors
it('FM.7 rejects per-integration frontmatter keys (clickup_id, jira_issue_key, ...)', async () => {
  mockFile('---\nclickup_id: "task-1"\n---\n# Body')
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact).toBeNull()
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining("unknown frontmatter key 'clickup_id'"))
})

// FM.8 — legacy mdspec_agent / mdspec_no_agent are rejected
it('FM.8 rejects legacy mdspec_agent frontmatter key', async () => {
  mockFile('---\nmdspec_agent: my-template\n---\n# Body')
  const mockError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact).toBeNull()
  expect(mockError).toHaveBeenCalledWith(expect.stringContaining("unknown frontmatter key 'mdspec_agent'"))
})

// FM.9 — empty frontmatter block is fine
it('FM.9 empty frontmatter block produces a valid artifact', async () => {
  mockFile('---\n---\n# Body')
  const artifact = await buildSpecArtifact('docs/auth.md', minimalConfig)
  expect(artifact).not.toBeNull()
  expect(artifact!.id).toBeUndefined()
})
