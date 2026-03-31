import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient, createSupabaseServiceClient } from '@/lib/db-server'

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { token_id } = await request.json()
  if (!token_id) return NextResponse.json({ error: 'token_id required' }, { status: 400 })

  const serviceClient = createSupabaseServiceClient()

  const { error } = await serviceClient
    .from('project_tokens')
    .update({ revoked: true, revoked_at: new Date().toISOString() })
    .eq('id', token_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
