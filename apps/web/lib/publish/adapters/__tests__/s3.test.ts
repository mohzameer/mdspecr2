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
// buildS3Key
// ---------------------------------------------------------------------------
describe('buildS3Key', () => {
  it('returns bare path when no prefix, md format', () => {
    expect(buildS3Key('docs/specs/auth.md', null, 'md')).toBe('docs/specs/auth.md')
  })

  it('prepends prefix with single slash', () => {
    expect(buildS3Key('docs/specs/auth.md', 'specs/', 'md')).toBe('specs/docs/specs/auth.md')
  })

  it('normalises trailing slash on prefix', () => {
    expect(buildS3Key('docs/auth.md', 'my/prefix/', 'md')).toBe('my/prefix/docs/auth.md')
  })

  it('strips leading slash from spec path', () => {
    expect(buildS3Key('/docs/auth.md', 'root', 'md')).toBe('root/docs/auth.md')
  })

  it('replaces .md extension with .html for html format', () => {
    expect(buildS3Key('docs/specs/auth.md', null, 'html')).toBe('docs/specs/auth.html')
  })

  it('replaces .md extension with .html and prepends prefix', () => {
    expect(buildS3Key('docs/specs/auth.md', 'site', 'html')).toBe('site/docs/specs/auth.html')
  })

  it('handles empty string prefix as no prefix', () => {
    expect(buildS3Key('docs/auth.md', '', 'md')).toBe('docs/auth.md')
  })

  it('preserves nested path structure', () => {
    expect(buildS3Key('docs/specs/payments/checkout-retry.md', 'content', 'md'))
      .toBe('content/docs/specs/payments/checkout-retry.md')
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

  it('calls PutObjectCommand with correct md params', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.md', 'md')

    expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'acme-specs',
      Key: 'docs/specs/auth.md',
      ContentType: 'text/markdown',
    }))
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('calls PutObjectCommand with text/html content type for html format', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.html', 'html')

    expect(PutObjectCommand).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'acme-specs',
      Key: 'docs/specs/auth.html',
      ContentType: 'text/html',
    }))
  })

  it('wraps html output in DOCTYPE shell containing the title', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.html', 'html')

    const body = vi.mocked(PutObjectCommand).mock.calls[0][0].Body as string
    expect(body).toContain('<!DOCTYPE html>')
    expect(body).toContain('<title>Auth Spec</title>')
    expect(body).toContain('Auth Spec')
  })

  it('passes raw markdown as body for md format', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.md', 'md')

    const body = vi.mocked(PutObjectCommand).mock.calls[0][0].Body as string
    expect(body).toBe(spec.content)
  })

  it('returns the object key as page_id', async () => {
    mockSend.mockResolvedValue({})
    const result = await publishToS3(CREDS, spec, 'docs/specs/auth.md', 'md')
    expect(result.page_id).toBe('docs/specs/auth.md')
  })

  it('returns the correct S3 URL as page_url', async () => {
    mockSend.mockResolvedValue({})
    const result = await publishToS3(CREDS, spec, 'docs/specs/auth.md', 'md')
    expect(result.page_url).toBe(
      'https://acme-specs.s3.us-east-1.amazonaws.com/docs/specs/auth.md'
    )
  })

  it('constructs S3Client with correct region and credentials', async () => {
    mockSend.mockResolvedValue({})
    await publishToS3(CREDS, spec, 'docs/specs/auth.md', 'md')

    expect(S3Client).toHaveBeenCalledWith({
      region: 'us-east-1',
      credentials: {
        accessKeyId: CREDS.access_key_id,
        secretAccessKey: CREDS.secret_access_key,
      },
    })
  })

  it('uses filename as title fallback when no resolvedTitle or frontmatter title', async () => {
    mockSend.mockResolvedValue({})
    const noTitle = { path: 'docs/my-spec.md', content: 'content', frontmatter: {} }
    await publishToS3(CREDS, noTitle, 'docs/my-spec.html', 'html')

    const body = vi.mocked(PutObjectCommand).mock.calls[0][0].Body as string
    expect(body).toContain('<title>my-spec</title>')
  })

  it('propagates S3 errors', async () => {
    mockSend.mockRejectedValue(new Error('Network failure'))
    await expect(publishToS3(CREDS, spec, 'docs/specs/auth.md', 'md')).rejects.toThrow('Network failure')
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
