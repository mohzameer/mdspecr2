import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/db-server'
import { validateS3Credentials } from '@/lib/publish/adapters/s3'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { access_key_id, secret_access_key, bucket, region } = await request.json()

  if (!access_key_id || !secret_access_key || !bucket || !region) {
    return NextResponse.json({ ok: false, error: 'access_key_id, secret_access_key, bucket, and region are required' }, { status: 400 })
  }

  const result = await validateS3Credentials({ access_key_id, secret_access_key, bucket, region })
  return NextResponse.json(result, { status: result.ok ? 200 : 400 })
}
