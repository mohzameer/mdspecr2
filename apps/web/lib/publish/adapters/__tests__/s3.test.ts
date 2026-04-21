import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock @aws-sdk/client-s3
// ---------------------------------------------------------------------------
const mockSend = vi.fn()
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockSend })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ _input: input, type: 'PutObject' })),
  DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ _input: input, type: 'DeleteObject' })),
}))

import { buildS3Key, publishToS3, validateS3Credentials } from '../s3.js'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

const CREDS = {
  access_key_id: 'AKIAIOSFODNN7EXAMPLE',
  secret_access_key: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'acme-specs',
  region: 'us-east-1',
}

beforeEach(() => {
  mockSend.mockReset()
  vi.mocked(S3Client).mockClear()
  vi.mocked(PutObjectCommand).mockClear()
  vi.mocked(DeleteObjectCommand).mockClear()
})

// ---------------------------------------------------------------------------
// buildS3Key — flat mode (default, no options / maintainHierarchy omitted)
//
// Flat: only the filename is used — folder path is stripped.
// ---------------------------------------------------------------------------
describe('buildS3Key — flat mode (default)', () => {
  it('returns just the filename when no prefix', () => {
    expect(buildS3Key('docs/specs/auth.md', null)).toBe('auth.md')
  })

  it('prepends prefix with just the filename', () => {
    expect(buildS3Key('docs/specs/auth.md', 'eng-specs')).toBe('eng-specs/auth.md')
  })

  it('strips all intermediate folders — deeply nested spec lands flat', () => {
    expect(buildS3Key('docs/specs/payments/checkout/retry.md', 'archive'))
      .toBe('archive/retry.md')
  })

  it('normalises trailing slash on prefix', () => {
    expect(buildS3Key('docs/auth.md', 'my/prefix/')).toBe('my/prefix/auth.md')
  })

  it('strips leading slash from spec path before extracting filename', () => {
    expect(buildS3Key('/docs/auth.md', 'root')).toBe('root/auth.md')
  })

  it('handles empty string prefix as no prefix', () => {
    expect(buildS3Key('docs/auth.md', '')).toBe('auth.md')
  })

  it('explicit maintainHierarchy:false produces same flat result', () => {
    expect(buildS3Key('docs/specs/auth.md', 'eng-specs', { maintainHierarchy: false }))
      .toBe('eng-specs/auth.md')
  })

  it('maintainHierarchy:true without matchedFolder falls back to flat', () => {
    expect(buildS3Key('docs/specs/auth.md', 'eng-specs', { maintainHierarchy: true }))
      .toBe('eng-specs/auth.md')
  })

  it('spec with no folder component (root-level file) returns prefix/filename', () => {
    expect(buildS3Key('README.md', 'docs')).toBe('docs/README.md')
  })

  it('empty matchedFolder ("") is falsy — falls back to flat', () => {
    expect(buildS3Key('docs/specs/auth.md', 'eng', { maintainHierarchy: true, matchedFolder: '' }))
      .toBe('eng/auth.md')
  })
})

// ---------------------------------------------------------------------------
// buildS3Key — hierarchy mode (maintainHierarchy: true + matchedFolder)
//
// Hierarchy: path is relative to the matched folder (the .mdspecmap scope).
// ---------------------------------------------------------------------------
describe('buildS3Key — hierarchy mode', () => {
  it('strips matched folder prefix — direct child becomes bare filename', () => {
    expect(buildS3Key('docs/specs/auth.md', null, {
      maintainHierarchy: true, matchedFolder: 'docs/specs',
    })).toBe('auth.md')
  })

  it('strips matched folder prefix — preserves subfolder path', () => {
    expect(buildS3Key('docs/specs/payments/checkout.md', null, {
      maintainHierarchy: true, matchedFolder: 'docs/specs',
    })).toBe('payments/checkout.md')
  })

  it('prepends root prefix while preserving subfolder path', () => {
    expect(buildS3Key('docs/specs/payments/checkout.md', 'eng-specs', {
      maintainHierarchy: true, matchedFolder: 'docs/specs',
    })).toBe('eng-specs/payments/checkout.md')
  })

  it('deeply nested path is preserved relative to matched folder', () => {
    expect(buildS3Key('docs/specs/payments/checkout/retry.md', 'archive', {
      maintainHierarchy: true, matchedFolder: 'docs/specs',
    })).toBe('archive/payments/checkout/retry.md')
  })

  it('spec exactly at matched folder root becomes prefix/filename', () => {
    expect(buildS3Key('docs/specs/auth.md', 'eng', {
      maintainHierarchy: true, matchedFolder: 'docs/specs',
    })).toBe('eng/auth.md')
  })

  it('matchedFolder with trailing slash is normalised', () => {
    expect(buildS3Key('docs/specs/auth.md', 'eng-specs', {
      maintainHierarchy: true, matchedFolder: 'docs/specs/',
    })).toBe('eng-specs/auth.md')
  })

  it('no root prefix with hierarchy → bare relative path', () => {
    expect(buildS3Key('docs/specs/payments/checkout.md', null, {
      maintainHierarchy: true, matchedFolder: 'docs/specs',
    })).toBe('payments/checkout.md')
  })
})

// ---------------------------------------------------------------------------
// buildS3Key — distributed maps collision safety
// ---------------------------------------------------------------------------
describe('buildS3Key — distributed maps', () => {
  it('flat mode: different filenames under same prefix are collision-free', () => {
    const k1 = buildS3Key('docs/specs/auth.md', 'content')
    const k2 = buildS3Key('docs/rfc/microservices.md', 'content')
    expect(k1).toBe('content/auth.md')
    expect(k2).toBe('content/microservices.md')
    expect(k1).not.toBe(k2)
  })

  it('flat mode: same filename in different folders under same prefix COLLIDE (known limitation)', () => {
    const k1 = buildS3Key('docs/specs/README.md', 'content')
    const k2 = buildS3Key('docs/rfc/README.md', 'content')
    expect(k1).toBe('content/README.md')
    expect(k2).toBe('content/README.md')
    expect(k1).toBe(k2)  // collision — use hierarchy mode or different prefixes to avoid
  })

  it('hierarchy mode: different prefixes fully isolate namespaces', () => {
    const k1 = buildS3Key('docs/specs/auth.md', 'specs', { maintainHierarchy: true, matchedFolder: 'docs/specs' })
    const k2 = buildS3Key('docs/rfc/auth.md', 'rfcs', { maintainHierarchy: true, matchedFolder: 'docs/rfc' })
    expect(k1).toBe('specs/auth.md')
    expect(k2).toBe('rfcs/auth.md')
    expect(k1).not.toBe(k2)
  })

  it('hierarchy mode: all sibling spec paths under different prefixes produce unique keys', () => {
    const entries = [
      { path: 'docs/specs/auth.md',           folder: 'docs/specs', prefix: 'specs' },
      { path: 'docs/specs/payments/retry.md', folder: 'docs/specs', prefix: 'specs' },
      { path: 'docs/rfc/auth.md',             folder: 'docs/rfc',   prefix: 'rfcs' },
      { path: 'docs/rfc/payments/retry.md',   folder: 'docs/rfc',   prefix: 'rfcs' },
    ]
    const keys = entries.map(({ path, folder, prefix }) =>
      buildS3Key(path, prefix, { maintainHierarchy: true, matchedFolder: folder })
    )
    const unique = new Set(keys)
    expect(unique.size).toBe(keys.length)
  })
})

// ---------------------------------------------------------------------------
// publishToS3
// ---------------------------------------------------------------------------
describe('publishToS3', () => {
  const spec = {
    path: 'docs/specs/auth.md',
    content: '# Auth\n\nThis is the auth spec.',
    frontmatter: { title: 'Auth Spec' },
    resolvedTitle: 'Auth Spec',
  }

  it('calls PutObjectCommand with correct params', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.md')

    expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'acme-specs',
      Key: 'docs/specs/auth.md',
      ContentType: 'text/markdown',
    }))
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('passes raw markdown as body', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.md')

    const body = vi.mocked(PutObjectCommand).mock.calls[0][0].Body as string
    expect(body).toBe(spec.content)
  })

  it('returns the object key as page_id', async () => {
    mockSend.mockResolvedValue({})
    const result = await publishToS3(CREDS, spec, 'docs/specs/auth.md')
    expect(result.page_id).toBe('docs/specs/auth.md')
  })

  it('returns the correct S3 URL as page_url', async () => {
    mockSend.mockResolvedValue({})
    const result = await publishToS3(CREDS, spec, 'docs/specs/auth.md')
    expect(result.page_url).toBe(
      'https://acme-specs.s3.us-east-1.amazonaws.com/docs/specs/auth.md'
    )
  })

  it('constructs S3Client with correct region and credentials', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.md')

    expect(S3Client).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: {
        accessKeyId: CREDS.access_key_id,
        secretAccessKey: CREDS.secret_access_key,
      },
    })
  })

  it('propagates S3 errors', async () => {
    mockSend.mockRejectedValue(new Error('Network failure'))
    await expect(publishToS3(CREDS, spec, 'docs/specs/auth.md')).rejects.toThrow('Network failure')
  })
})

// ---------------------------------------------------------------------------
// validateS3Credentials
// ---------------------------------------------------------------------------
describe('validateS3Credentials', () => {
  it('returns ok:true when put and delete both succeed', async () => {
    mockSend.mockResolvedValue({})
    const result = await validateS3Credentials(CREDS)
    expect(result).toEqual({ ok: true })
  })

  it('calls PutObject then DeleteObject on the sentinel key', async () => {
    mockSend.mockResolvedValue({})
    await validateS3Credentials(CREDS)

    expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: '__mdspec_healthcheck__' }))
    expect(DeleteObjectCommand).toHaveBeenCalledWith(expect.objectContaining({ Key: '__mdspec_healthcheck__' }))
  })

  it('returns ok:false with access denied message on 403', async () => {
    mockSend.mockRejectedValue(new Error('AccessDenied: Access Denied'))
    const result = await validateS3Credentials(CREDS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/access denied/i)
  })

  it('returns ok:false with bucket not found message on NoSuchBucket', async () => {
    mockSend.mockRejectedValue(new Error('NoSuchBucket: The specified bucket does not exist'))
    const result = await validateS3Credentials(CREDS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/not found/i)
  })

  it('returns ok:false with invalid credentials message on bad key', async () => {
    mockSend.mockRejectedValue(new Error('InvalidAccessKeyId: The access key ID does not exist'))
    const result = await validateS3Credentials(CREDS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/invalid credentials/i)
  })

  it('returns ok:false with raw message for unknown errors', async () => {
    mockSend.mockRejectedValue(new Error('Something completely unexpected'))
    const result = await validateS3Credentials(CREDS)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toBe('Something completely unexpected')
  })
})
