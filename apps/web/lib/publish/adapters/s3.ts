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
  options: { maintainHierarchy?: boolean; matchedFolder?: string } = {}
): string {
  const prefix = rootPrefix?.replace(/\/$/, '') ?? ''

  let relativePath: string
  if (options.maintainHierarchy && options.matchedFolder) {
    const folderPrefix = options.matchedFolder.replace(/\/$/, '') + '/'
    relativePath = specPath.startsWith(folderPrefix)
      ? specPath.slice(folderPrefix.length)
      : specPath
  } else {
    relativePath = specPath.split('/').pop() ?? specPath
  }

  const path = relativePath.replace(/^\//, '')
  return prefix ? `${prefix}/${path}` : path
}

export async function publishToS3(
  credentials: S3Credentials,
  spec: { path: string; content: string; frontmatter: Record<string, unknown>; resolvedTitle?: string },
  objectKey: string
): Promise<{ page_id: string; page_url: string }> {
  const client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  })

  await client.send(new PutObjectCommand({
    Bucket: credentials.bucket,
    Key: objectKey,
    Body: spec.content,
    ContentType: 'text/markdown',
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
