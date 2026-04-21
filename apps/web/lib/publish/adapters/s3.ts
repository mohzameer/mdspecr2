import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'

export interface S3Credentials {
  access_key_id: string
  secret_access_key: string
  bucket: string
  region: string
}

export function buildS3Key(
  specPath: string,
  rootPrefix: string | null | undefined,
  format: 'md' | 'html'
): string {
  const prefix = rootPrefix?.replace(/\/$/, '') ?? ''
  const normalized = format === 'html'
    ? specPath.replace(/\.md$/, '.html')
    : specPath
  const path = normalized.replace(/^\//, '')
  return prefix ? `${prefix}/${path}` : path
}

function mdToHtml(content: string, title: string): string {
  let body = content
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')

  body = `<p>${body}</p>`
  body = body.replace(/<p>(<h[1-3]>)/g, '$1').replace(/(<\/h[1-3]>)<\/p>/g, '$1')
  body = body.replace(/<p>(<li>)/g, '<ul>$1').replace(/(<\/li>)<\/p>/g, '$1</ul>')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>
${body}
</body>
</html>`
}

function resolveTitle(spec: { path: string; frontmatter: Record<string, unknown>; resolvedTitle?: string }): string {
  if (spec.resolvedTitle) return spec.resolvedTitle
  if (typeof spec.frontmatter.title === 'string') return spec.frontmatter.title
  return spec.path.split('/').pop()?.replace(/\.md$/, '') ?? spec.path
}

export async function publishToS3(
  credentials: S3Credentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown>; resolvedTitle?: string },
  objectKey: string,
  format: 'md' | 'html'
): Promise<{ page_id: string; page_url: string }> {
  const client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  })

  const isHtml = format === 'html'
  const body = isHtml ? mdToHtml(spec.content, resolveTitle(spec)) : spec.content
  const contentType = isHtml ? 'text/html' : 'text/markdown'

  await client.send(new PutObjectCommand({
    Bucket: credentials.bucket,
    Key: objectKey,
    Body: body,
    ContentType: contentType,
  }))

  const objectUrl = `https://${credentials.bucket}.s3.${credentials.region}.amazonaws.com/${objectKey}`
  return { page_id: objectKey, page_url: objectUrl }
}

export async function validateS3Credentials(
  credentials: S3Credentials
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  })

  const key = '__mdspec_healthcheck__'
  try {
    await client.send(new PutObjectCommand({
      Bucket: credentials.bucket,
      Key: key,
      Body: 'ok',
      ContentType: 'text/plain',
    }))
    await client.send(new DeleteObjectCommand({ Bucket: credentials.bucket, Key: key }))
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('AccessDenied') || message.includes('403')) {
      return { ok: false, error: 'Access denied. Ensure the key has s3:PutObject and s3:DeleteObject on the bucket.' }
    }
    if (message.includes('NoSuchBucket') || message.includes('404')) {
      return { ok: false, error: `Bucket "${credentials.bucket}" not found in region ${credentials.region}.` }
    }
    if (message.includes('InvalidAccessKeyId') || message.includes('SignatureDoesNotMatch')) {
      return { ok: false, error: 'Invalid credentials. Check your Access Key ID and Secret Access Key.' }
    }
    return { ok: false, error: message }
  }
}
