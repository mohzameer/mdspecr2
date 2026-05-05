import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'
import { readCredentials } from '@/lib/credentials'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ integrationId: string }> }
) {
  const { integrationId } = await params
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: integration } = await supabase
    .from('integrations')
    .select('id, type, status, credentials_secret_id, org_id')
    .eq('id', integrationId)
    .single()

  if (!integration) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', integration.org_id)
    .eq('user_id', user.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (integration.type !== 's3') return NextResponse.json({ error: 'not_s3' }, { status: 400 })
  if (integration.status !== 'connected') return NextResponse.json({ error: 'not_connected' }, { status: 400 })
  if (!integration.credentials_secret_id) return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })

  let credentials: { access_key_id: string; secret_access_key: string; bucket: string; region: string }
  try {
    const plaintext = await readCredentials(createSupabaseServiceClient(), integration.credentials_secret_id)
    credentials = JSON.parse(plaintext)
  } catch {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 500 })
  }

  // Read optional prefix query param to list subfolders of a given prefix
  const prefix = new URL(req.url).searchParams.get('prefix') ?? ''

  const client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  })

  try {
    const folders: string[] = []
    let continuationToken: string | undefined

    do {
      const res = await client.send(new ListObjectsV2Command({
        Bucket: credentials.bucket,
        Prefix: prefix ? `${prefix.replace(/\/$/, '')}/` : '',
        Delimiter: '/',
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }))

      for (const cp of res.CommonPrefixes ?? []) {
        if (cp.Prefix) folders.push(cp.Prefix.replace(/\/$/, ''))
      }

      continuationToken = res.NextContinuationToken
    } while (continuationToken)

    return NextResponse.json(folders)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[s3-folders] ListObjectsV2 failed:', message)
    const isPermission = message.includes('AccessDenied') || message.includes('403')
    return NextResponse.json(
      { error: isPermission ? 'access_denied' : message },
      { status: 502 }
    )
  }
}
