import { it, expect, vi, beforeEach } from 'vitest'
import { detectChangedFiles } from '../commands/publish.js'

vi.mock('child_process', () => ({ execSync: vi.fn() }))
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  readdir: vi.fn(),
  writeFile: vi.fn(),
}))

import { execSync } from 'child_process'

vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

beforeEach(() => vi.clearAllMocks())

function mockDiff(lines: string) {
  vi.mocked(execSync).mockImplementation((cmd: string) => {
    if (String(cmd).startsWith('git diff')) return lines as never
    return '' as never
  })
}

// 1.3.1
it('1.3.1 modified file appears in changed set', () => {
  mockDiff('M\tdocs/auth.md')
  const result = detectChangedFiles('abc123', ['docs'])
  expect(result?.changed.has('docs/auth.md')).toBe(true)
})

// 1.3.2
it('1.3.2 added file appears in changed set', () => {
  mockDiff('A\tdocs/new.md')
  const result = detectChangedFiles('abc123', ['docs'])
  expect(result?.changed.has('docs/new.md')).toBe(true)
})

// 1.3.3
it('1.3.3 deleted file is not in changed set', () => {
  mockDiff('D\tdocs/old.md')
  const result = detectChangedFiles('abc123', ['docs'])
  expect(result?.changed.has('docs/old.md')).toBe(false)
  expect(result?.changed.size).toBe(0)
})

// 1.3.4
it('1.3.4 renamed file is in changed set and renames map', () => {
  mockDiff('R090\tdocs/old.md\tdocs/new.md')
  const result = detectChangedFiles('abc123', ['docs'])
  expect(result?.changed.has('docs/new.md')).toBe(true)
  expect(result?.renames.get('docs/new.md')).toBe('docs/old.md')
})

// 1.3.5
it('1.3.5 non-md file is ignored', () => {
  mockDiff('M\tsrc/app.ts')
  const result = detectChangedFiles('abc123', [''])
  expect(result?.changed.size).toBe(0)
})

// 1.3.6
it('1.3.6 file outside spec dirs is not in changed set', () => {
  mockDiff('M\tother/file.md')
  const result = detectChangedFiles('abc123', ['docs'])
  expect(result?.changed.has('other/file.md')).toBe(false)
})

// 1.3.7
it('1.3.7 root spec dir includes all md files', () => {
  mockDiff('M\tanywhere/deep/file.md')
  const result = detectChangedFiles('abc123', [''])
  expect(result?.changed.has('anywhere/deep/file.md')).toBe(true)
})

// 1.3.8
it('1.3.8 git diff fails with unknown revision returns null', () => {
  vi.mocked(execSync).mockImplementation(() => {
    throw new Error('unknown revision or path not in the working tree')
  })
  const result = detectChangedFiles('0000000', [''])
  expect(result).toBeNull()
})
